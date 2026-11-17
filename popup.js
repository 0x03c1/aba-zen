// Popup: lista as abas com busca, filtros, ordenação, agrupamento por site e paginação,
// para continuar usável com dezenas de abas abertas.

const POR_PAGINA = 20;

const FILTROS = [
  ["todas", "Todas", () => true],
  ["pesadas", "Pesadas", (t) => t.pesada && !t.suspensa],
  ["abertas", "Abertas", (t) => !t.suspensa],
  ["suspensas", "Suspensas", (t) => t.suspensa],
  ["protegidas", "Protegidas", (t) => t.protegida],
];

const ORDENS = {
  // Abertas primeiro (mais pesadas no topo), depois as suspensas pelo que liberaram.
  mem: (a, b) => a.suspensa - b.suspensa || (b.estimativaMB ?? -1) - (a.estimativaMB ?? -1),
  cpu: (a, b) => a.suspensa - b.suspensa || (b.medida?.cpu ?? -1) - (a.medida?.cpu ?? -1),
  parada: (a, b) => a.ativa - b.ativa || (a.ultimoUso ?? 0) - (b.ultimoUso ?? 0),
};

const ui = { filtro: "todas", ordem: "mem", agrupar: false, busca: "", limite: POR_PAGINA };
let estadoAtual = null;

// Pode ser suspensa manualmente agora (ações em massa respeitam as proteções).
const suspensivel = (t) => !t.suspensa && !t.ativa && !t.tocando && !t.protegida && ehWeb(t.url);

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

function desenharResumo(abas) {
  const abertas = abas.filter((t) => !t.suspensa);
  const emUso = abertas.reduce((s, t) => s + (t.estimativaMB ?? 0), 0);
  const liberado = abas.filter((t) => t.suspensa).reduce((s, t) => s + (t.estimativaMB ?? 0), 0);
  const pesadas = abertas.filter((t) => t.pesada).length;
  $("#resumo").replaceChildren(el("span", {},
    el("b", { textContent: plural(abas.length, "aba", "abas") }),
    pesadas > 0 ? el("span", { className: "perigo", textContent: ` · ${plural(pesadas, "pesada", "pesadas")}` }) : null,
    ` · ~${fmtMB(emUso)} em uso`,
    liberado > 0 ? ` · ~${fmtMB(liberado)} liberados` : null
  ));
}

function desenharFiltros(abas) {
  $("#filtros").replaceChildren(
    ...FILTROS.map(([id, nome, f]) => {
      const n = abas.filter(f).length;
      const b = el("button", { type: "button", className: "chip", textContent: `${nome} ${n}`, disabled: n === 0 && id !== "todas" });
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(ui.filtro === id));
      b.onclick = () => mudar({ filtro: id });
      return b;
    })
  );
}

function detalhes(t) {
  const m = t.medida;
  const det = el("div", { className: "det" });
  if (t.suspensa) {
    det.append(el("span", { textContent: t.estimativaMB ? `suspensa · liberou ~${fmtMB(t.estimativaMB)}` : "suspensa" }));
  } else if (!m) {
    det.append(el("span", { textContent: ehWeb(t.url) ? "sem dados — recarregue a aba" : "página interna, não medida" }));
  } else {
    if (m.heapTotalMB ?? m.heapMB) det.append(el("span", { textContent: `JS ${fmtMB(m.heapTotalMB ?? m.heapMB)}` }));
    det.append(el("span", { textContent: `${(m.elementos / 1000).toFixed(1).replace(".", ",")} mil el.` }));
    if (m.framesTerceiros.length)
      det.append(el("span", { className: "tag", title: m.framesTerceiros.join("\n"), textContent: plural(m.framesTerceiros.length, "frame 3º", "frames 3º") }));
    if (m.cpu >= 5) det.append(el("span", { className: "tag cpu", textContent: `CPU ${m.cpu.toFixed(0)}%` }));
    if (m.videos) det.append(el("span", { textContent: plural(m.videos, "vídeo", "vídeos") }));
    if (t.congelada) det.append(el("span", { title: "Congelada pelo navegador; mostrando a última medida", textContent: "congelada" }));
  }
  if (t.ativa) det.append(el("span", { className: "tag", textContent: "em uso" }));
  else if (t.ultimoUso && !t.suspensa && duracao(t.ultimoUso) !== "agora")
    det.append(el("span", { title: "Tempo desde o último uso", textContent: `parada ${duracao(t.ultimoUso)}` }));
  for (const motivo of t.motivos ?? []) det.append(el("span", { className: "tag protegida", title: "Não será suspensa automaticamente", textContent: motivo }));
  return det;
}

