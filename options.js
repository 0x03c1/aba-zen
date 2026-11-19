// Página de opções: configurações, atalhos e histórico de suspensões automáticas.

const form = $("#cfg");
const numericos = Object.keys(LIMITES);

function preencher(c) {
  for (const [k, v] of Object.entries(c)) {
    const campo = form.elements[k];
    if (!campo) continue;
    if (campo.type === "checkbox") campo.checked = v;
    else campo.value = Array.isArray(v) ? v.join("\n") : v;
  }
}

function dizer(texto) {
  $("#salvo").textContent = texto;
  setTimeout(() => ($("#salvo").textContent = ""), 2500);
}

async function salvar(nova) {
  await chrome.storage.local.set({ config: nova });
  preencher(nova); // mostra os valores já corrigidos (faixas, domínios normalizados)
}

function carregarConfig() {
  // As faixas vêm do config.js, para não ficarem escritas em dois lugares.
  for (const k of numericos) {
    const campo = form.elements[k];
    [campo.min, campo.max] = LIMITES[k];
    campo.title = `De ${LIMITES[k][0]} a ${LIMITES[k][1]}`;
  }
  lerConfig().then(preencher);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { config: atual = {} } = await chrome.storage.local.get("config");
    const lida = { ...atual, v: VERSAO_CONFIG, protegidos: form.elements.protegidos.value.split(/[\s,]+/) };
    for (const k of BOOLEANOS) lida[k] = form.elements[k].checked;
    for (const k of numericos) lida[k] = form.elements[k].value;
    const nova = sanear(lida);
    // Valor fora da faixa não é erro que trave: é corrigido, e avisamos qual foi.
    const corrigidos = numericos.filter((k) => String(nova[k]) !== form.elements[k].value.trim());
    await salvar(nova);
    dizer(corrigidos.length ? "Salvo — valores fora da faixa foram ajustados." : "Salvo.");
    if (corrigidos.length) form.elements[corrigidos[0]].focus();
  };

  const padrao = $("#padrao");
  padrao.onclick = confirmarDuplo(padrao, "Voltar tudo ao padrão?", async () => {
    await salvar(sanear());
    dizer("Padrões restaurados.");
  });
}

async function carregarHistorico() {
  const { historico = [] } = await chrome.storage.local.get("historico");
  const lista = $("#historico");
  if (!historico.length) return lista.replaceChildren(el("li", { className: "sub", textContent: "Nenhuma aba foi suspensa automaticamente ainda." }));
  lista.replaceChildren(
    ...historico.map((h) => {
      const ram = h.livre == null ? "" : ` · RAM livre ${Number(h.livre).toFixed(0)}%`;
      return el("li", {},
        el("span", { className: "quando", textContent: dataHora(h.quando) }),
        el("span", { className: "o-que", textContent: h.titulo || dominio(h.url), title: h.url || "" }),
        el("span", { className: "sub", textContent: `${dominio(h.url)}${ram}` }));
    })
  );
}

async function carregarAtalhos() {
  const lista = $("#atalhos");
  let comandos = [];
  try { comandos = await chrome.commands.getAll(); } catch {}
  comandos = comandos.filter((c) => c.description);
  if (!comandos.length) return lista.replaceChildren(el("li", { className: "sub", textContent: "Nenhum atalho disponível neste navegador." }));
  lista.replaceChildren(
    ...comandos.map((c) => el("li", {}, el("kbd", { textContent: c.shortcut || "sem atalho" }), el("span", { textContent: c.description })))
  );
}

$("#abrirAtalhos").onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {});
$("#verSalvas").onclick = () => abrirPagina("salvas.html");
document.querySelector('a[href="salvas.html"]').onclick = (e) => { e.preventDefault(); abrirPagina("salvas.html"); };

carregarConfig();
carregarHistorico();
carregarAtalhos();
chrome.storage.onChanged.addListener((m, area) => {
  if (area !== "local") return;
  if (m.historico) carregarHistorico();
  // Outra tela mudou a configuração (ex.: "proteger site" no popup): mostra o valor novo,
  // para um "Salvar" aqui não desfazer a mudança.
  if (m.config) preencher(sanear(m.config.newValue));
});
