// Roda no mundo da página (world: MAIN) só para saber se a aba está usando
// câmera, microfone ou compartilhando a tela. Não lê nem envia nada do conteúdo:
// apenas responde "sim/não" ao medidor.js por um evento local do documento.
(() => {
  if (window.__memoriaDasAbasMidia) return;
  window.__memoriaDasAbasMidia = true;

  const fluxos = new Set();
  const md = navigator.mediaDevices;
  if (md) {
    for (const nome of ["getUserMedia", "getDisplayMedia"]) {
      const original = md[nome];
      if (typeof original !== "function") continue;
      md[nome] = function (...args) {
        return original.apply(this, args).then((fluxo) => {
          fluxos.add(fluxo);
          return fluxo;
        });
      };
    }
  }

  const emUso = () => {
    for (const f of fluxos) {
      if (f.getTracks().some((t) => t.readyState === "live")) return true;
      fluxos.delete(f);
    }
    return false;
  };

  document.addEventListener("memoria-das-abas:pergunta", () => {
    document.dispatchEvent(new CustomEvent("memoria-das-abas:resposta", { detail: emUso() }));
  });
})();
