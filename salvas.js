// Página de abas salvas (grupos, como no OneTab) e de sessões automáticas.
// Lê e grava direto em storage.local; só "restaurar" passa pelo background.
// Feita para milhares de abas: desenha poucos grupos e poucas linhas por vez,
// usa um único ouvinte de clique para as linhas e espera a digitação na busca.

const GRUPOS_POR_VEZ = 30;
const ABAS_POR_GRUPO = 30;

let grupos = [];
let sessoes = [];
let cfg = sanear();
let termo = "";
let limiteGrupos = GRUPOS_POR_VEZ;
const expandidos = new Set(); // grupos em que "mostrar todas" foi pedido
let janelaAtual = null;

const MOTIVOS = { inicio: "navegador reiniciado", queda: "muitas abas fechadas de uma vez" };

// ---------- Storage ----------

// Lê de novo antes de gravar e devolve o que havia, para desfazer. A trava "grupos" é a
// mesma usada pelo background: duas gravações nunca se cruzam (cliques rápidos, ou
// "salvar abas" no meio de uma remoção).
function mudarGrupos(fn) {
  return navigator.locks.request("grupos", async () => {
    const { grupos: atuais } = await chrome.storage.local.get("grupos");
    const antes = validarGrupos(atuais);
    await chrome.storage.local.set({ grupos: fn(antes.map((g) => ({ ...g, abas: [...g.abas] }))).filter((g) => g.abas.length) });
    return antes;
  });
}
// Desfazer devolve só o que foi tirado (grupo ou aba), sem apagar o que entrou depois.
const desfazerPara = (antes) => () =>
  mudarGrupos((agora) => {
    const porId = new Map(agora.map((g) => [g.id, g]));
    antes.forEach((g, i) => {
      const atual = porId.get(g.id);
      if (!atual) return void agora.splice(Math.min(i, agora.length), 0, g);
      const tem = new Set(atual.abas.map((a) => a.url));
      g.abas.forEach((a, j) => tem.has(a.url) || atual.abas.splice(Math.min(j, atual.abas.length), 0, a));
    });
    return agora;
  });

// true só se todas abriram (senão nada sai da lista).
async function restaurar(abas) {
  const r = await enviar({ tipo: "restaurar", abas, janela: janelaAtual });
  const ok = !!r && r.abertas >= Math.min(abas.length, 5000) && abas.length <= 5000;
  if (!r) avisar("Não foi possível abrir as abas. Recarregue a extensão e tente de novo.");
  else if (!ok) avisar(`Só ${r.abertas} de ${abas.length} abas abriram; a lista foi mantida.`);
  return ok;
}

// ---------- Grupos ----------

const combina = (a) => !termo || `${a.titulo} ${a.url}`.toLowerCase().includes(termo);

function linhaAba(a) {
  const li = el("li", { className: "aba" });
  li.dataset.url = a.url;
  const link = el("a", { className: "titulo", href: a.url, textContent: a.titulo || a.url, title: a.url });
  link.dataset.acao = "abrir";
  const tirar = botaoIcone("fechar", `Remover ${a.titulo || a.url} da lista`);
  tirar.dataset.acao = "remover";
  li.append(favicon(a.url, a.icone), link, el("span", { className: "dom", textContent: dominio(a.url) }), tirar);
  return li;
}

function cartaoGrupo(g, abas) {
  const sec = el("section", { className: "grupo" });
  sec.dataset.id = g.id;

  const nome = el("input", { type: "text", className: "nome", value: g.nome, placeholder: "Grupo sem nome", maxLength: 80 });
  nome.setAttribute("aria-label", "Nome do grupo");
  nome.onchange = () => mudarGrupos((gs) => gs.map((x) => (x.id === g.id ? { ...x, nome: nome.value.trim() } : x)));
  nome.onkeydown = (e) => e.key === "Enter" && nome.blur();

  const todas = el("button", { type: "button" }, svg("abrir", 14), "Restaurar tudo");
  todas.onclick = async () => {
    todas.disabled = true;
    if (!(await restaurar(g.abas))) return void (todas.disabled = false);
    if (!cfg.manterAoRestaurar) await mudarGrupos((gs) => gs.filter((x) => x.id !== g.id));
    todas.disabled = false;
    avisar(`${plural(g.abas.length, "aba aberta", "abas abertas")}${cfg.restaurarSuspensas ? " (suspensas: carregam ao clicar)" : ""}.`);
  };
  const excluir = botaoIcone("lixeira", `Excluir o grupo ${g.nome || "sem nome"}`);
  excluir.onclick = confirmarDuplo(excluir, "Excluir?", async () => {
    const antes = await mudarGrupos((gs) => gs.filter((x) => x.id !== g.id));
    avisar("Grupo excluído.", "Desfazer", desfazerPara(antes));
  });

  const filtrado = abas.length !== g.abas.length ? `${abas.length} de ` : "";
  const meta = el("span", { className: "sub meta", textContent: `${dataHora(g.criado)} · ${filtrado}${plural(g.abas.length, "aba", "abas")}` });
  sec.append(el("header", {}, nome, meta, todas, excluir));

  const cabem = expandidos.has(g.id) ? abas.length : ABAS_POR_GRUPO;
  sec.append(el("ol", {}, ...abas.slice(0, cabem).map(linhaAba)));
  if (abas.length > cabem) {
    const mais = el("button", { type: "button", className: "mais", textContent: `Mostrar as outras ${abas.length - cabem}` });
    mais.onclick = () => { expandidos.add(g.id); desenharGrupos(); };
    sec.append(mais);
  }
  return sec;
}

