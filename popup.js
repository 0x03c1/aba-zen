// Popup: ações rápidas (suspender, salvar e fechar), aviso de recuperação e a lista
// das abas com busca, filtros, ordenação, agrupamento por site e paginação.
// Abre desenhando o último estado guardado e só depois pede uma medição nova.

const POR_PAGINA = 20;

const FILTROS = [
  ["todas", "Todas", () => true],
  ["abertas", "Abertas", (t) => !t.suspensa],
  ["suspensas", "Suspensas", (t) => t.suspensa],
  ["pesadas", "Pesadas", (t) => t.pesada && !t.suspensa],
  ["protegidas", "Protegidas", (t) => t.protegida],
];

const ORDENS = {
  // Abertas primeiro (mais pesadas no topo), depois as suspensas pelo que liberaram.
  mem: (a, b) => a.suspensa - b.suspensa || (b.estimativaMB ?? -1) - (a.estimativaMB ?? -1),
  cpu: (a, b) => a.suspensa - b.suspensa || (b.medida?.cpu ?? -1) - (a.medida?.cpu ?? -1),
  parada: (a, b) => a.ativa - b.ativa || (a.ultimoUso ?? 0) - (b.ultimoUso ?? 0),
};

const ui = { filtro: "todas", ordem: "mem", agrupar: false, busca: "", limite: POR_PAGINA, aberta: null };
let estadoAtual = null;
let cfg = sanear();
let janelaAtual = null; // id da janela onde o popup foi aberto
let nSalvas = 0;
let recuperacao = { sessao: null, dispensada: null };

const PAGINA_PROPRIA = chrome.runtime.getURL("");
const abasDoEstado = () => (estadoAtual?.abas ?? []).filter((t) => !t.url?.startsWith(PAGINA_PROPRIA));

// Pode ser suspensa em massa agora (o background confere tudo de novo na hora).
const suspensivel = (t) => !t.suspensa && !t.ativa && !t.tocando && !t.protegida && !t.poupada && ehWeb(t.url);
const abaDaVez = () => abasDoEstado().find((t) => t.ativa && t.janela === janelaAtual) ?? null;

function receber(estado) {
  if (estado?.abas) estadoAtual = estado;
  desenhar();
}
const suspender = async (ids, forcar = false) => receber(await enviar({ tipo: "suspender", ids, forcar }));
const reativar = async (ids) => receber(await enviar({ tipo: "reativar", ids }));

// Diz o que deu errado em vez de fechar o popup em silêncio. true = falhou.
function falhouAoSalvar(r, esperadas) {
  if (!r) avisar(`Não foi possível salvar: ${ultimoErro || "sem resposta"}.`);
  else if (!r.grupo) avisar("Nenhuma aba para salvar aqui (páginas internas e abas fixadas ficam de fora).");
  else if (r.fechadas === 0) avisar(`${plural(r.grupo.abas.length, "aba salva", "abas salvas")}, mas o navegador não deixou fechar.`);
  else return false;
  atualizar();
  return true;
}

// ---------- Topo ----------

function desenharRam(estado) {
  const { mem } = estado;
  const barra = $("#barra");
  const parada = estado.minutosParada ?? cfg.minutosParada;
  const regra = cfg.automatico ? `suspende após ${parada} min sem uso` : "suspensão automática desligada";
  if (!mem) {
    $("#ram").textContent = regra;
    barra.hidden = true;
    return;
  }
  const limite = estado.limiteLivre ?? cfg.limiteLivre;
  $("#ram").textContent = `RAM ${mem.livre.toFixed(0)}% livre · ${regra}`;
  $("#ram").title = `${mem.livreGB.toFixed(1).replace(".", ",")} GB livres de ${mem.totalGB.toFixed(0)} GB. Abaixo de ${limite}% livre, as abas são suspensas mais cedo.`;
  const usada = 100 - mem.livre;
  barra.hidden = false;
  barra.setAttribute("aria-valuenow", Math.round(usada));
  const span = barra.querySelector("span");
  span.style.width = `${usada}%`;
  // Vermelho = modo apertado (suspende mais cedo); laranja = chegando perto.
  span.style.background = mem.livre < limite ? "var(--perigo)" : mem.livre < limite * 2 ? "var(--alerta)" : "var(--ok)";
}

function rotular(b, icone, texto) {
  if (!b.dataset.confirmando) b.replaceChildren(svg(icone), texto);
}

