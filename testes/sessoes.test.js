// Rode com: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// sessoes.js depende de config.js; os dois são scripts comuns (sem módulos).
const ctx = vm.createContext({ URL, URLSearchParams, crypto: globalThis.crypto, chrome: { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } } });
const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", nome), "utf8");
vm.runInContext(
  ler("config.js") + "\n" + ler("sessoes.js") +
    ";this.api={urlSuspensa,MAX_SESSOES_AUTO,entradaDe,fotografar,assinatura,faltando,perdeuMuitas,arquivar,abasParaGrupo,novoGrupo,validarGrupos,exportarTexto,importarTexto,importar};",
  ctx
);
const { urlSuspensa, MAX_SESSOES_AUTO, entradaDe, fotografar, assinatura, faltando, perdeuMuitas, arquivar, abasParaGrupo, novoGrupo, validarGrupos, exportarTexto, importarTexto, importar } = ctx.api;
const limpo = (x) => JSON.parse(JSON.stringify(x));

const aba = (url, extra = {}) => ({ url, title: "T " + url, windowId: 1, index: 0, ...extra });
const entradas = (n, prefixo = "https://s.com/") => Array.from({ length: n }, (_, i) => ({ url: prefixo + i, titulo: "t" + i, janela: 1, indice: i }));

test("entradaDe guarda só o necessário", () => {
  assert.deepEqual(limpo(entradaDe(aba("https://a.com/", { index: 3, windowId: 7, favIconUrl: "https://a.com/f.ico" }))), {
    url: "https://a.com/", titulo: "T https://a.com/", janela: 7, indice: 3, icone: "https://a.com/f.ico",
  });
  const fixada = entradaDe(aba("https://a.com/", { pinned: true, favIconUrl: "data:image/png;base64,AAAA" }));
  assert.equal(fixada.fixada, true);
  assert.equal("icone" in fixada, false); // ícone embutido não é guardado
  assert.equal(entradaDe(aba("https://a.com/", { title: "x".repeat(1000) })).titulo.length, 300);
});

test("entradaDe ignora janela anônima e páginas que não são http(s)", () => {
  assert.equal(entradaDe(aba("https://a.com/", { incognito: true })), null);
  for (const u of ["chrome://settings", "about:blank", "file:///x", "chrome-extension://abc/popup.html", "chrome-extension://abc/salvas.html", ""]) assert.equal(entradaDe(aba(u)), null, u);
});

test("entradaDe: aba suspensa entra com o endereço original", () => {
  const e = entradaDe(aba(urlSuspensa({ url: "https://a.com/x", titulo: "Original" })));
  assert.equal(e.url, "https://a.com/x");
  assert.equal(e.titulo, "Original");
  assert.equal(e.suspensa, true);
  assert.equal(entradaDe(aba(urlSuspensa({ url: "https://a.com/x" }), { incognito: true })), null);
});

test("fotografar filtra o que não deve ser guardado", () => {
  const foto = fotografar([aba("https://a.com/"), aba("chrome://newtab/"), aba("https://b.com/", { incognito: true }), aba("https://c.com/")]);
  assert.deepEqual(limpo(foto.map((e) => e.url)), ["https://a.com/", "https://c.com/"]);
});

test("assinatura ignora título e muda com o resto", () => {
  const base = entradas(3);
  const a = assinatura(base);
  assert.equal(a, assinatura(base.map((e) => ({ ...e, titulo: "outro" }))));
  assert.notEqual(a, assinatura(base.slice(0, 2)));
  assert.notEqual(a, assinatura(base.map((e, i) => (i ? e : { ...e, url: "https://s.com/x" }))));
  assert.notEqual(a, assinatura(base.map((e, i) => (i ? e : { ...e, suspensa: true }))));
  assert.notEqual(a, assinatura(base.map((e, i) => (i ? e : { ...e, fixada: true }))));
  assert.notEqual(a, assinatura(base.map((e, i) => (i ? e : { ...e, janela: 2 }))));
  assert.equal(assinatura([]), assinatura([]));
});