const ICONE_SUSPENDER = "\u23F8\uFE0E"; // ⏸ em versão texto

// Botão de suspender uma aba (fica na mesma linha do título).
function botaoSuspender(t) {
  if (t.suspensa || t.ativa || !ehWeb(t.url)) return el("span");
  const aviso = t.medida?.formularioEditado ? " — atenção: há texto digitado que será perdido" : "";
  const b = el("button", { className: "suspender", textContent: ICONE_SUSPENDER, title: `Suspender: libera a memória; a aba recarrega quando você clicar nela${aviso}` });
  b.setAttribute("aria-label", `Suspender ${t.titulo || host(t.url)}`);
  b.onclick = async () => { b.disabled = true; receber(await chrome.runtime.sendMessage({ tipo: "suspender", id: t.id })); };
  return b;
}

// Dois cliques para confirmar (sem diálogos que travam o popup).
function confirmarDuplo(b, textoConfirmar, acao) {
  return async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!b.dataset.confirmando) {
      b.dataset.confirmando = "1";
      b.dataset.original = b.textContent;
      b.classList.add("confirmar");
      b.textContent = textoConfirmar;
      setTimeout(() => {
        if (!b.dataset.confirmando) return;
        delete b.dataset.confirmando;
        b.classList.remove("confirmar");
        b.textContent = b.dataset.original;
      }, 3000);
      return;
    }
    delete b.dataset.confirmando;
    b.classList.remove("confirmar");
    b.disabled = true;
    try { await acao(); } finally { b.disabled = false; }
  };
}

const suspenderIds = async (ids) => receber(await chrome.runtime.sendMessage({ tipo: "suspenderVarias", ids }));

function linha(t) {
  const titulo = el("button", { type: "button", className: "titulo", textContent: t.titulo || host(t.url), title: t.url });
  titulo.onclick = () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.janela, { focused: true }); };
  return el("li", { className: `aba${t.pesada && !t.suspensa ? " pesada" : ""}${t.suspensa ? " suspensa" : ""}` },
    icone(t.icone),
    titulo,
    el("span", { className: "mb", textContent: t.estimativaMB == null ? "—" : `~${fmtMB(t.estimativaMB)}` }),
    botaoSuspender(t),
    detalhes(t));
}

const icone = (url) => (url && /^(https?|data):/.test(url) ? el("img", { src: url, alt: "", loading: "lazy" }) : el("span", { className: "sem-icone" }));

// Agrupa por site; o grupo herda a ordem da sua aba mais bem colocada.
function agruparPorSite(abas) {
  const grupos = new Map();
  for (const t of abas) {
    const chave = ehWeb(t.url) ? host(t.url) : "Páginas internas";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(t);
  }
  const lista = [...grupos].map(([site, abasDoSite]) => ({
    site,
    abas: abasDoSite,
    mb: abasDoSite.reduce((s, t) => s + (t.suspensa ? 0 : t.estimativaMB ?? 0), 0),
  }));
  // Na ordem por memória, o site que mais pesa no total vem primeiro.
  return ui.ordem === "mem" ? lista.sort((a, b) => b.mb - a.mb) : lista;
}

function grupo({ site, abas }) {
  if (abas.length === 1) return linha(abas[0]);
  const abertas = abas.filter((t) => !t.suspensa);
  const mb = abertas.reduce((s, t) => s + (t.estimativaMB ?? 0), 0);
  const pesada = abertas.some((t) => t.pesada);
  const alvo = abas.filter(suspensivel).map((t) => t.id);
  let acao = el("span");
  if (alvo.length) {
    acao = el("button", { className: "suspender", textContent: ICONE_SUSPENDER, title: `Suspender ${plural(alvo.length, "aba", "abas")} de ${site} (protegidas ficam de fora)` });
    acao.setAttribute("aria-label", `Suspender abas de ${site}`);
    acao.onclick = confirmarDuplo(acao, `${ICONE_SUSPENDER} ${alvo.length}?`, () => suspenderIds(alvo));
  }
  const resumo = el("summary", {},
    icone(abas.find((t) => t.icone)?.icone),
    el("span", { className: "titulo", textContent: site }),
    el("span", { className: "mb", textContent: mb ? `~${fmtMB(mb)}` : "—" }),
    acao,
    el("div", { className: "det" },
      el("span", { textContent: plural(abas.length, "aba", "abas") }),
      abas.length > abertas.length ? el("span", { textContent: `${abas.length - abertas.length} suspensa(s)` }) : null));
  return el("li", { className: `grupo${pesada ? " pesada" : ""}` },
    el("details", {}, resumo, el("ol", {}, ...abas.map(linha))));
}

