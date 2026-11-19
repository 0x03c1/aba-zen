// Rode com: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// config.js é um script comum de extensão (sem módulos); carregamos num contexto isolado.
const BASE = "chrome-extension://abc/suspensa.html";
const ctx = vm.createContext({ URL, URLSearchParams, chrome: { runtime: { getURL: (p) => `chrome-extension://abc/${p}` } } });
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8") +
    ";this.api={PADRAO,sanear,normalizarDominio,ehWeb,dominio,siteProtegido,iconeAceito,montarSuspensa,lerSuspensa,urlSuspensa,abaReal};",
  ctx
);
const { PADRAO, sanear, normalizarDominio, ehWeb, dominio, siteProtegido, iconeAceito, montarSuspensa, lerSuspensa, urlSuspensa, abaReal } = ctx.api;
const limpo = (x) => JSON.parse(JSON.stringify(x));

test("normalizarDominio aceita domínio, URL e curinga", () => {
  assert.equal(normalizarDominio("meet.google.com"), "meet.google.com");
  assert.equal(normalizarDominio("https://www.Meet.Google.com/abc-def"), "meet.google.com");
  assert.equal(normalizarDominio("*.zoom.us"), "zoom.us");
  assert.equal(normalizarDominio("localhost:3000"), "localhost");
});

test("normalizarDominio descarta lixo", () => {
  for (const s of ["", "   ", "lixo de texto", "semponto", "http://"]) assert.equal(normalizarDominio(s), "", s);
});

test("sanear troca vazio/zero/NaN pelo padrão e limita faixas", () => {
  const c = sanear({ v: 2, pesadaMB: "", limiteLivre: 0, minutosParada: "abc", minutosApertado: 9999, porCiclo: 99, cpuPesada: 1 });
  assert.equal(c.pesadaMB, PADRAO.pesadaMB);
  assert.equal(c.limiteLivre, PADRAO.limiteLivre);
  assert.equal(c.minutosParada, PADRAO.minutosParada);
  assert.equal(c.minutosApertado, 240);
  assert.equal(c.porCiclo, 20);
  assert.equal(c.cpuPesada, 5);
});

test("sanear: config de antes da v2 perde minutosParada/porCiclo e mantém o resto", () => {
  const c = sanear({ minutosParada: 10, porCiclo: 2, limiteLivre: 20, automatico: false, protegidos: ["exemplo.com"] });
  assert.equal(c.minutosParada, PADRAO.minutosParada);
  assert.equal(c.porCiclo, PADRAO.porCiclo);
  assert.equal(c.limiteLivre, 20);
  assert.equal(c.automatico, false);
  assert.deepEqual(limpo(c.protegidos), ["exemplo.com"]);
  assert.equal(c.v, 2);
});

test("sanear: config v2 mantém os valores, força booleanos e descarta chaves desconhecidas", () => {
  const c = sanear({ v: 2, minutosParada: 45, porCiclo: 3, descartarSuspensas: 0, salvarFixadas: "sim", lixo: 1 });
  assert.equal(c.minutosParada, 45);
  assert.equal(c.porCiclo, 3);
  assert.equal(c.descartarSuspensas, false);
  assert.equal(c.salvarFixadas, true);
  assert.equal("lixo" in c, false);
});

test("sanear normaliza e deduplica sites protegidos", () => {
  const c = sanear({ protegidos: ["zoom.us", "https://zoom.us/j/1", "www.zoom.us", "", "x y"] });
  assert.deepEqual(limpo(c.protegidos), ["zoom.us"]);
});

test("sanear sem config devolve o padrão", () => {
  assert.deepEqual(limpo(sanear(undefined)), limpo(PADRAO));
});

test("ehWeb, dominio e siteProtegido", () => {
  assert.equal(ehWeb("https://a.com"), true);
  assert.equal(ehWeb("HTTP://a.com"), true);
  for (const u of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "chrome://settings", "https:a.com", "", null, undefined, 5]) assert.equal(ehWeb(u), false, String(u));
  assert.equal(dominio("https://www.exemplo.com/x"), "exemplo.com");
  assert.equal(dominio("lixo"), "");
  assert.equal(siteProtegido("https://app.zoom.us/j/1", ["zoom.us"]), true);
  assert.equal(siteProtegido("https://naozoom.us/", ["zoom.us"]), false);
  assert.equal(siteProtegido("about:blank", ["zoom.us"]), false);
});