function desenharGrupos() {
  const nAbas = grupos.reduce((s, g) => s + g.abas.length, 0);
  $("#total").textContent = nAbas ? `${plural(nAbas, "aba", "abas")} em ${plural(grupos.length, "grupo", "grupos")}` : "nenhuma aba salva";
  for (const id of ["exportarJson", "exportarTexto"]) $("#" + id).disabled = !nAbas;
  $("#busca").hidden = !nAbas;

  const visiveis = [];
  for (const g of grupos) {
    const abas = termo ? g.abas.filter(combina) : g.abas;
    if (abas.length || (termo && g.nome.toLowerCase().includes(termo))) visiveis.push([g, abas.length ? abas : g.abas]);
  }
  const caixa = $("#grupos");
  caixa.replaceChildren(...visiveis.slice(0, limiteGrupos).map(([g, abas]) => cartaoGrupo(g, abas)));
  if (!visiveis.length) {
    caixa.append(
      nAbas
        ? el("p", { className: "vazio", textContent: `Nada encontrado para “${$("#busca").value.trim()}”.` })
        : el("div", { className: "vazio" },
            el("p", { textContent: "Nenhuma aba salva ainda." }),
            el("p", { className: "sub", textContent: "No painel da extensão, use “Salvar e fechar” para guardar as abas da janela aqui — ou importe uma lista do OneTab." }))
    );
  }
  const resto = visiveis.length - limiteGrupos;
  const mais = $("#maisGrupos");
  mais.hidden = resto <= 0;
  mais.textContent = `Mostrar mais ${Math.min(resto, GRUPOS_POR_VEZ)} grupos (de ${resto})`;
}

// Um ouvinte só para todas as linhas de aba.
$("#grupos").addEventListener("click", async (e) => {
  const alvo = e.target.closest("[data-acao]");
  if (!alvo) return;
  const url = alvo.closest("li")?.dataset.url;
  const id = alvo.closest("section")?.dataset.id;
  const g = grupos.find((x) => x.id === id);
  const aba = g?.abas.find((a) => a.url === url);
  if (!aba) return;
  const tirar = () => mudarGrupos((gs) => gs.map((x) => (x.id === id ? { ...x, abas: x.abas.filter((a) => a.url !== url) } : x)));

  if (alvo.dataset.acao === "remover") {
    const antes = await tirar();
    avisar("Aba removida da lista.", "Desfazer", desfazerPara(antes));
  } else if (alvo.dataset.acao === "abrir") {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return; // deixa o navegador abrir como link comum
    e.preventDefault();
    if ((await restaurar([aba])) && !cfg.manterAoRestaurar) {
      const antes = await tirar();
      avisar("Aba aberta e retirada da lista.", "Desfazer", desfazerPara(antes));
    }
  }
});

// ---------- Sessões automáticas ----------

async function desenharSessoes() {
  const caixa = $("#listaSessoes");
  if (!sessoes.length) return caixa.replaceChildren(el("p", { className: "vazio", textContent: "Nenhuma sessão guardada ainda." }));
  let abertas = [];
  try { abertas = (await chrome.tabs.query({})).map(abaReal); } catch {}

  caixa.replaceChildren(
    ...sessoes.map((s) => {
      const abas = abasParaGrupo(s.abas);
      const perdidas = abasParaGrupo(faltando(s.abas ?? [], abertas));
      const acao = (rotulo, lista, destaque) => {
        const b = el("button", { type: "button", className: destaque ? "primario" : "", textContent: rotulo, disabled: !lista.length });
        b.onclick = async () => {
          b.disabled = true;
          if (await restaurar(lista)) avisar(`${plural(lista.length, "aba aberta", "abas abertas")}.`);
          desenharSessoes();
        };
        return b;
      };
      const guardar = el("button", { type: "button", textContent: "Guardar como grupo", disabled: !abas.length });
      guardar.onclick = async () => {
        const g = novoGrupo(abas, `Sessão de ${dataHora(s.quando)}`);
        if (!g) return;
        await mudarGrupos((gs) => [g, ...gs]);
        avisar("Sessão guardada como grupo.");
        scrollTo({ top: 0 });
      };

      // A lista da sessão só é montada quando alguém abre.
      const ver = el("details", {}, el("summary", { textContent: "Ver as abas" }));
      ver.ontoggle = () => {
        if (!ver.open || ver.querySelector("ol")) return;
        const falta = new Set(perdidas.map((a) => a.url));
        ver.append(el("ol", {}, ...abas.map((a) => el("li", { className: `aba${falta.has(a.url) ? "" : " aberta"}` },
          favicon(a.url, a.icone),
          el("span", { className: "titulo", textContent: a.titulo || a.url, title: a.url }),
          el("span", { className: "dom", textContent: falta.has(a.url) ? dominio(a.url) : "já aberta" })))));
      };

      const faltam = perdidas.length ? `${plural(perdidas.length, "não está aberta", "não estão abertas")}` : "todas abertas";
      return el("section", { className: "grupo sessao" },
        el("header", {},
          el("div", { className: "nome" },
            el("b", { textContent: dataHora(s.quando) }),
            el("span", { className: "sub", textContent: ` · ${MOTIVOS[s.motivo] ?? "sessão anterior"} · ${plural(abas.length, "aba", "abas")} (${faltam})` })),
          acao(`Restaurar o que falta${perdidas.length ? ` (${perdidas.length})` : ""}`, perdidas, true),
          acao("Restaurar tudo", abas),
          guardar),
        ver);
    })
  );
}

