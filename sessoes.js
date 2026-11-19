// Abas salvas (grupos, como no OneTab) e fotos automáticas da sessão (para
// recuperar abas depois de um travamento ou de uma janela fechada sem querer).
// Só funções puras: quem lê e grava em storage é o background e a página de abas salvas.
// Depende de config.js (ehWeb, abaReal).

const MAX_SESSOES_AUTO = 5;
const MAX_TITULO = 300;
const MAX_ICONE_SALVO = 512; // ícones embutidos (data:) não são guardados: pesariam no storage

const novoId = () => crypto.randomUUID();

const iconeParaSalvar = (i) => (typeof i === "string" && i.length <= MAX_ICONE_SALVO && /^https?:\/\//i.test(i) ? i : "");

// chrome.tabs.Tab -> entrada da foto da sessão, ou null se a aba não deve ser guardada
// (janela anônima ou página que não é http/https).
function entradaDe(aba) {
  if (aba.incognito) return null;
  const real = abaReal(aba);
  if (!ehWeb(real.url)) return null;
  const e = { url: real.url, titulo: String(real.titulo || "").slice(0, MAX_TITULO), janela: aba.windowId, indice: aba.index };
  const icone = iconeParaSalvar(real.icone);
  if (icone) e.icone = icone;
  if (aba.pinned) e.fixada = true;
  if (real.suspensa) e.suspensa = true;
  return e;
}

const fotografar = (abas) => abas.map(entradaDe).filter(Boolean);

// Resumo curto da foto, para não regravar o storage quando nada mudou.
// O título fica de fora de propósito: muda toda hora ("(3) Caixa de entrada").
function assinatura(entradas) {
  let h = 0x811c9dc5;
  for (const e of entradas) {
    const s = `${e.janela}|${e.indice}|${e.fixada ? 1 : 0}|${e.suspensa ? 1 : 0}|${e.titulo ? 1 : 0}|${e.url}\n`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return `${entradas.length}:${h >>> 0}`;
}

// Entradas de `antes` cujo endereço não está mais em `depois`.
function faltando(antes, depois) {
  const abertas = new Set(depois.map((e) => e.url));
  return antes.filter((e) => !abertas.has(e.url));
}

// Sumiram muitas abas de uma vez (janela fechada, travamento)? Então vale guardar a foto anterior.
function perdeuMuitas(antes, depois) {
  const sumiram = faltando(antes, depois);
  if (sumiram.length >= 5 && sumiram.length * 2 >= antes.length) return true;
  // Com centenas de abas, uma janela inteira fechada não chega à metade: conta também.
  const janelas = new Set(depois.map((e) => e.janela));
  return sumiram.filter((e) => !janelas.has(e.janela)).length >= 5;
}

// Põe uma sessão no topo das sessões automáticas (as mais antigas saem).
// motivo: "inicio" (o navegador abriu de novo) ou "queda" (muitas abas sumiram de uma vez).
function arquivar(sessoesAuto, abas, quando, motivo) {
  const lista = Array.isArray(sessoesAuto) ? sessoesAuto : [];
  if (!abas.length) return lista;
  if (lista[0] && assinatura(lista[0].abas) === assinatura(abas)) return lista; // já guardada
  return [{ id: novoId(), quando, motivo, abas }, ...lista].slice(0, MAX_SESSOES_AUTO);
}

// Só o que um grupo salvo guarda de cada aba, sem endereços repetidos.
function abasParaGrupo(entradas) {
  const vistas = new Set();
  const abas = [];
  for (const e of entradas ?? []) {
    if (!e || !ehWeb(e.url) || vistas.has(e.url)) continue;
    try { new URL(e.url); } catch { continue; }
    vistas.add(e.url);
    const a = { url: e.url, titulo: typeof e.titulo === "string" ? e.titulo.slice(0, MAX_TITULO) : "" };
    const icone = iconeParaSalvar(e.icone);
    if (icone) a.icone = icone;
    abas.push(a);
  }
  return abas;
}

// Grupo salvo: { id, nome, criado, abas: [{url, titulo, icone?}] }. null se não sobrar aba.
function novoGrupo(entradas, nome = "", criado = Date.now()) {
  const abas = abasParaGrupo(entradas);
  return abas.length ? { id: novoId(), nome: String(nome || "").slice(0, 80), criado, abas } : null;
}

// Aceita qualquer coisa (arquivo importado, storage antigo) e devolve só grupos válidos.
function validarGrupos(x) {
  const grupos = [];
  const ids = new Set(); // id repetido no arquivo ganharia as ações (excluir, restaurar) do outro grupo
  for (const g of Array.isArray(x) ? x : []) {
    const criado = Number(g?.criado);
    const novo = novoGrupo(g?.abas, typeof g?.nome === "string" ? g.nome : "", Number.isFinite(criado) && criado > 0 ? criado : Date.now());
    if (!novo) continue;
    if (typeof g.id === "string" && /^[\w-]{1,64}$/.test(g.id) && !ids.has(g.id)) novo.id = g.id;
    ids.add(novo.id);
    grupos.push(novo);
  }
  return grupos;
}

// Texto no mesmo formato de exportação do OneTab: "url | título" por linha,
// grupos separados por uma linha em branco.
function exportarTexto(grupos) {
  return grupos.map((g) => g.abas.map((a) => (a.titulo ? `${a.url} | ${a.titulo.replace(/[\r\n]+/g, " ")}` : a.url)).join("\n")).join("\n\n") + "\n";
}

// Lê o formato acima (inclusive o exportado pelo OneTab). Linhas que não são http(s) são ignoradas.
function importarTexto(texto, agora = Date.now()) {
  const grupos = [];
  for (const bloco of String(texto).split(/\r?\n\s*\r?\n/)) {
    const entradas = [];
    for (const linha of bloco.split(/\r?\n/)) {
      const s = linha.trim();
      if (!s) continue;
      const corte = s.indexOf(" | ");
      entradas.push({ url: corte < 0 ? s : s.slice(0, corte), titulo: corte < 0 ? "" : s.slice(corte + 3).trim() });
    }
    const g = novoGrupo(entradas, "", agora);
    if (g) grupos.push(g);
  }
  return grupos;
}

// Aceita o JSON exportado pela extensão ({ grupos: [...] } ou a lista direta) ou o texto "url | título".
function importar(texto, agora = Date.now()) {
  const s = String(texto).trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      const dados = JSON.parse(s);
      return validarGrupos(Array.isArray(dados) ? dados : dados?.grupos);
    } catch {
      return [];
    }
  }
  return importarTexto(s, agora);
}