test("faltando devolve as entradas cujo endereço sumiu", () => {
  const antes = entradas(4);
  assert.deepEqual(limpo(faltando(antes, [antes[1], antes[3]]).map((e) => e.url)), ["https://s.com/0", "https://s.com/2"]);
  assert.equal(faltando(antes, antes).length, 0);
  assert.equal(faltando([], antes).length, 0);
});

test("perdeuMuitas: pelo menos 5 e pelo menos metade", () => {
  const antes = entradas(10);
  assert.equal(perdeuMuitas(antes, antes.slice(5)), true); // 5 de 10
  assert.equal(perdeuMuitas(antes, antes.slice(4)), false); // só 4
  assert.equal(perdeuMuitas(entradas(20), entradas(20).slice(6)), false); // 6 de 20: menos da metade
  assert.equal(perdeuMuitas(entradas(4), []), false); // menos de 5 abas
  assert.equal(perdeuMuitas(antes, []), true);
  assert.equal(perdeuMuitas(antes, [...antes, ...entradas(3, "https://novo.com/")]), false);
});

test("arquivar põe no topo, não repete e limita a quantidade", () => {
  const s1 = arquivar(undefined, entradas(3), 100, "inicio");
  assert.equal(s1.length, 1);
  assert.equal(s1[0].quando, 100);
  assert.equal(s1[0].motivo, "inicio");
  assert.equal(typeof s1[0].id, "string");
  assert.equal(arquivar(s1, entradas(3), 200, "queda"), s1); // mesma foto: já guardada
  assert.equal(arquivar(s1, [], 200, "queda"), s1); // nada a guardar

  let lista = [];
  for (let i = 1; i <= MAX_SESSOES_AUTO + 3; i++) lista = arquivar(lista, entradas(i), i, "queda");
  assert.equal(lista.length, MAX_SESSOES_AUTO);
  assert.equal(lista[0].quando, MAX_SESSOES_AUTO + 3); // a mais nova fica no topo
});

test("novoGrupo tira repetidas e inválidas e guarda só url/título/ícone", () => {
  const g = novoGrupo(
    [
      { url: "https://a.com/", titulo: "A", janela: 1, indice: 0, fixada: true, suspensa: true, icone: "https://a.com/f.ico" },
      { url: "https://a.com/", titulo: "A de novo" },
      { url: "javascript:alert(1)", titulo: "ruim" },
      { url: "file:///etc/passwd" },
      { url: "https://", titulo: "sem host" },
      null,
      { url: "https://b.com/", icone: "data:image/png;base64,AAAA" },
    ],
    "  Meu grupo",
    123
  );
  assert.equal(g.criado, 123);
  assert.equal(g.nome, "  Meu grupo");
  assert.equal(typeof g.id, "string");
  assert.deepEqual(limpo(g.abas), [
    { url: "https://a.com/", titulo: "A", icone: "https://a.com/f.ico" },
    { url: "https://b.com/", titulo: "" },
  ]);
  assert.equal(novoGrupo([{ url: "chrome://settings" }]), null);
  assert.equal(novoGrupo([]), null);
  assert.equal(novoGrupo(undefined), null);
  assert.equal(abasParaGrupo(null).length, 0);
});

test("validarGrupos aceita só grupos válidos", () => {
  const grupos = validarGrupos([
    { id: "abc-123", nome: "ok", criado: 50, abas: [{ url: "https://a.com/", titulo: "A" }] },
    { id: "<script>", nome: 5, criado: "x", abas: [{ url: "https://b.com/" }] },
    { nome: "vazio", abas: [{ url: "javascript:alert(1)" }] },
    { nome: "sem abas" },
    "lixo",
    null,
  ]);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].id, "abc-123");
  assert.equal(grupos[0].criado, 50);
  assert.notEqual(grupos[1].id, "<script>");
  assert.equal(grupos[1].nome, "");
  assert.ok(grupos[1].criado > 0);
  assert.equal(validarGrupos("lixo").length, 0);
  assert.equal(validarGrupos(undefined).length, 0);
});

