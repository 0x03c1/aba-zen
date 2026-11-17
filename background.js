// Background: acorda a cada minuto, mede as abas, atualiza o ícone e,
// se a memória do sistema estiver baixa, suspende (discard) as abas paradas mais pesadas.
// Chromium carrega este arquivo como service worker; o Firefox, como script de fundo
// (lá o config.js já vem antes, pela lista "scripts" que ferramentas/empacotar.py
// coloca no manifest do Firefox).
if (typeof importScripts === "function" && typeof PADRAO === "undefined") importScripts("config.js");

// Cada processo extra (frame de outro site) custa algo como 20–40 MB.
const MB_POR_FRAME_TERCEIRO = 25;
const MB_POR_MIL_ELEMENTOS = 1.5;
const MB_BASE_PAGINA = 30;

function estimar(m) {
  if (!m) return null;
  return Math.round(
    MB_BASE_PAGINA +
      (m.heapTotalMB ?? m.heapMB ?? 0) +
      (m.elementos / 1000) * MB_POR_MIL_ELEMENTOS +
      m.framesTerceiros.length * MB_POR_FRAME_TERCEIRO
  );
}

const ehWeb = (url) => /^https?:/.test(url || "");
const host = (url) => {
  try { return new URL(url).hostname; } catch { return ""; }
};
const siteProtegido = (url, lista) => {
  const h = host(url).replace(/^www\./, "");
  return lista.some((d) => h === d || h.endsWith("." + d));
};

function comTempo(promessa, ms) {
  return Promise.race([promessa, new Promise((r) => setTimeout(() => r(null), ms))]);
}

async function medirAba(aba) {
  if (!ehWeb(aba.url) || aba.discarded || aba.status !== "complete") return null;
  try {
    return await comTempo(chrome.tabs.sendMessage(aba.id, { tipo: "medir" }), 2000);
  } catch {
    return null; // aba aberta antes da extensão e sem medidor, ou página restrita
  }
}

// null quando o navegador não expõe a RAM do sistema (ex.: Firefox).
async function memoriaLivre() {
  if (!chrome.system?.memory) return null;
  const { capacity, availableCapacity } = await chrome.system.memory.getInfo();
  return { totalGB: capacity / 2 ** 30, livreGB: availableCapacity / 2 ** 30, livre: (availableCapacity / capacity) * 100 };
}

// Por que a aba não pode ser suspensa automaticamente (lista vazia = pode).
function motivosDeProtecao(aba, m, cfg) {
  const motivos = [];
  if (siteProtegido(aba.url, cfg.protegidos)) motivos.push("site protegido");
  if (cfg.protegerFixadas && aba.pinned) motivos.push("fixada");
  if (aba.autoDiscardable === false) motivos.push("marcada para não descartar");
  if (m?.midia) motivos.push("câmera/microfone/tela");
  if (m?.formularioEditado) motivos.push("texto não enviado");
  return motivos;
}

