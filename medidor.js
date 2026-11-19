// Roda dentro de cada página (só no frame principal). Não envia nada para fora:
// responde quando o background da extensão pergunta e avisa, uma única vez,
// quando a página passa a ter texto digitado ou mídia em uso (para não ser suspensa).
// Custo por página: dois ouvintes de evento e um contador de tamanho fixo.
(() => {
  // Se a extensão foi recarregada/atualizada, a cópia antiga deste script fica
  // "órfã" (sem contexto). Nesse caso deixamos a nova cópia se instalar.
  const anterior = globalThis.__abaZen;
  if (anterior?.vivo()) return;
  anterior?.parar();
  try { globalThis.__memoriaDasAbas?.parar(); } catch {} // cópia de antes da troca de nome

  const runtime = chrome.runtime;
  const vivo = () => {
    try {
      return !!runtime.id;
    } catch {
      return false;
    }
  };

  // ---------- CPU: tempo em tarefas longas no último minuto ----------
  // Seis baldes de 10 s reaproveitados em roda: memória constante, por mais
  // que a página trabalhe e mesmo que ninguém peça uma medição.
  const BALDE_MS = 10_000;
  const BALDES = 6;
  const soma = new Array(BALDES).fill(0);
  const dono = new Array(BALDES).fill(-1); // de qual intervalo de 10 s é cada balde
  let observador = null;
  try {
    observador = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        const b = Math.floor((e.startTime + e.duration) / BALDE_MS);
        const i = b % BALDES;
        if (dono[i] !== b) {
          dono[i] = b;
          soma[i] = 0;
        }
        soma[i] += e.duration;
      }
    });
    observador.observe({ type: "longtask", buffered: true });
  } catch {
    observador = null; // navegador sem suporte a longtask (ex.: Firefox): CPU fica como null
  }
  function ocupadoMs(agora) {
    const atual = Math.floor(agora / BALDE_MS);
    let total = 0;
    for (let i = 0; i < BALDES; i++) if (dono[i] >= 0 && atual - dono[i] < BALDES) total += soma[i];
    return total;
  }

  // ---------- Avisos ao background ----------
  // Poucos e limitados: a página não consegue usar isto para manter a extensão acordada.
  let avisosRestantes = 20;
  function avisar(sinal) {
    if (avisosRestantes-- <= 0) return;
    try {
      runtime.sendMessage({ tipo: "sinal", ...sinal })?.catch?.(() => {});
    } catch {}
  }

  // Campo com texto digitado e ainda não enviado: suspender perderia o que foi escrito.
  // Guardamos os campos editados e, na hora de responder, vemos se ainda têm texto
  // (caixas de chat que se esvaziam ao enviar não travam a aba para sempre).
  const editados = new Set(); // WeakRef de elementos
  const vistos = new WeakSet(); // para não guardar o mesmo campo a cada tecla
  let avisouForm = false;
  const aoDigitar = (e) => {
    if (!e.isTrusted) return; // só digitação de verdade, não eventos criados pela página
    const alvo = e.composedPath?.()[0] ?? e.target;
    if (alvo instanceof HTMLInputElement && ["password", "search", "hidden", "checkbox", "radio", "range"].includes(alvo.type)) return;
    if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo?.isContentEditable)) return;
    if (!vistos.has(alvo)) {
      if (editados.size >= 50) formularioEditado(); // cheio: tira os vazios e os que saíram da página
      if (editados.size < 50) {
        vistos.add(alvo);
        editados.add(new WeakRef(alvo));
      }
    }
    if (!avisouForm) {
      avisouForm = true;
      avisar({ form: true });
    }
  };
  const temTexto = (el) => (el.isContentEditable ? el.textContent : el.value).trim().length > 0;
  function formularioEditado() {
    for (const ref of editados) {
      const el = ref.deref();
      if (el?.isConnected && temTexto(el)) return true;
      editados.delete(ref);
      if (el) vistos.delete(el);
    }
    return false;
  }
  document.addEventListener("input", aoDigitar, true);

  // O midia.js (mundo da página) avisa quando câmera/microfone/tela começam.
  let avisouMidia = false;
  const aoComecarMidia = () => {
    if (avisouMidia) return;
    avisouMidia = true;
    avisar({ midia: true });
  };
  document.addEventListener("aba-zen:midia", aoComecarMidia);

  // Pergunta ao midia.js se há câmera/microfone/tela em uso agora.
  function usandoMidia() {
    let resposta = false;
    const ouvir = (e) => (resposta = e.detail === true);
    document.addEventListener("aba-zen:resposta", ouvir, { once: true });
    document.dispatchEvent(new CustomEvent("aba-zen:pergunta"));
    document.removeEventListener("aba-zen:resposta", ouvir);
    return resposta;
  }

  // Resposta leve, usada antes de suspender.
  const tocando = () => {
    for (const m of document.querySelectorAll("video, audio")) if (!m.paused && !m.ended && m.readyState > 2) return true;
    return false;
  };
  const estado = () => ({ formularioEditado: formularioEditado(), midia: usandoMidia(), tocando: tocando() });

  // Domínio "registrável" aproximado (exemplo.com.br, exemplo.com)
  const raiz = (host) => {
    const p = host.split(".");
    const sufixoDuplo = p.length > 2 && p[p.length - 1].length === 2 && p[p.length - 2].length <= 3;
    return p.slice(sufixoDuplo ? -3 : -2).join(".");
  };

  // Medição completa: só roda quando o popup pede.
  function medir() {
    const agora = performance.now();
    const janela = Math.min(BALDE_MS * BALDES, agora);

    const mem = performance.memory; // não-padrão; só em navegadores Chromium
    const minhaRaiz = raiz(location.hostname);
    const terceiros = new Set();
    let frames = 0;
    for (const f of document.querySelectorAll("iframe, frame")) {
      frames++;
      try {
        const h = new URL(f.src, location.href).hostname;
        if (h && h.length <= 253 && raiz(h) !== minhaRaiz) terceiros.add(h);
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
      cpu: observador && janela > 0 ? Math.min(100, (ocupadoMs(agora) / janela) * 100) : null,
      recursos: recursos.length,
      baixadoMB: baixadoKB / 1024,
      videos: document.querySelectorAll("video").length,
      ...estado(),
    };
  }

  const aoMensagem = (msg, _remetente, responder) => {
    if (msg?.tipo === "estado") responder(estado());
    else if (msg?.tipo === "medir") responder(medir());
  };
  runtime.onMessage.addListener(aoMensagem);

  globalThis.__abaZen = {
    vivo,
    parar() {
      observador?.disconnect();
      document.removeEventListener("input", aoDigitar, true);
      document.removeEventListener("aba-zen:midia", aoComecarMidia);
      try { runtime.onMessage.removeListener(aoMensagem); } catch {}
    },
  };
})();