test("exportarTexto usa o formato do OneTab", () => {
  const grupos = [
    novoGrupo([{ url: "https://a.com/", titulo: "A | com barra" }, { url: "https://b.com/" }]),
    novoGrupo([{ url: "https://c.com/", titulo: "C" }]),
  ];
  assert.equal(exportarTexto(grupos), "https://a.com/ | A | com barra\nhttps://b.com/\n\nhttps://c.com/ | C\n");
});

test("importarTexto lê uma exportação do OneTab", () => {
  const texto = "https://a.com/x | Título A\r\nhttps://b.com/ | B | com barra\r\n\r\nhttps://c.com/\nnão é url | lixo\njavascript:alert(1) | ruim\n\n\n   \nhttps://d.com/ | D\n";
  const grupos = importarTexto(texto, 999);
  assert.deepEqual(
    limpo(grupos.map((g) => g.abas)),
    [
      [{ url: "https://a.com/x", titulo: "Título A" }, { url: "https://b.com/", titulo: "B | com barra" }],
      [{ url: "https://c.com/", titulo: "" }],
      [{ url: "https://d.com/", titulo: "D" }],
    ]
  );
  assert.ok(grupos.every((g) => g.criado === 999));
  assert.equal(importarTexto("").length, 0);
  assert.equal(importarTexto("só lixo\n\nmais lixo").length, 0);
});

test("exportar e importar: ida e volta (texto e JSON)", () => {
  const grupos = [
    novoGrupo([{ url: "https://a.com/?q=1&r=2#z", titulo: "A" }, { url: "https://b.com/", titulo: "" }], "Um", 10),
    novoGrupo([{ url: "https://c.com/", titulo: "C", icone: "https://c.com/f.ico" }], "Dois", 20),
  ];
  const semIcone = (gs) => limpo(gs.map((g) => g.abas.map(({ url, titulo }) => ({ url, titulo }))));
  assert.deepEqual(semIcone(importar(exportarTexto(grupos))), semIcone(grupos));
  assert.deepEqual(limpo(importar(JSON.stringify({ grupos }))), limpo(grupos));
  assert.deepEqual(limpo(importar(JSON.stringify(grupos))), limpo(grupos));
});

test("importar não quebra com JSON inválido ou malicioso", () => {
  assert.equal(importar("{ não é json").length, 0);
  assert.equal(importar("[1, 2, 3]").length, 0);
  assert.equal(importar('{"grupos": "x"}').length, 0);
  const g = importar(JSON.stringify({ grupos: [{ nome: "x".repeat(500), abas: [{ url: "https://a.com/", titulo: { toString: 1 } }, { url: "data:text/html,x" }] }] }));
  assert.equal(g.length, 1);
  assert.equal(g[0].nome.length, 80);
  assert.equal(g[0].abas.length, 1);
  assert.equal(typeof g[0].abas[0].titulo, "string");
});

test("perdeuMuitas também vale para uma janela inteira fechada entre centenas de abas", () => {
  const aba = (i, janela) => ({ url: `https://exemplo.com/${i}`, titulo: "", janela, indice: i });
  const antes = [...Array.from({ length: 290 }, (_, i) => aba(i, 1)), ...Array.from({ length: 10 }, (_, i) => aba(1000 + i, 2))];
  assert.equal(perdeuMuitas(antes, antes.filter((e) => e.janela === 1)), true);
  assert.equal(perdeuMuitas(antes, antes.slice(3)), false); // três abas fechadas à mão não contam
});

test("validarGrupos não deixa dois grupos com o mesmo id", () => {
  const g = validarGrupos([{ id: "a", abas: [{ url: "https://a.com" }] }, { id: "a", abas: [{ url: "https://b.com" }] }]);
  assert.equal(g.length, 2);
  assert.notEqual(g[0].id, g[1].id);
});
