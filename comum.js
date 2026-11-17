// Utilitários compartilhados entre o popup e a página de opções.

const $ = (s) => document.querySelector(s);

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  for (const f of filhos) if (f != null && f !== false) e.append(f);
  return e;
}

const fmtMB = (mb) => (mb == null ? "—" : mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `${Math.round(mb)} MB`);
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || ""; } };
const ehWeb = (url) => /^https?:/.test(url || "");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const duracao = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? "agora" : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
};
const haQuanto = (ts) => (duracao(ts) === "agora" ? "agora" : `há ${duracao(ts)}`);
