// Utilitários compartilhados entre o popup, as opções e a página de abas salvas.
// Depende de config.js (ehWeb, dominio, iconeAceito…), carregado antes.

const $ = (s) => document.querySelector(s);

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const f of filhos) if (f != null && f !== false) e.append(f);
  return e;
}

const fmtMB = (mb) => (mb == null ? "—" : mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `${Math.round(mb)} MB`);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const duracao = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? "agora" : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
};
const haQuanto = (ts) => (duracao(ts) === "agora" ? "agora" : `há ${duracao(ts)}`);
const dataHora = (ts) => new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ---------- Ícones (SVG de traço, desenhados aqui: nada de emoji nem de arquivo externo) ----------

const DESENHOS = {
  pausa: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  tocar: '<path d="M8 5v14l10-7z"/>',
  atualizar: '<path d="M20 11a8 8 0 1 0-2.3 6.2"/><path d="M20 4v7h-7"/>',
  ajustes: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2.5"/><circle cx="9" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/>',
  guardar: '<path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  abrir: '<path d="M12 15V5"/><path d="m8 9 4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  mais: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  escudo: '<path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/>',
  lixeira: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6.5 7l1 13h9l1-13"/>',
  lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
};

// Ícone decorativo: quem dá o nome acessível é o botão (aria-label) ou o texto ao lado.
function svg(nome, tamanho = 16) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({
    viewBox: "0 0 24 24", width: tamanho, height: tamanho, fill: "none", stroke: "currentColor",
    "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: "ic",
  })) s.setAttribute(k, v);
  s.innerHTML = DESENHOS[nome] ?? ""; // texto fixo deste arquivo, nunca dado de fora
  return s;
}

// Botão só com ícone: sempre com nome acessível e dica.
function botaoIcone(nome, rotulo, props = {}) {
  const b = el("button", { type: "button", title: rotulo, ...props }, svg(nome));
  b.classList.add("so-icone");
  b.setAttribute("aria-label", rotulo);
  return b;
}

// ---------- Ícone do site ----------
// No Chromium o próprio navegador entrega o ícone guardado (permissão "favicon"),
// sem nenhuma requisição ao site. Nos outros, usamos o endereço que veio com a aba.
const TEM_FAVICON = (() => {
  try { return !!chrome.runtime.getManifest().permissions?.includes("favicon"); } catch { return false; }
})();

function urlFavicon(pagina, icone) {
  if (TEM_FAVICON && ehWeb(pagina)) return `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(pagina)}&size=32`;
  return iconeAceito(icone) ? icone : "";
}

function favicon(pagina, icone) {
  const src = urlFavicon(pagina, icone);
  if (!src) return el("span", { className: "sem-icone" });
  const img = el("img", { className: "fav", alt: "", loading: "lazy", decoding: "async", width: 16, height: 16, src });
  img.onerror = () => img.replaceWith(el("span", { className: "sem-icone" }));
  return img;
}

// ---------- Ações ----------

// Dois cliques para confirmar (sem diálogos que travam a página). O botão troca de
// texto por 3 s; se o segundo clique não vier, volta ao normal.
function confirmarDuplo(b, textoConfirmar, acao) {
  return async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!b.dataset.confirmando) {
      b.dataset.confirmando = "1";
      const original = [...b.childNodes];
      b.classList.add("confirmar");
      b.replaceChildren(textoConfirmar);
      b._desfazer = () => {
        if (!b.dataset.confirmando) return;
        delete b.dataset.confirmando;
        b.classList.remove("confirmar");
        b.replaceChildren(...original);
      };
      setTimeout(b._desfazer, 3000);
      return;
    }
    b._desfazer();
    b.disabled = true;
    try { await acao(); } finally { b.disabled = false; }
  };
}

// Fala com o background; nunca lança (devolve null se falhar). O motivo da última
// falha fica em `ultimoErro`, para a tela poder dizer o que aconteceu.
let ultimoErro = "";
async function enviar(msg) {
  try {
    // Um background que não conhece o pedido pode nunca responder: não espera para sempre.
    const semResposta = Symbol();
    const r = await Promise.race([chrome.runtime.sendMessage(msg), new Promise((ok) => setTimeout(ok, 30_000, semResposta))]);
    if (r === semResposta) {
      ultimoErro = "o background não respondeu em 30 s";
      return null;
    }
    if (r?.erro) {
      ultimoErro = r.erro;
      return null;
    }
    ultimoErro = r == null ? "o background não reconheceu o pedido" : "";
    return r ?? null;
  } catch (e) {
    ultimoErro = String(e?.message ?? e);
    return null;
  }
}

// A extensão em execução é mesmo a destes arquivos? (Ver VERSAO em config.js.)
function versaoEmExecucao() {
  try { return chrome.runtime.getManifest().version; } catch { return ""; }
}
const extensaoDesatualizada = () => versaoEmExecucao() !== VERSAO;

// Abre (ou foca) uma página da extensão numa aba. Não usa runtime.openOptionsPage():
// ela falha em silêncio em alguns navegadores Chromium (ex.: Arc/Dia).
async function abrirPagina(arquivo, ancora = "") {
  const url = chrome.runtime.getURL(arquivo);
  const [aberta] = (await chrome.tabs.query({})).filter((t) => t.url?.split("#")[0] === url);
  if (aberta) {
    await chrome.tabs.update(aberta.id, ancora ? { active: true, url: url + ancora } : { active: true });
    await chrome.windows.update(aberta.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + ancora });
  }
}

// Aviso curto no rodapé (não rouba o foco; leitores de tela anunciam). Pode ter um botão "Desfazer".
let avisoTimer;
function avisar(texto, rotuloAcao, acao) {
  let caixa = $("#aviso");
  if (!caixa) {
    caixa = el("div", { id: "aviso", className: "aviso" });
    caixa.setAttribute("role", "status");
    caixa.setAttribute("aria-live", "polite");
    document.body.append(caixa);
  }
  const fechar = () => { caixa.hidden = true; caixa.replaceChildren(); };
  caixa.replaceChildren(el("span", { textContent: texto }));
  if (rotuloAcao) {
    const b = el("button", { type: "button", textContent: rotuloAcao });
    b.onclick = async () => { fechar(); await acao(); };
    caixa.append(b);
  }
  caixa.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(fechar, rotuloAcao ? 8000 : 2500);
}