function desenhar() {
  const estado = estadoAtual;
  if (!estado) return;
  desenharRam(estado);

  // A própria extensão (popup aberto numa aba) não interessa na lista.
  const todas = estado.abas.filter((t) => !t.url?.startsWith(chrome.runtime.getURL("")));
  desenharResumo(todas);
  desenharFiltros(todas);

  const filtro = FILTROS.find(([id]) => id === ui.filtro)?.[2] ?? (() => true);
  const termo = ui.busca.trim().toLowerCase();
  const visiveis = todas
    .filter(filtro)
    .filter((t) => !termo || `${t.titulo} ${t.url}`.toLowerCase().includes(termo))
    .sort(ORDENS[ui.ordem] ?? ORDENS.mem);

  const itens = ui.agrupar ? agruparPorSite(visiveis) : visiveis;
  const lista = $("#abas");
  lista.replaceChildren(...itens.slice(0, ui.limite).map(ui.agrupar ? grupo : linha));
  if (!itens.length) lista.append(el("li", { className: "vazio", textContent: termo ? `Nada encontrado para “${ui.busca.trim()}”.` : "Nenhuma aba aqui." }));

  const resto = itens.length - ui.limite;
  const mais = $("#mais");
  mais.hidden = resto <= 0;
  mais.textContent = `Mostrar mais ${Math.min(resto, POR_PAGINA)} (de ${resto})`;

  // Ação em massa sobre a lista filtrada (inclusive o que não coube na página).
  const alvo = visiveis.filter(suspensivel);
  const b = $("#suspenderLista");
  b.hidden = alvo.length < 2;
  b.dataset.ids = JSON.stringify(alvo.map((t) => t.id));
  if (!b.dataset.confirmando) b.textContent = `${ICONE_SUSPENDER} Suspender ${alvo.length} desta lista`;
}

function receber(estado) {
  if (estado) estadoAtual = estado;
  desenhar();
}

function mudar(parcial) {
  Object.assign(ui, parcial, { limite: POR_PAGINA });
  const { filtro, ordem, agrupar } = ui;
  chrome.storage.local.set({ ui: { filtro, ordem, agrupar } });
  desenhar();
}

const botaoLista = $("#suspenderLista");
botaoLista.onclick = confirmarDuplo(botaoLista, "Confirmar?", () => suspenderIds(JSON.parse(botaoLista.dataset.ids || "[]")));

$("#mais").onclick = () => { ui.limite += POR_PAGINA; desenhar(); };
$("#busca").oninput = (e) => { ui.busca = e.target.value; ui.limite = POR_PAGINA; desenhar(); };
$("#ordem").onchange = (e) => mudar({ ordem: e.target.value });
$("#agrupar").onchange = (e) => mudar({ agrupar: e.target.checked });
// Abre (ou foca) a página de opções numa aba. Não usa runtime.openOptionsPage():
// ela falha em silêncio em alguns navegadores Chromium (ex.: Arc/Dia) e enquanto
// a extensão não é recarregada depois de mudar o manifest.
$("#opcoes").onclick = async () => {
  const url = chrome.runtime.getURL("options.html");
  const [aberta] = (await chrome.tabs.query({})).filter((t) => t.url?.startsWith(url));
  if (aberta) {
    await chrome.tabs.update(aberta.id, { active: true });
    await chrome.windows.update(aberta.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
};

async function atualizar() {
  $("#atualizar").disabled = true;
  try { receber(await chrome.runtime.sendMessage({ tipo: "atualizar" })); }
  finally { $("#atualizar").disabled = false; }
}
$("#atualizar").onclick = atualizar;

(async () => {
  const [{ estado }, { ui: salvo }] = await Promise.all([chrome.storage.session.get("estado"), chrome.storage.local.get("ui")]);
  Object.assign(ui, salvo);
  $("#ordem").value = ui.ordem;
  $("#agrupar").checked = ui.agrupar;
  receber(estado);
  atualizar();
})();
