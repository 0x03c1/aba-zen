// Roda no mundo da página (world: MAIN) só para saber se a aba está usando
// câmera, microfone ou compartilhando a tela. Não lê nem envia nada do conteúdo:
// apenas responde "sim/não" ao medidor.js por um evento local do documento.
(() => {
  if (window.__abaZenMidia) return;
  window.__abaZenMidia = true;

  const fluxos = new Set();
  const md = navigator.mediaDevices;
  if (md) {
    for (const nome of ["getUserMedia", "getDisplayMedia"]) {
      const original = md[nome];
      if (typeof original !== "function") continue;
      md[nome] = function (...args) {
        return original.apply(this, args).then((fluxo) => {
          emUso(); // aproveita para esquecer os fluxos já encerrados
          fluxos.add(fluxo);
          // Avisa na hora que a mídia começou (o medidor repassa ao background uma única vez).
          document.dispatchEvent(new CustomEvent("aba-zen:midia"));
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

  document.addEventListener("aba-zen:pergunta", () => {
    document.dispatchEvent(new CustomEvent("aba-zen:resposta", { detail: emUso() }));
  });
})();
