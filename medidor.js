// Roda dentro de cada página (só no frame principal). Não envia nada para fora:
// apenas responde quando o background da extensão pede uma medição.
(() => {
  // Se a extensão foi recarregada/atualizada, a cópia antiga deste script fica
  // "órfã" (sem contexto). Nesse caso deixamos a nova cópia se instalar.
  const anterior = globalThis.__memoriaDasAbas;
  if (anterior?.vivo()) return;
  anterior?.parar();

  const runtime = chrome.runtime;
  const vivo = () => {
    try {
      return !!runtime.id;
    } catch {
      return false;
    }
  };

  const JANELA_MS = 60_000; // CPU medida no último minuto
  let tarefasLongas = []; // [fim, duração]
  let observador = null;
  try {
    observador = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) tarefasLongas.push([e.startTime + e.duration, e.duration]);
    });
    observador.observe({ type: "longtask", buffered: true });
  } catch {
    observador = null; // navegador sem suporte a longtask (ex.: Firefox): CPU fica como null
  }

  // Campo com texto digitado e ainda não enviado: suspender perderia o que foi escrito.
  // Guardamos os campos editados e, na hora de medir, vemos se ainda têm texto
  // (caixas de chat que se esvaziam ao enviar não travam a aba para sempre).
  let editados = new Set(); // WeakRef de elementos
  const aoDigitar = (e) => {
    const alvo = e.composedPath?.()[0] ?? e.target;
    if (alvo instanceof HTMLInputElement && ["password", "search", "hidden", "checkbox", "radio", "range"].includes(alvo.type)) return;
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo?.isContentEditable) editados.add(new WeakRef(alvo));
  };
  const aoEnviar = () => (editados = new Set());
  const temTexto = (el) => (el.isContentEditable ? el.textContent : el.value).trim().length > 0;
  function formularioEditado() {
    for (const ref of editados) {
      const el = ref.deref();
      if (el?.isConnected && temTexto(el)) return true;
      editados.delete(ref);
    }
    return false;
  }
  document.addEventListener("input", aoDigitar, true);
  document.addEventListener("submit", aoEnviar, true);

  // Pergunta ao midia.js (mundo da página) se há câmera/microfone/tela em uso.
  function usandoMidia() {
    let resposta = false;
    const ouvir = (e) => (resposta = e.detail === true);
    document.addEventListener("memoria-das-abas:resposta", ouvir, { once: true });
    document.dispatchEvent(new CustomEvent("memoria-das-abas:pergunta"));
    document.removeEventListener("memoria-das-abas:resposta", ouvir);
    return resposta;
  }

  // Domínio "registrável" aproximado (exemplo.com.br, exemplo.com)
  const raiz = (host) => {
    const p = host.split(".");
    const sufixoDuplo = p.length > 2 && p[p.length - 1].length === 2 && p[p.length - 2].length <= 3;
    return p.slice(sufixoDuplo ? -3 : -2).join(".");
  };

  function medir() {
    const agora = performance.now();
    tarefasLongas = tarefasLongas.filter(([fim]) => agora - fim < JANELA_MS);
    const ocupadoMs = tarefasLongas.reduce((s, [, d]) => s + d, 0);
    const janela = Math.min(JANELA_MS, agora);

    const mem = performance.memory; // não-padrão; só em navegadores Chromium
    const minhaRaiz = raiz(location.hostname);
    const terceiros = new Set();
    let frames = 0;
    for (const f of document.querySelectorAll("iframe, frame")) {
      frames++;
      try {
        const h = new URL(f.src, location.href).hostname;
        if (h && raiz(h) !== minhaRaiz) terceiros.add(h);
      } catch {}
    }

    const recursos = performance.getEntriesByType("resource");
    const baixadoKB = recursos.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024;

    return {
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : null,
      heapTotalMB: mem ? mem.totalJSHeapSize / 1048576 : null,
      elementos: document.getElementsByTagName("*").length,
      frames,
      framesTerceiros: [...terceiros].slice(0, 12),
      cpu: observador && janela > 0 ? Math.min(100, (ocupadoMs / janela) * 100) : null,
      recursos: recursos.length,
      baixadoMB: baixadoKB / 1024,
      videos: document.querySelectorAll("video").length,
      formularioEditado: formularioEditado(),
      midia: usandoMidia(),
    };
  }

  const aoMensagem = (msg, _remetente, responder) => {
    if (msg && msg.tipo === "medir") responder(medir());
  };
  runtime.onMessage.addListener(aoMensagem);

  globalThis.__memoriaDasAbas = {
    vivo,
    parar() {
      observador?.disconnect();
      document.removeEventListener("input", aoDigitar, true);
      document.removeEventListener("submit", aoEnviar, true);
      try { runtime.onMessage.removeListener(aoMensagem); } catch {}
    },
  };
})();