function desenharRapidas(abas) {
  const atual = abaDaVez();
  const esta = $("#estaAba");
  esta.disabled = !atual || !ehWeb(atual.url);
  if (atual?.suspensa) {
    rotular(esta, "tocar", "Reativar esta");
    esta.title = "Carrega esta aba de novo";
    esta.onclick = () => reativar([atual.id]);
  } else {
    rotular(esta, "pausa", "Suspender esta");
    const aviso = atual?.medida?.formularioEditado ? " Atenção: há texto digitado que será perdido." : "";
    esta.title = `Suspende a aba atual: libera a memória e ela só recarrega quando você clicar na página.${aviso}`;
    esta.onclick = () => atual && suspender([atual.id], true);
  }

  const alvo = abas.filter((t) => suspensivel(t) && t.id !== atual?.id).map((t) => t.id);
  const outras = $("#outras");
  outras.disabled = alvo.length === 0;
  rotular(outras, "lua", `Suspender outras${alvo.length ? ` (${alvo.length})` : ""}`);
  outras.onclick = confirmarDuplo(outras, `Suspender ${alvo.length}?`, () => suspender(alvo));

  const daJanela = abas.filter((t) => t.janela === janelaAtual && ehWeb(t.url) && !t.anonima && (cfg.salvarFixadas || !t.fixada));
  const salvar = $("#salvarJanela");
  salvar.disabled = daJanela.length === 0;
  rotular(salvar, "guardar", "Salvar e fechar");
  // Um clique só, como no OneTab: nada se perde (as abas ficam em "Abas salvas").
  salvar.onclick = async () => {
    salvar.disabled = true;
    const r = await enviar({ tipo: "salvar", escopo: "janela", janela: janelaAtual, fechar: true });
    if (falhouAoSalvar(r, daJanela.length)) return void (salvar.disabled = false);
    window.close();
  };

  rotular($("#salvas"), "lista", `Abas salvas${nSalvas ? ` (${nSalvas})` : ""}`);
}

// Aviso: a sessão anterior tinha abas que não estão abertas agora.
function desenharRecuperacao(abas) {
  const caixa = $("#recuperar");
  const { sessao, dispensada } = recuperacao;
  const perdidas = sessao && sessao.id !== dispensada && estadoAtual ? abasParaGrupo(faltando(sessao.abas ?? [], abas)) : [];
  if (!perdidas.length) return void (caixa.hidden = true);

  const dispensar = () => chrome.storage.local.set({ recuperacaoDispensada: sessao.id });
  const restaurar = el("button", { type: "button", className: "primario", textContent: "Restaurar" });
  restaurar.onclick = async () => {
    restaurar.disabled = true;
    await enviar({ tipo: "restaurar", abas: perdidas, janela: janelaAtual });
    await dispensar();
    atualizar();
  };
  const ver = el("button", { type: "button", textContent: "Ver" });
  ver.onclick = async () => { await abrirPagina("salvas.html", "#sessoes"); window.close(); };
  const fechar = el("button", { type: "button", textContent: "Dispensar" });
  fechar.onclick = dispensar;

  const texto = perdidas.length === 1 ? "1 aba da sessão anterior não voltou" : `${perdidas.length} abas da sessão anterior não voltaram`;
  caixa.replaceChildren(el("span", { textContent: texto }), el("div", { className: "botoes" }, restaurar, ver, fechar));
  caixa.hidden = false;
}

function desenharResumo(abas) {
  const abertas = abas.filter((t) => !t.suspensa);
  const suspensas = abas.length - abertas.length;
  const emUso = abertas.reduce((s, t) => s + (t.estimativaMB ?? 0), 0);
  const liberado = abas.filter((t) => t.suspensa).reduce((s, t) => s + (t.estimativaMB ?? 0), 0);
  const pesadas = abertas.filter((t) => t.pesada).length;
  $("#resumo").replaceChildren(
    el("b", { textContent: plural(abas.length, "aba", "abas") }),
    suspensas ? ` · ${plural(suspensas, "suspensa", "suspensas")}` : null,
    pesadas ? el("span", { className: "perigo", textContent: ` · ${plural(pesadas, "pesada", "pesadas")}` }) : null,
    emUso ? ` · ~${fmtMB(emUso)} em uso` : null,
    liberado ? ` · ~${fmtMB(liberado)} liberados` : null
  );
}