async function ciclo({ podeSuspender = true } = {}) {
  const cfg = await lerConfig();
  const [abas, mem, { estado: anterior }] = await Promise.all([
    chrome.tabs.query({}),
    memoriaLivre(),
    chrome.storage.session.get("estado"),
  ]);

  // Abas congeladas pelo navegador não respondem; acordá-las só para medir
  // gastaria a memória que queremos poupar. Reaproveitamos a última medida.
  // Nas suspensas, a última medida mostra quanto a suspensão liberou.
  // Ao suspender, o Chromium pode trocar o id da aba; então também casamos pela URL.
  const porId = new Map((anterior?.abas ?? []).map((t) => [t.id, t.medida]));
  const porUrl = new Map();
  for (const t of anterior?.abas ?? []) if (t.medida && !porUrl.has(t.url)) porUrl.set(t.url, t.medida);
  const ultimaMedida = (a) => porId.get(a.id) ?? porUrl.get(a.url) ?? null;
  const medidas = await Promise.all(abas.map((a) => (a.frozen || a.discarded ? ultimaMedida(a) : medirAba(a))));

  const lista = abas.map((a, i) => {
    const m = medidas[i];
    const est = estimar(m);
    const motivos = motivosDeProtecao(a, m, cfg);
    return {
      id: a.id,
      janela: a.windowId,
      titulo: a.title,
      url: a.url,
      icone: a.favIconUrl,
      ativa: a.active,
      fixada: a.pinned,
      tocando: a.audible,
      suspensa: a.discarded,
      congelada: !!a.frozen,
      ultimoUso: a.lastAccessed,
      medida: m,
      estimativaMB: est,
      pesada: !!m && (est >= cfg.pesadaMB || (m.cpu ?? 0) >= cfg.cpuPesada),
      protegida: motivos.length > 0,
      motivos,
    };
  });
  lista.sort((a, b) => (b.estimativaMB ?? -1) - (a.estimativaMB ?? -1));

  // Com RAM conhecida: suspende quando a RAM livre cai abaixo do limite.
  // Sem RAM conhecida (Firefox): suspende só abas pesadas e paradas.
  const apertado = mem ? mem.livre < cfg.limiteLivre : true;
  const suspensasAgora = [];
  if (podeSuspender && cfg.automatico && apertado) {
    const limiteUso = Date.now() - cfg.minutosParada * 60_000;
    const candidatas = lista.filter(
      (t) =>
        t.medida && !t.ativa && !t.tocando && !t.suspensa && !t.protegida &&
        (mem || t.pesada) && (t.ultimoUso ?? 0) < limiteUso
    );
    for (const t of candidatas.slice(0, cfg.porCiclo)) {
      try {
        await chrome.tabs.discard(t.id);
        t.suspensa = true;
        suspensasAgora.push({ quando: Date.now(), titulo: t.titulo, url: t.url, estimativaMB: t.estimativaMB, livre: mem?.livre ?? null });
      } catch {}
    }
  }

  if (suspensasAgora.length) {
    const { historico = [] } = await chrome.storage.local.get("historico");
    await chrome.storage.local.set({ historico: [...suspensasAgora, ...historico].slice(0, 30) });
  }

  const pesadas = lista.filter((t) => t.pesada && !t.suspensa).length;
  await chrome.action.setBadgeText({ text: pesadas ? String(pesadas) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: mem && mem.livre < cfg.limiteLivre ? "#c0392b" : "#d68910" });

  const estado = { quando: Date.now(), mem, limiteLivre: cfg.limiteLivre, abas: lista };
  await chrome.storage.session.set({ estado });
  return estado;
}

// Injeta os scripts nas abas que já estavam abertas antes da instalação/atualização.
async function injetarNasAbasAbertas() {
  for (const aba of await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], discarded: false })) {
    const alvo = { tabId: aba.id };
    chrome.scripting.executeScript({ target: alvo, files: ["midia.js"], world: "MAIN" }).catch(() => {});
    chrome.scripting.executeScript({ target: alvo, files: ["medidor.js"] }).catch(() => {});
  }
}

// Suspensão em massa pedida pelo popup: de novo confere ativa/som/proteções na hora.
async function suspenderVarias(ids) {
  const { estado } = await chrome.storage.session.get("estado");
  const protegidas = new Set((estado?.abas ?? []).filter((t) => t.protegida).map((t) => t.id));
  for (const id of ids) {
    if (protegidas.has(id)) continue;
    try {
      const aba = await chrome.tabs.get(id);
      if (aba.active || aba.audible || aba.discarded || !ehWeb(aba.url)) continue;
      await chrome.tabs.discard(id);
    } catch {}
  }
}

function agendar() {
  chrome.alarms.create("ciclo", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async () => {
  agendar();
  await injetarNasAbasAbertas();
  setTimeout(() => ciclo({ podeSuspender: false }), 1500);
});
chrome.runtime.onStartup.addListener(agendar);
chrome.alarms.onAlarm.addListener((a) => a.name === "ciclo" && ciclo());

// Configuração mudou: atualiza ícone e estado na hora, sem esperar o próximo minuto.
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.config) ciclo({ podeSuspender: false });
});

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  // Só páginas da própria extensão (popup, inclusive aberto numa aba); nunca os scripts das páginas.
  if (remetente.id !== chrome.runtime.id || !remetente.url?.startsWith(chrome.runtime.getURL(""))) return;
  if (msg?.tipo === "atualizar") {
    ciclo({ podeSuspender: false }).then(responder);
    return true;
  }
  if (msg?.tipo === "suspender") {
    chrome.tabs.discard(msg.id).then(() => ciclo({ podeSuspender: false })).then(responder, () => responder(null));
    return true;
  }
  if (msg?.tipo === "suspenderVarias" && Array.isArray(msg.ids)) {
    suspenderVarias(msg.ids.filter(Number.isInteger)).then(() => ciclo({ podeSuspender: false })).then(responder);
    return true;
  }
});
