// Configuração compartilhada entre o background e o popup.

const PADRAO = {
  automatico: true,
  limiteLivre: 15, // % de RAM livre abaixo do qual começa a suspender
  minutosParada: 10, // só suspende aba sem uso há pelo menos isso
  pesadaMB: 300, // estimativa acima disso conta como "pesada" no ícone
  cpuPesada: 25, // % de CPU (tarefas longas) acima disso também conta
  porCiclo: 2, // máximo de abas suspensas por minuto
  protegerFixadas: true,
  protegidos: ["meet.google.com", "teams.microsoft.com", "teams.live.com", "zoom.us", "web.whatsapp.com"],
};

// Faixas aceitas para cada campo numérico.
const LIMITES = {
  limiteLivre: [3, 60],
  minutosParada: [1, 240],
  pesadaMB: [50, 5000],
  cpuPesada: [5, 100],
  porCiclo: [1, 10],
};

// Aceita "meet.google.com", "https://meet.google.com/abc" ou "*.zoom.us" e devolve só o domínio.
function normalizarDominio(texto) {
  const s = String(texto).trim().toLowerCase().replace(/^\*\./, "");
  if (!s) return "";
  let h;
  try {
    h = new URL(s.includes("://") ? s : `http://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
  // Só aceita algo com cara de domínio (exemplo.com, localhost) — descarta texto solto.
  return /^(localhost|([a-z0-9-]+\.)+[a-z0-9-]{2,})$/.test(h) ? h : "";
}

// Corrige valores vazios, fora da faixa ou de versões antigas.
function sanear(cfg) {
  const c = { ...PADRAO, ...cfg };
  for (const [k, [min, max]] of Object.entries(LIMITES)) {
    const n = Number(c[k]);
    c[k] = Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : PADRAO[k];
  }
  c.automatico = !!c.automatico;
  c.protegerFixadas = !!c.protegerFixadas;
  c.protegidos = [...new Set((Array.isArray(c.protegidos) ? c.protegidos : []).map(normalizarDominio).filter(Boolean))];
  return c;
}

async function lerConfig() {
  const { config } = await chrome.storage.local.get("config");
  return sanear(config);
}