function desenharFiltros(abas) {
  $("#filtros").replaceChildren(
    ...FILTROS.map(([id, nome, f]) => {
      const n = abas.filter(f).length;
      const b = el("button", { type: "button", className: "chip", textContent: `${nome} ${n}`, disabled: n === 0 && id !== "todas" && ui.filtro !== id });
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(ui.filtro === id));
      b.onclick = () => mudar({ filtro: id });
      return b;
    })
  );
}

// ---------- Linhas ----------

function detalhes(t) {
  const m = t.medida;
  const det = el("div", { className: "det" });
  const item = (textContent, className = "", title = "") => det.append(el("span", { textContent, className, title }));
  if (t.suspensa) {
    item(t.estimativaMB ? `suspensa · liberou ~${fmtMB(t.estimativaMB)}` : "suspensa");
  } else if (t.descartada) {
    item("descartada pelo navegador", "", "O navegador liberou a memória desta aba; ela recarrega ao ser visitada");
  } else if (!m) {
    item(ehWeb(t.url) ? "sem medição" : "página interna");
  } else {
    if (m.heapTotalMB ?? m.heapMB) item(`JS ${fmtMB(m.heapTotalMB ?? m.heapMB)}`);
    item(`${(m.elementos / 1000).toFixed(1).replace(".", ",")} mil el.`);
    if (m.framesTerceiros?.length) item(plural(m.framesTerceiros.length, "frame 3º", "frames 3º"), "tag", m.framesTerceiros.join("\n"));
    if (m.cpu >= 5) item(`CPU ${m.cpu.toFixed(0)}%`, "tag cpu");
    if (m.videos) item(plural(m.videos, "vídeo", "vídeos"));
    if (t.congelada) item("congelada", "", "Congelada pelo navegador; mostrando a última medida");
  }
  if (t.ativa) item("em uso", "tag");
  else if (t.ultimoUso && !t.suspensa && duracao(t.ultimoUso) !== "agora") item(`parada ${duracao(t.ultimoUso)}`, "", "Tempo desde o último uso");
  if (t.poupada) item("não suspender", "tag protegida", "Você pediu para não suspender esta aba");
  for (const motivo of t.motivos ?? []) item(motivo, "tag protegida", "Não será suspensa automaticamente");
  return det;
}

// Botão principal da linha: suspender ou reativar.
function botaoPrincipal(t) {
  const nome = t.titulo || dominio(t.url);
  if (!ehWeb(t.url)) return el("span");
  if (t.suspensa) {
    const b = botaoIcone("tocar", `Reativar ${nome}`);
    b.onclick = () => { b.disabled = true; reativar([t.id]); };
    return b;
  }
  const aviso = t.medida?.formularioEditado ? " — atenção: há texto digitado que será perdido" : "";
  const b = botaoIcone("pausa", `Suspender ${nome}`, { title: `Suspender: libera a memória; a aba só recarrega quando você clicar nela${aviso}` });
  b.onclick = () => { b.disabled = true; suspender([t.id], true); };
  return b;
}

async function alternarProtecao(site, proteger) {
  const atual = await lerConfig();
  const protegidos = proteger ? [...atual.protegidos, site] : atual.protegidos.filter((d) => d !== site);
  cfg = sanear({ ...atual, protegidos });
  await chrome.storage.local.set({ config: cfg });
  atualizar();
}

// Ações menos usadas da linha (aparecem ao abrir o "mais").
function maisAcoes(t) {
  const site = dominio(t.url);
  const protegido = cfg.protegidos.includes(site);
  const salvar = el("button", { type: "button", disabled: !!t.anonima, title: "Guarda em Abas salvas e fecha a aba" }, svg("guardar", 14), "Salvar e fechar");
  salvar.onclick = async () => {
    salvar.disabled = true;
    const r = await enviar({ tipo: "salvar", escopo: "ids", ids: [t.id], fechar: true });
    if (falhouAoSalvar(r, 1)) return void (salvar.disabled = false);
    ui.aberta = null;
    atualizar();
  };
  const proteger = el("button", { type: "button", title: protegido ? `Voltar a suspender abas de ${site}` : `Nunca suspender abas de ${site} automaticamente` },
    svg("escudo", 14), protegido ? "Desproteger site" : "Proteger site");
  proteger.setAttribute("aria-pressed", String(protegido));
  proteger.onclick = () => { proteger.disabled = true; alternarProtecao(site, !protegido); };
  const poupar = el("button", { type: "button", title: "Vale até a aba ser fechada ou o navegador reiniciar" },
    svg("lua", 14), t.poupada ? "Voltar a suspender" : "Não suspender esta aba");
  poupar.setAttribute("aria-pressed", String(!!t.poupada));
  poupar.onclick = async () => { poupar.disabled = true; receber(await enviar({ tipo: "poupar", id: t.id, valor: !t.poupada })); };
  return el("div", { className: "extra" }, salvar, proteger, poupar);
}

