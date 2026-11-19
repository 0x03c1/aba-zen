// Configuração e utilitários compartilhados por todas as partes da extensão
// (background, popup, opções, abas salvas e a página de aba suspensa).
// Só funções puras e leitura de storage: nada aqui toca em DOM.

const NOME = "Aba Zen";
// Versão destes arquivos. Tem que ser igual à do manifest.json (há um teste para isso).
// Se a extensão em execução tiver outra versão, os arquivos mudaram no disco e ela
// ainda não foi recarregada: o popup avisa, em vez de falhar sem explicação.
const VERSAO = "0.4.0";
const VERSAO_CONFIG = 2;

const PADRAO = {
  v: VERSAO_CONFIG,
  automatico: true,
  minutosParada: 30, // suspende a aba sem uso há pelo menos isso
  limiteLivre: 15, // % de RAM livre abaixo do qual entra o "modo apertado"
  minutosApertado: 5, // no modo apertado, basta a aba estar parada há isso
  porCiclo: 5, // máximo de abas suspensas por minuto
  descartarSuspensas: true, // libera também a memória da própria página de aba suspensa
  protegerFixadas: true,
  pesadaMB: 300, // estimativa acima disso aparece como "pesada" no popup
  cpuPesada: 25, // % de CPU (tarefas longas) acima disso também conta
  salvarFixadas: false, // "salvar abas" inclui as fixadas?
  manterAoRestaurar: false, // restaurar uma aba salva mantém ela na lista?
  restaurarSuspensas: true, // abas restauradas abrem suspensas (carregam ao clicar)
  protegidos: ["meet.google.com", "teams.microsoft.com", "teams.live.com", "zoom.us", "web.whatsapp.com"],
};

// Faixas aceitas para cada campo numérico.
const LIMITES = {
  minutosParada: [1, 1440],
  limiteLivre: [3, 60],
  minutosApertado: [1, 240],
  porCiclo: [1, 20],
  pesadaMB: [50, 5000],
  cpuPesada: [5, 100],
};

const BOOLEANOS = ["automatico", "descartarSuspensas", "protegerFixadas", "salvarFixadas", "manterAoRestaurar", "restaurarSuspensas"];

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
  return /^(localhost|([a-z0-9-]+\.)+[a-z0-9-]{2,}|(\d{1,3}\.){3}\d{1,3})$/.test(h) ? h : "";
}

// Corrige valores vazios, fora da faixa ou de versões antigas.
function sanear(cfg) {
  const entrada = { ...cfg };
  // Antes da v2, "minutosParada" e "porCiclo" valiam só com a memória apertada:
  // o valor antigo não serve para a suspensão por tempo, então volta ao padrão.
  if (entrada.v !== VERSAO_CONFIG) {
    delete entrada.minutosParada;
    delete entrada.porCiclo;
  }
  const c = {};
  for (const k of Object.keys(PADRAO)) c[k] = k in entrada ? entrada[k] : PADRAO[k];
  for (const [k, [min, max]] of Object.entries(LIMITES)) {
    const n = Number(c[k]);
    c[k] = Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : PADRAO[k];
  }
  for (const k of BOOLEANOS) c[k] = !!c[k];
  c.protegidos = [...new Set((Array.isArray(c.protegidos) ? c.protegidos : []).map(normalizarDominio).filter(Boolean))];
  c.v = VERSAO_CONFIG;
  return c;
}

async function lerConfig() {
  const { config } = await chrome.storage.local.get("config");
  return sanear(config);
}

// ---------- Endereços ----------

const ehWeb = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

// Domínio sem "www." ("" quando não é uma URL).
const dominio = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};

const siteProtegido = (url, lista) => {
  const h = dominio(url);
  return !!h && lista.some((d) => h === d || h.endsWith("." + d));
};

// Ícone que aceitamos guardar/mostrar: só http(s) ou imagem embutida, e de tamanho razoável.
const iconeAceito = (i) => typeof i === "string" && i.length <= 2048 && /^(https?:\/\/|data:image\/)/i.test(i);

// ---------- Aba suspensa ----------
// Suspender = trocar o endereço da aba por esta página leve da extensão.
// Tudo o que é preciso para voltar (URL, título, ícone) vai no próprio endereço,
// depois do "#": assim sobrevive a reinício, travamento e restauração de sessão
// do navegador, sem depender de nada guardado em storage.

const PAGINA_SUSPENSA = "suspensa.html";
const baseSuspensa = () => chrome.runtime.getURL(PAGINA_SUSPENSA);

// (base, {url, titulo, icone}) -> endereço da página de aba suspensa.
function montarSuspensa(base, { url, titulo, icone }) {
  const p = new URLSearchParams();
  if (titulo) p.set("t", String(titulo).slice(0, 300));
  if (iconeAceito(icone)) p.set("f", icone);
  p.set("u", url);
  return `${base}#${p}`;
}

// Inverso de montarSuspensa. Devolve null se não for uma aba suspensa nossa
// ou se o destino não for http(s) (nunca devolvemos javascript:, data:, file: etc.).
function lerSuspensa(base, endereco) {
  if (typeof endereco !== "string" || !endereco.startsWith(base + "#")) return null;
  const p = new URLSearchParams(endereco.slice(base.length + 1));
  const url = p.get("u");
  if (!ehWeb(url)) return null;
  try { new URL(url); } catch { return null; }
  const icone = p.get("f");
  return { url, titulo: p.get("t") || "", icone: iconeAceito(icone) ? icone : "" };
}

const urlSuspensa = (dados) => montarSuspensa(baseSuspensa(), dados);

// A "aba de verdade" por trás de um chrome.tabs.Tab: se estiver suspensa,
// devolve o endereço/título/ícone originais. -> { url, titulo, icone, suspensa }
// Durante uma navegação vale o destino (pendingUrl): logo depois de suspender ou
// reativar, a aba já aparece no estado novo, sem esperar a página carregar.
function abaReal(aba) {
  const endereco = aba.pendingUrl || aba.url || "";
  const d = lerSuspensa(baseSuspensa(), endereco);
  if (d) return { url: d.url, titulo: d.titulo || aba.title || "", icone: d.icone, suspensa: true };
  return {
    url: endereco,
    titulo: aba.title || "",
    icone: iconeAceito(aba.favIconUrl) ? aba.favIconUrl : "",
    suspensa: false,
  };
}