test("iconeAceito só aceita http(s) e data:image de tamanho razoável", () => {
  assert.equal(iconeAceito("https://a.com/f.ico"), true);
  assert.equal(iconeAceito("data:image/png;base64,AAAA"), true);
  assert.equal(iconeAceito("data:text/html,<script>"), false);
  assert.equal(iconeAceito("javascript:alert(1)"), false);
  assert.equal(iconeAceito("https://a.com/" + "x".repeat(3000)), false);
  assert.equal(iconeAceito(undefined), false);
});

test("montarSuspensa/lerSuspensa: ida e volta, com caracteres difíceis", () => {
  const dados = { url: "https://exemplo.com/a?b=1&c=é#topo", titulo: "Título & <b>coisa</b> = 100% #1", icone: "https://exemplo.com/f.ico" };
  const endereco = montarSuspensa(BASE, dados);
  assert.ok(endereco.startsWith(BASE + "#"));
  assert.deepEqual(limpo(lerSuspensa(BASE, endereco)), dados);
  assert.equal(urlSuspensa(dados), endereco);
});

test("montarSuspensa corta título longo e ignora ícone não aceito", () => {
  const d = lerSuspensa(BASE, montarSuspensa(BASE, { url: "https://a.com/", titulo: "x".repeat(1000), icone: "javascript:alert(1)" }));
  assert.equal(d.titulo.length, 300);
  assert.equal(d.icone, "");
  assert.deepEqual(limpo(lerSuspensa(BASE, montarSuspensa(BASE, { url: "https://a.com/" }))), { url: "https://a.com/", titulo: "", icone: "" });
});

test("lerSuspensa rejeita destinos que não são http(s)", () => {
  for (const u of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "chrome://settings", "about:blank", "https://", ""]) {
    assert.equal(lerSuspensa(BASE, `${BASE}#u=${encodeURIComponent(u)}`), null, u);
    assert.equal(lerSuspensa(BASE, montarSuspensa(BASE, { url: u, titulo: "t" })), null, u);
  }
  assert.equal(lerSuspensa(BASE, `${BASE}#t=semdestino`), null);
});

test("lerSuspensa rejeita outras bases e entradas estranhas", () => {
  const resto = "#u=" + encodeURIComponent("https://a.com/");
  for (const e of [
    "chrome-extension://outra/suspensa.html" + resto,
    "https://site.com/suspensa.html" + resto,
    "chrome-extension://abc/suspensa.htmlx" + resto,
    "chrome-extension://abc/popup.html" + resto,
    BASE + "?u=" + encodeURIComponent("https://a.com/"),
    BASE,
    "",
    null,
    undefined,
    42,
  ]) assert.equal(lerSuspensa(BASE, e), null, String(e));
});

test("lerSuspensa descarta ícone inválido vindo no endereço", () => {
  const d = lerSuspensa(BASE, `${BASE}#f=${encodeURIComponent("javascript:alert(1)")}&u=${encodeURIComponent("https://a.com/")}`);
  assert.deepEqual(limpo(d), { url: "https://a.com/", titulo: "", icone: "" });
});

test("abaReal: aba comum", () => {
  assert.deepEqual(limpo(abaReal({ url: "https://a.com/", title: "A", favIconUrl: "https://a.com/f.ico" })), {
    url: "https://a.com/", titulo: "A", icone: "https://a.com/f.ico", suspensa: false,
  });
  assert.deepEqual(limpo(abaReal({ url: "chrome://newtab/", favIconUrl: "chrome://favicon/x" })), { url: "chrome://newtab/", titulo: "", icone: "", suspensa: false });
  assert.deepEqual(limpo(abaReal({})), { url: "", titulo: "", icone: "", suspensa: false });
});

test("abaReal: aba suspensa devolve os dados originais", () => {
  const dados = { url: "https://a.com/x", titulo: "Original", icone: "https://a.com/f.ico" };
  assert.deepEqual(limpo(abaReal({ url: urlSuspensa(dados), title: "outro" })), { ...dados, suspensa: true });
  // Sem título no endereço, vale o título da aba.
  assert.equal(abaReal({ url: urlSuspensa({ url: "https://a.com/" }), title: "da aba" }).titulo, "da aba");
});

test("abaReal: durante a navegação vale o destino (pendingUrl)", () => {
  const dados = { url: "https://a.com/x", titulo: "T" };
  assert.equal(abaReal({ url: "https://a.com/x", pendingUrl: urlSuspensa(dados) }).suspensa, true); // suspendendo
  const voltando = abaReal({ url: urlSuspensa(dados), pendingUrl: "https://a.com/x", title: "T" }); // reativando
  assert.equal(voltando.suspensa, false);
  assert.equal(voltando.url, "https://a.com/x");
});

test("VERSAO em config.js é a mesma do manifest.json", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.equal(vm.runInContext("VERSAO", ctx), manifest.version);
});
