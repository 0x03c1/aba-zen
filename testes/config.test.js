// Rode com: node --test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// config.js é um script comum de extensão (sem módulos); carregamos num contexto isolado.
const ctx = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8") + ";this.api={PADRAO,sanear,normalizarDominio};", ctx);
const { PADRAO, sanear, normalizarDominio } = ctx.api;

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
  const c = sanear({ pesadaMB: "", limiteLivre: 0, minutosParada: "abc", porCiclo: 99, cpuPesada: 1 });
  assert.equal(c.pesadaMB, PADRAO.pesadaMB);
  assert.equal(c.limiteLivre, PADRAO.limiteLivre);
  assert.equal(c.minutosParada, PADRAO.minutosParada);
  assert.equal(c.porCiclo, 10);
  assert.equal(c.cpuPesada, 5);
});

test("sanear normaliza e deduplica sites protegidos", () => {
  const c = sanear({ protegidos: ["zoom.us", "https://zoom.us/j/1", "www.zoom.us", "", "x y"] });
  assert.deepEqual([...c.protegidos], ["zoom.us"]);
});

test("sanear sem config devolve o padrão", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(sanear(undefined))), JSON.parse(JSON.stringify(PADRAO)));
});