function linha(t) {
  const nome = t.titulo || dominio(t.url) || t.url;
  const titulo = el("button", { type: "button", className: "titulo", textContent: nome, title: t.url });
  titulo.onclick = () => { chrome.tabs.update(t.id, { active: true }); chrome.windows.update(t.janela, { focused: true }); };
  const li = el("li", { className: `aba${t.pesada && !t.suspensa ? " pesada" : ""}${t.suspensa ? " suspensa" : ""}` },
    favicon(t.url, t.icone),
    titulo,
    el("span", { className: "mb", textContent: t.estimativaMB == null ? "" : `~${fmtMB(t.estimativaMB)}` }),
    botaoPrincipal(t));
  if (ehWeb(t.url)) {
    const aberta = ui.aberta === t.id;
    const mais = botaoIcone("mais", `Mais ações para ${nome}`);
    mais.setAttribute("aria-expanded", String(aberta));
    mais.onclick = () => { ui.aberta = aberta ? null : t.id; desenhar(); };
    li.append(mais, detalhes(t));
    if (aberta) li.append(maisAcoes(t));
  } else {
    li.append(el("span"), detalhes(t));
  }
  return li;
}

// Agrupa por site; o grupo herda a ordem da sua aba mais bem colocada.
function agruparPorSite(abas) {
  const grupos = new Map();
  for (const t of abas) {
    const chave = ehWeb(t.url) ? dominio(t.url) : "Páginas internas";
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

function grupo({ site, abas, mb }) {
  if (abas.length === 1) return linha(abas[0]);
  const suspensas = abas.filter((t) => t.suspensa).length;
  const pesada = abas.some((t) => t.pesada && !t.suspensa);
  const alvo = abas.filter(suspensivel).map((t) => t.id);
  let acao = el("span");
  if (alvo.length) {
    acao = botaoIcone("pausa", `Suspender ${plural(alvo.length, "aba", "abas")} de ${site} (protegidas ficam de fora)`);
    acao.onclick = confirmarDuplo(acao, `Suspender ${alvo.length}?`, () => suspender(alvo));
  }
  const resumo = el("summary", {},
    favicon(abas[0].url, abas.find((t) => t.icone)?.icone),
    el("span", { className: "titulo", textContent: site }),
    el("span", { className: "mb", textContent: mb ? `~${fmtMB(mb)}` : "" }),
    acao,
    el("span"),
    el("div", { className: "det" },
      el("span", { textContent: plural(abas.length, "aba", "abas") }),
      suspensas ? el("span", { textContent: plural(suspensas, "suspensa", "suspensas") }) : null));
  const det = el("details", {}, resumo, el("ol", {}, ...abas.map(linha)));
  det.open = abas.some((t) => t.id === ui.aberta);
  return el("li", { className: `grupo${pesada ? " pesada" : ""}` }, det);
}

function desenhar() {
  const estado = estadoAtual;
  if (!estado) return;
  desenharRam(estado);

  const todas = abasDoEstado();
  desenharRapidas(todas);
  desenharRecuperacao(todas);
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
  if (!itens.length) lista.append(el("li", { className: "vazio", textContent: termo ? `Nada encontrado para “${ui.busca.trim()}”.` : "Nenhuma aba neste filtro." }));

  const resto = itens.length - ui.limite;
  const mais = $("#mais");
  mais.hidden = resto <= 0;
  mais.textContent = `Mostrar mais ${Math.min(resto, POR_PAGINA)} (de ${resto})`;

  // Ação em massa sobre a lista filtrada (inclusive o que não coube na página).
  const alvo = visiveis.filter(suspensivel);
  const b = $("#suspenderLista");
  b.hidden = alvo.length < 2 || (ui.filtro === "todas" && !termo); // sem filtro, o botão do topo já faz isso
  b.dataset.ids = JSON.stringify(alvo.map((t) => t.id));
  if (!b.dataset.confirmando) b.replaceChildren(svg("pausa", 14), `Suspender ${alvo.length} desta lista`);
}

function mudar(parcial) {
  Object.assign(ui, parcial, { limite: POR_PAGINA });
  const { filtro, ordem, agrupar } = ui;
  chrome.storage.local.set({ ui: { filtro, ordem, agrupar } });
  desenhar();
}

// ---------- Ligações ----------

const botaoLista = $("#suspenderLista");
botaoLista.onclick = confirmarDuplo(botaoLista, "Confirmar?", () => suspender(JSON.parse(botaoLista.dataset.ids || "[]")));

$("#mais").onclick = () => { ui.limite += POR_PAGINA; desenhar(); };
let esperaBusca;
$("#busca").oninput = (e) => {
  clearTimeout(esperaBusca);
  esperaBusca = setTimeout(() => { ui.busca = e.target.value; ui.limite = POR_PAGINA; desenhar(); }, 80);
};
$("#ordem").onchange = (e) => mudar({ ordem: e.target.value });
$("#agrupar").onchange = (e) => mudar({ agrupar: e.target.checked });
$("#salvas").onclick = async () => { await abrirPagina("salvas.html"); window.close(); };

const botaoAtualizar = botaoIcone("atualizar", "Medir as abas agora");
const botaoOpcoes = botaoIcone("ajustes", "Configurações e histórico");
botaoOpcoes.onclick = async () => { await abrirPagina("options.html"); window.close(); };
$("#acoesTopo").append(botaoAtualizar, botaoOpcoes);

async function atualizar() {
  botaoAtualizar.disabled = true;
  try { receber(await enviar({ tipo: "atualizar" })); } finally { botaoAtualizar.disabled = false; }
}
botaoAtualizar.onclick = atualizar;

const contarSalvas = (grupos) => (Array.isArray(grupos) ? grupos.reduce((s, g) => s + (g?.abas?.length ?? 0), 0) : 0);

chrome.storage.onChanged.addListener((m, area) => {
  if (area !== "local") return;
  if (m.grupos) nSalvas = contarSalvas(m.grupos.newValue);
  if (m.sessoesAuto) recuperacao.sessao = m.sessoesAuto.newValue?.[0] ?? null;
  if (m.recuperacaoDispensada) recuperacao.dispensada = m.recuperacaoDispensada.newValue ?? null;
  if (m.config) cfg = sanear(m.config.newValue);
  if (m.grupos || m.sessoesAuto || m.recuperacaoDispensada || m.config) desenhar();
});

(async () => {
  const [{ estado }, local, janela] = await Promise.all([
    chrome.storage.session.get("estado"),
    chrome.storage.local.get(["ui", "config", "grupos", "sessoesAuto", "recuperacaoDispensada"]),
    chrome.windows.getCurrent().catch(() => null),
  ]);
  const { filtro, ordem, agrupar } = local.ui ?? {};
  if (FILTROS.some(([id]) => id === filtro)) ui.filtro = filtro;
  if (ordem in ORDENS) ui.ordem = ordem;
  ui.agrupar = !!agrupar;
  cfg = sanear(local.config);
  janelaAtual = janela?.id ?? null;
  nSalvas = contarSalvas(local.grupos);
  recuperacao = { sessao: local.sessoesAuto?.[0] ?? null, dispensada: local.recuperacaoDispensada ?? null };
  $("#ordem").value = ui.ordem;
  $("#agrupar").checked = ui.agrupar;
  desenharRapidas([]); // rótulos dos botões já na primeira pintura
  receber(estado);
  atualizar();
})();

// Descartar uma aba suspensa pode trocar o id dela (Chromium): refaz a lista para os
// botões não apontarem para um id que não existe mais.
chrome.tabs.onReplaced.addListener(() => enviar({ tipo: "atualizar" }).then(receber).catch(() => {}));

// Os arquivos mudaram no disco, mas o navegador ainda roda a versão carregada antes
// (acontece ao atualizar uma extensão "sem compactação"): o background antigo não
// conhece os pedidos novos. Avisa e oferece recarregar.
if (extensaoDesatualizada()) {
  const recarregar = el("button", { type: "button", className: "primario", textContent: "Recarregar a extensão" });
  recarregar.onclick = () => chrome.runtime.reload();
  const caixa = $("#desatualizada");
  caixa.replaceChildren(
    el("span", { textContent: `A extensão em execução é a versão ${versaoEmExecucao() || "antiga"}, mas os arquivos são da ${VERSAO}. Recarregue para os botões funcionarem.` }),
    el("div", { className: "botoes" }, recarregar)
  );
  caixa.hidden = false;
}