// ---------- Exportar / importar ----------

function baixar(nome, tipo, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = el("a", { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
const carimbo = () => new Date().toISOString().slice(0, 10);

$("#exportarJson").onclick = () =>
  baixar(`aba-zen-${carimbo()}.json`, "application/json", JSON.stringify({ app: NOME, formato: 1, exportado: new Date().toISOString(), grupos }, null, 1));
$("#exportarTexto").onclick = () => baixar(`aba-zen-${carimbo()}.txt`, "text/plain", exportarTexto(grupos));

const dlg = $("#dlgImportar");
$("#importar").onclick = () => {
  $("#colado").value = "";
  $("#arquivo").value = "";
  $("#erroImportar").textContent = "";
  dlg.showModal();
};
$("#confirmarImportar").onclick = async () => {
  const arquivo = $("#arquivo").files[0];
  const erro = $("#erroImportar");
  if (arquivo && arquivo.size > 20 * 1024 * 1024) return void (erro.textContent = "Arquivo grande demais (máximo 20 MB).");
  let texto = "";
  try { texto = arquivo ? await arquivo.text() : $("#colado").value; } catch {}
  const novos = importar(texto);
  if (!novos.length) return void (erro.textContent = "Não encontrei nenhum endereço http(s) nesse conteúdo.");
  const antes = await mudarGrupos((gs) => {
    const usados = new Set(gs.map((g) => g.id));
    for (const g of novos) if (usados.has(g.id)) g.id = novoId();
    return [...novos, ...gs];
  });
  dlg.close();
  const n = novos.reduce((s, g) => s + g.abas.length, 0);
  avisar(`${plural(n, "aba importada", "abas importadas")} em ${plural(novos.length, "grupo", "grupos")}.`, "Desfazer", desfazerPara(antes));
};

// ---------- Ligações ----------

let esperaBusca;
$("#busca").oninput = (e) => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(() => {
    termo = e.target.value.trim().toLowerCase();
    limiteGrupos = GRUPOS_POR_VEZ;
    desenharGrupos();
  }, 150);
};
$("#maisGrupos").onclick = () => { limiteGrupos += GRUPOS_POR_VEZ; desenharGrupos(); };
$("#opcoes").onclick = () => abrirPagina("options.html");

// Redesenho adiado enquanto um nome era digitado: faz ao sair do campo.
let redesenhoPendente = false;
document.addEventListener("focusout", (e) => {
  if (!redesenhoPendente || !e.target.classList?.contains("nome")) return;
  redesenhoPendente = false;
  setTimeout(desenharGrupos, 0); // depois do "change" do próprio campo
});

chrome.storage.onChanged.addListener((m, area) => {
  if (area !== "local") return;
  if (m.config) cfg = sanear(m.config.newValue);
  if (m.grupos) {
    grupos = validarGrupos(m.grupos.newValue);
    // Não redesenha por cima de um nome que está sendo digitado.
    if (!document.activeElement?.classList.contains("nome")) desenharGrupos();
    else redesenhoPendente = true;
  }
  if (m.sessoesAuto) {
    sessoes = Array.isArray(m.sessoesAuto.newValue) ? m.sessoesAuto.newValue : [];
    desenharSessoes();
  }
});

(async () => {
  const [local, janela] = await Promise.all([
    chrome.storage.local.get(["grupos", "sessoesAuto", "config"]),
    chrome.windows.getCurrent().catch(() => null),
  ]);
  grupos = validarGrupos(local.grupos);
  sessoes = Array.isArray(local.sessoesAuto) ? local.sessoesAuto : [];
  cfg = sanear(local.config);
  janelaAtual = janela?.id ?? null;
  desenharGrupos();
  await desenharSessoes();
  if (location.hash === "#sessoes") $("#sessoes").scrollIntoView();
})();
