// Página de opções: configurações e histórico de suspensões automáticas.

function preencher(f, c) {
  for (const [k, v] of Object.entries(c)) {
    const campo = f.elements[k];
    if (!campo) continue;
    if (campo.type === "checkbox") campo.checked = v;
    else campo.value = Array.isArray(v) ? v.join("\n") : v;
  }
}

async function carregarConfig() {
  const f = $("#cfg");
  preencher(f, await lerConfig());
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { config: atual = {} } = await chrome.storage.local.get("config");
    const nova = sanear({
      ...atual,
      automatico: f.elements.automatico.checked,
      protegerFixadas: f.elements.protegerFixadas.checked,
      limiteLivre: f.elements.limiteLivre.value,
      minutosParada: f.elements.minutosParada.value,
      pesadaMB: f.elements.pesadaMB.value,
      cpuPesada: f.elements.cpuPesada.value,
      porCiclo: f.elements.porCiclo.value,
      protegidos: f.elements.protegidos.value.split(/[\s,]+/),
    });
    await chrome.storage.local.set({ config: nova });
    preencher(f, nova); // mostra os domínios já normalizados
    $("#salvo").textContent = "salvo ✓";
    setTimeout(() => ($("#salvo").textContent = ""), 1500);
  };
}

async function carregarHistorico() {
  const { historico = [] } = await chrome.storage.local.get("historico");
  const lista = $("#historico");
  if (!historico.length) return lista.replaceChildren(el("li", { textContent: "Nenhuma ainda." }));
  lista.replaceChildren(
    ...historico.map((h) => {
      const quando = new Date(h.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const ram = h.livre == null ? "" : `, RAM livre ${h.livre.toFixed(0)}%`;
      return el("li", { textContent: `${quando} · ${h.titulo || host(h.url)} (~${fmtMB(h.estimativaMB)}${ram})` });
    })
  );
}

carregarConfig();
carregarHistorico();
chrome.storage.onChanged.addListener((m, area) => area === "local" && m.historico && carregarHistorico());
