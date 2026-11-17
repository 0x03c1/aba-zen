const $ = (s) => document.querySelector(s);

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const f of filhos) if (f != null) e.append(f);
  return e;
}

const fmtMB = (mb) => (mb == null ? "—" : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);
const host = (url) => { try { return new URL(url).hostname; } catch { return url || ""; } };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ehWeb = (url) => /^https?:/.test(url || "");
const haQuanto = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
};

function desenharRam(estado) {
  const { mem } = estado;
  const barra = $("#barra");
  if (!mem) {
    $("#ram").textContent = `RAM do sistema indisponível neste navegador · medido ${haQuanto(estado.quando)}`;
    barra.hidden = true;
    return;
  }
  const limite = estado.limiteLivre ?? PADRAO.limiteLivre;
  const usada = 100 - mem.livre;
  $("#ram").textContent = `Sistema: ${mem.livre.toFixed(0)}% livre (${mem.livreGB.toFixed(1)} de ${mem.totalGB.toFixed(0)} GB) · medido ${haQuanto(estado.quando)}`;
  barra.hidden = false;
  barra.setAttribute("aria-valuenow", Math.round(usada));
  const span = barra.querySelector("span");
  span.style.width = `${usada}%`;
  // Vermelho = a extensão já está suspendendo; laranja = chegando perto do limite.
  span.style.background = mem.livre < limite ? "var(--perigo)" : mem.livre < limite * 2 ? "var(--alerta)" : "var(--ok)";
}

function detalhes(t) {
  const m = t.medida;
  const det = el("div", { className: "det" });
  if (t.suspensa) det.append(el("span", { textContent: "suspensa" }));
  else if (!m) det.append(el("span", { textContent: ehWeb(t.url) ? "sem dados — recarregue a aba" : "página interna, não medida" }));
  else {
    if (m.heapTotalMB ?? m.heapMB) det.append(el("span", { textContent: `JS ${fmtMB(m.heapTotalMB ?? m.heapMB)}` }));
    det.append(el("span", { textContent: `${(m.elementos / 1000).toFixed(1)} mil elementos` }));
    if (m.framesTerceiros.length)
      det.append(el("span", { className: "tag", title: m.framesTerceiros.join("\n"), textContent: plural(m.framesTerceiros.length, "frame de terceiro", "frames de terceiros") }));
    if (m.cpu >= 5) det.append(el("span", { className: "tag cpu", textContent: `CPU ${m.cpu.toFixed(0)}%` }));
    if (m.videos) det.append(el("span", { textContent: plural(m.videos, "vídeo", "vídeos") }));
    if (t.congelada) det.append(el("span", { title: "Congelada pelo navegador; mostrando a última medida", textContent: "congelada" }));
  }
  for (const motivo of t.motivos ?? []) det.append(el("span", { className: "tag protegida", title: "Não será suspensa automaticamente", textContent: motivo }));

  if (!t.suspensa && !t.ativa && ehWeb(t.url)) {
    const aviso = m?.formularioEditado ? " — atenção: há texto digitado que será perdido" : "";
    const b = el("button", { textContent: "Suspender", title: `Libera a memória; a aba recarrega quando você clicar nela${aviso}` });
    b.onclick = async () => { b.disabled = true; desenhar(await chrome.runtime.sendMessage({ tipo: "suspender", id: t.id })); };
    det.append(b);
  }
  return det;
}

function desenhar(estado) {
  if (!estado) return;
  desenharRam(estado);

  const lista = $("#abas");
  lista.replaceChildren();
  // A própria extensão (popup aberto numa aba) não interessa na lista.
  const abas = estado.abas.filter((t) => !t.url?.startsWith(chrome.runtime.getURL("")));
  if (!abas.length) return lista.append(el("li", { className: "vazio", textContent: "Nenhuma aba." }));

  for (const t of abas) {
    const titulo = el("button", { type: "button", className: "titulo", textContent: t.titulo || host(t.url), title: t.url });
    titulo.onclick = () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.janela, { focused: true }); };

    lista.append(
      el("li", { className: `aba${t.pesada ? " pesada" : ""}${t.suspensa ? " suspensa" : ""}` },
        t.icone && /^(https?|data):/.test(t.icone) ? el("img", { src: t.icone, alt: "" }) : el("span"),
        titulo,
        el("span", { className: "mb", textContent: t.estimativaMB == null ? "—" : `~${fmtMB(t.estimativaMB)}` }),
        detalhes(t))
    );
  }
}

async function carregarHistorico() {
  const { historico = [] } = await chrome.storage.local.get("historico");
  $("#historicoBox").hidden = !historico.length;
  $("#historico").replaceChildren(
    ...historico.map((h) => {
      const hora = new Date(h.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const ram = h.livre == null ? "" : `, RAM livre ${h.livre.toFixed(0)}%`;
      return el("li", { textContent: `${hora} · ${h.titulo || host(h.url)} (~${fmtMB(h.estimativaMB)}${ram})` });
    })
  );
}

function preencher(f, c) {
  for (const [k, v] of Object.entries(c)) {
    const campo = f.elements[k];
    if (!campo) continue;
    if (campo.type === "checkbox") campo.checked = v;
    else campo.value = Array.isArray(v) ? v.join("\n") : v;
  }
}

async function carregarConfig() {
  const f = $("#cfg");
  preencher(f, await lerConfig());
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { config: atual = {} } = await chrome.storage.local.get("config");
    const nova = sanear({
      ...atual,
      automatico: f.elements.automatico.checked,
      protegerFixadas: f.elements.protegerFixadas.checked,
      limiteLivre: f.elements.limiteLivre.value,
      minutosParada: f.elements.minutosParada.value,
      pesadaMB: f.elements.pesadaMB.value,
      cpuPesada: f.elements.cpuPesada.value,
      porCiclo: f.elements.porCiclo.value,
      protegidos: f.elements.protegidos.value.split(/[\s,]+/),
    });
    await chrome.storage.local.set({ config: nova });
    preencher(f, nova); // mostra os domínios já normalizados
    $("#salvo").textContent = "salvo ✓";
    setTimeout(() => ($("#salvo").textContent = ""), 1500);
  };
}

async function atualizar() {
  $("#atualizar").disabled = true;
  try { desenhar(await chrome.runtime.sendMessage({ tipo: "atualizar" })); }
  finally { $("#atualizar").disabled = false; }
}

$("#atualizar").onclick = atualizar;
(async () => {
  const { estado } = await chrome.storage.session.get("estado");
  desenhar(estado);
  carregarHistorico();
  carregarConfig();
  atualizar();
})();
