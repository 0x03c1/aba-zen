// Background: acorda uma vez por minuto para (1) fotografar as abas abertas, para
// poder recuperá-las depois de um travamento, e (2) suspender as abas paradas.
// Esse ciclo é leve de propósito: não conversa com todas as abas nem mede nada.
// A medição completa (memória/CPU por aba) só acontece quando o popup pede.
// Chromium carrega este arquivo como service worker; o Firefox, como script de fundo
// (lá config.js e sessoes.js já vêm antes, pela lista "scripts" que
// ferramentas/empacotar.py coloca no manifest do Firefox).
if (typeof importScripts === "function" && typeof PADRAO === "undefined") importScripts("config.js", "sessoes.js");

const local = chrome.storage.local;
const sessao = chrome.storage.session;
const PAGINA_SALVAS = "salvas.html";
const MAX_HISTORICO = 30;

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const comTempo = (promessa, ms) => Promise.race([promessa, pausa(ms).then(() => null)]);
const listaDeIds = (x) => (Array.isArray(x) ? [...new Set(x.filter(Number.isInteger))].slice(0, 5000) : []);
const pegarAba = (id) => chrome.tabs.get(id).catch(() => null);

// Tudo o que lê-e-regrava estado (ciclo, sinais, salvar…) passa por esta fila,
// para nunca rodar dois ao mesmo tempo e um apagar o que o outro gravou.
let fila = Promise.resolve();
function emFila(tarefa) {
  const r = fila.then(() => tarefa());
  // Uma tarefa presa (uma chamada do navegador que nunca responde) não pode segurar
  // as próximas para sempre: depois de 20 s a fila segue sem ela.
  fila = Promise.race([r, pausa(20_000)]).catch(() => {});
  return r;
}

// ---------- Suspender e reativar ----------

// Troca a aba pela página leve da extensão. Janelas anônimas ficam de fora
// (páginas da extensão não abrem nelas).
// Sem `forcar`, confere de novo na hora: entre escolher a aba e suspender, o usuário
// pode ter voltado para ela, ela pode ter começado a tocar ou ido para outra página.
async function suspender(aba, forcar = false) {
  const atual = await pegarAba(aba.id);
  if (!atual) return false;
  if (!forcar && (atual.active || atual.audible || atual.url !== aba.url)) return false;
  const real = abaReal(atual);
  if (real.suspensa || !ehWeb(real.url) || atual.incognito) return false;
  try {
    await chrome.tabs.update(atual.id, { url: urlSuspensa(real) });
    return true;
  } catch {
    return false;
  }
}

async function reativar(aba) {
  const d = lerSuspensa(baseSuspensa(), aba.pendingUrl || aba.url || "");
  if (!d) return false;
  try {
    await chrome.tabs.update(aba.id, { url: d.url });
    return true;
  } catch {
    return false;
  }
}

// Pergunta à própria aba se há texto digitado ou mídia em uso. null = sem resposta
// (aba congelada pelo navegador, sem o medidor, ou página restrita).
async function estadoAoVivo(id) {
  try {
    const r = await comTempo(chrome.tabs.sendMessage(id, { tipo: "estado" }), 1000);
    return r && typeof r === "object" ? r : null;
  } catch {
    return null;
  }
}

// Atualiza `sinais` com a resposta ao vivo; sem resposta, vale o que estava guardado.
// Devolve se a aba está ocupada (não pode ser suspensa sozinha).
async function ocupada(aba, sinais) {
  if (aba.discarded) return false; // já descarregada: não há o que perder
  const vivo = await estadoAoVivo(aba.id);
  if (vivo) {
    if (vivo.formularioEditado || vivo.midia) {
      sinais[aba.id] = { ...(vivo.formularioEditado && { form: true }), ...(vivo.midia && { midia: true }) };
    } else {
      delete sinais[aba.id];
    }
  }
  if (vivo?.tocando) return true; // vídeo/áudio em reprodução, mesmo num trecho sem som
  const s = sinais[aba.id];
  return !!(s?.form || s?.midia);
}

// Por que a aba não pode ser suspensa automaticamente (lista vazia = pode).
function motivosDeProtecao(aba, real, sinal, cfg, poupadas) {
  const motivos = [];
  if (siteProtegido(real.url, cfg.protegidos)) motivos.push("site protegido");
  if (cfg.protegerFixadas && aba.pinned) motivos.push("fixada");
  if (aba.autoDiscardable === false) motivos.push("marcada para não descartar");
  if (sinal?.midia) motivos.push("câmera/microfone/tela");
  if (sinal?.form) motivos.push("texto não enviado");
  if (poupadas.has(aba.id)) motivos.push("não suspender esta aba");
  return motivos;
}

// null quando o navegador não expõe a RAM do sistema (ex.: Firefox).
async function memoriaLivre() {
  if (!chrome.system?.memory) return null;
  try {
    const { capacity, availableCapacity } = await chrome.system.memory.getInfo();
    return { totalGB: capacity / 2 ** 30, livreGB: availableCapacity / 2 ** 30, livre: (availableCapacity / capacity) * 100 };
  } catch {
    return null;
  }
}

// ---------- Ciclo de 1 minuto ----------

// Abas paradas há tempo demais viram abas suspensas, as mais antigas primeiro.
// Devolve true se `sinais` mudou.
async function suspenderParadas(cfg, abas, sinais, poupadas) {
  const mem = await memoriaLivre();
  const apertado = !!mem && mem.livre < cfg.limiteLivre;
  // Com a memória apertada o prazo encurta — nunca alonga.
  const minutos = apertado ? Math.min(cfg.minutosApertado, cfg.minutosParada) : cfg.minutosParada;
  const limiteUso = Date.now() - minutos * 60_000;

  const candidatas = abas
    .filter((a) => {
      if (a.active || a.audible || a.incognito || !ehWeb(a.url)) return false;
      if (!a.discarded && a.status !== "complete") return false;
      if ((a.lastAccessed ?? Infinity) >= limiteUso) return false;
      return motivosDeProtecao(a, { url: a.url }, null, cfg, poupadas).length === 0;
    })
    .sort((a, b) => a.lastAccessed - b.lastAccessed);

  if (!candidatas.length) return false;
  const antes = JSON.stringify(sinais);
  // Pergunta em lotes pequenos: se as mais antigas estiverem ocupadas, segue para as
  // próximas (até 3 lotes por minuto), em vez de travar sempre nas mesmas.
  const lote = cfg.porCiclo + 4;
  const feitas = [];
  for (let ini = 0; ini < candidatas.length && ini < lote * 3 && feitas.length < cfg.porCiclo; ini += lote) {
    const grupo = candidatas.slice(ini, ini + lote);
    const ocupadas = await Promise.all(grupo.map((a) => ocupada(a, sinais)));
    for (let i = 0; i < grupo.length && feitas.length < cfg.porCiclo; i++) {
      const a = grupo[i];
      if (ocupadas[i] || !(await suspender(a))) continue;
      feitas.push({ quando: Date.now(), titulo: a.title || "", url: a.url, livre: mem?.livre ?? null });
    }
  }
  if (feitas.length) {
    const { historico = [] } = await local.get("historico");
    await local.set({ historico: [...feitas, ...(Array.isArray(historico) ? historico : [])].slice(0, MAX_HISTORICO) });
  }
  return JSON.stringify(sinais) !== antes;
}

// Páginas de aba suspensa já carregadas e fora de uso: o navegador pode descarregá-las
// (memória zero). Ao visitar, ele recarrega só a página leve — nunca o site.
async function descartarCarregadas(abas) {
  const base = baseSuspensa();
  for (const a of abas) {
    if (a.active || a.discarded || a.status !== "complete" || !lerSuspensa(base, a.url)) continue;
    await chrome.tabs.discard(a.id).catch(() => {});
  }
}

async function gravarFoto(foto) {
  await local.set({ sessaoAtual: { quando: Date.now(), abas: foto } });
  await sessao.set({ sessaoIniciada: true, assinaturaSessao: assinatura(foto) });
}

// Guarda a lista das abas abertas (só quando ela muda). A foto anterior vai para as
// sessões automáticas quando o navegador acabou de abrir e alguma aba não voltou
// ("inicio"), ou quando muitas abas sumiram de uma vez ("queda").
async function fotografarSessao(abas, sess) {
  const foto = fotografar(abas);
  const primeira = !sess.sessaoIniciada;
  if (!primeira && assinatura(foto) === sess.assinaturaSessao) return;

  const { sessaoAtual, sessoesAuto } = await local.get(["sessaoAtual", "sessoesAuto"]);
  const antes = Array.isArray(sessaoAtual?.abas) ? sessaoAtual.abas : [];
  const motivo = primeira ? (faltando(antes, foto).length ? "inicio" : null) : perdeuMuitas(antes, foto) ? "queda" : null;
  if (motivo) {
    const nova = arquivar(sessoesAuto, antes, sessaoAtual.quando ?? Date.now(), motivo);
    if (nova !== sessoesAuto) await local.set({ sessoesAuto: nova });
  }
  await gravarFoto(foto);
}

// O Chromium fecha as páginas da extensão quando ela é recarregada/atualizada com o
// navegador aberto — e as abas suspensas são páginas da extensão. Aqui elas são
// recriadas a partir da última foto. Não vale para a abertura do navegador: aí quem
// decide o que volta é a restauração de sessão dele.
let atualizou = false;
let navegadorIniciou = false;
async function recuperarSeAtualizou() {
  await pausa(1500); // dá tempo de onInstalled/onStartup chegarem
  if (!atualizou) return;
  atualizou = false;
  if (navegadorIniciou) return;

  const { sessaoAtual } = await local.get("sessaoAtual");
  const perdidas = (Array.isArray(sessaoAtual?.abas) ? sessaoAtual.abas : []).filter((e) => e?.suspensa && ehWeb(e.url));
  if (!perdidas.length) return;
  const abas = await chrome.tabs.query({});
  const abertas = new Set(abas.map((a) => abaReal(a).url));
  const janelas = new Set(abas.filter((a) => !a.incognito).map((a) => a.windowId));
  for (const e of perdidas.sort((a, b) => a.indice - b.indice)) {
    if (abertas.has(e.url)) continue;
    abertas.add(e.url);
    const naJanela = janelas.has(e.janela);
    await chrome.tabs
      .create({
        url: urlSuspensa(e),
        active: false,
        pinned: !!e.fixada,
        ...(naJanela && { windowId: e.janela }),
        ...(naJanela && Number.isInteger(e.indice) && { index: e.indice }),
      })
      .catch(() => {});
  }
}

async function ciclo() {
  const sess = await sessao.get(["sessaoIniciada", "assinaturaSessao", "sinais", "poupadas"]);
  if (!sess.sessaoIniciada) await recuperarSeAtualizou();
  const [cfg, abas] = await Promise.all([lerConfig(), chrome.tabs.query({})]);
  await fotografarSessao(abas, sess);

  // Esquece sinais e marcações de abas que não existem mais.
  const ids = new Set(abas.map((a) => a.id));
  const sinais = sess.sinais && typeof sess.sinais === "object" ? sess.sinais : {};
  const poupadasAntes = Array.isArray(sess.poupadas) ? sess.poupadas : [];
  const poupadas = poupadasAntes.filter((id) => ids.has(id));
  let mudou = poupadas.length !== poupadasAntes.length;
  for (const k of Object.keys(sinais)) {
    if (!ids.has(Number(k))) {
      delete sinais[k];
      mudou = true;
    }
  }

  // Sem internet a aba suspensa não conseguiria voltar: melhor não suspender.
  if (cfg.automatico && navigator.onLine !== false) {
    mudou = (await suspenderParadas(cfg, abas, sinais, new Set(poupadas))) || mudou;
  }
  if (cfg.descartarSuspensas) await descartarCarregadas(abas);
  if (mudou) await sessao.set({ sinais, poupadas });
}

// ---------- Medição completa (só quando o popup pede) ----------

// Cada processo extra (frame de outro site) custa algo como 20–40 MB.
const MB_POR_FRAME_TERCEIRO = 25;
const MB_POR_MIL_ELEMENTOS = 1.5;
const MB_BASE_PAGINA = 30;

function estimar(m) {
  if (!m) return null;
  return Math.round(
    MB_BASE_PAGINA +
      (m.heapTotalMB ?? m.heapMB ?? 0) +
      ((m.elementos ?? 0) / 1000) * MB_POR_MIL_ELEMENTOS +
      (m.framesTerceiros?.length ?? 0) * MB_POR_FRAME_TERCEIRO
  );
}

// A resposta vem de dentro da página: só entram números, booleanos e textos curtos.
function normalizarMedida(m) {
  if (!m || typeof m !== "object") return null;
  const num = (x) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  return {
    heapMB: num(m.heapMB),
    heapTotalMB: num(m.heapTotalMB),
    elementos: num(m.elementos) ?? 0,
    frames: num(m.frames) ?? 0,
    framesTerceiros: (Array.isArray(m.framesTerceiros) ? m.framesTerceiros : []).filter((h) => typeof h === "string" && h.length <= 253).slice(0, 12),
    cpu: num(m.cpu),
    recursos: num(m.recursos) ?? 0,
    baixadoMB: num(m.baixadoMB) ?? 0,
    videos: num(m.videos) ?? 0,
    formularioEditado: m.formularioEditado === true,
    midia: m.midia === true,
  };
}

async function medirAba(aba) {
  if (!ehWeb(aba.url) || aba.status !== "complete") return null;
  try {
    return normalizarMedida(await comTempo(chrome.tabs.sendMessage(aba.id, { tipo: "medir" }), 2000));
  } catch {
    return null; // aba aberta antes da extensão e sem medidor, ou página restrita
  }
}

async function medirTudo({ medir = true } = {}) {
  const [cfg, abas, mem, sess] = await Promise.all([
    lerConfig(),
    chrome.tabs.query({}),
    memoriaLivre(),
    sessao.get(["estado", "sinais", "poupadas"]),
  ]);
  const reais = abas.map(abaReal);
  const sinais = sess.sinais ?? {};
  const poupadas = new Set(Array.isArray(sess.poupadas) ? sess.poupadas : []);

  // Abas suspensas, descartadas ou congeladas não respondem (e acordá-las só para medir
  // gastaria a memória que queremos poupar): reaproveitamos a última medida, que nas
  // suspensas mostra quanto a suspensão liberou. Descartar pode trocar o id da aba no
  // Chromium; por isso também casamos pelo endereço real.
  const anteriores = sess.estado?.abas ?? [];
  const porId = new Map(anteriores.map((t) => [t.id, t.medida]));
  const porUrl = new Map();
  for (const t of anteriores) if (t.medida && !porUrl.has(t.url)) porUrl.set(t.url, t.medida);
  const medidas = await Promise.all(
    abas.map((a, i) =>
      !medir || reais[i].suspensa || a.frozen || a.discarded ? porId.get(a.id) ?? porUrl.get(reais[i].url) ?? null : medirAba(a)
    )
  );

  const lista = abas.map((a, i) => {
    const real = reais[i];
    const m = medidas[i];
    const parada = real.suspensa || a.discarded;
    const guardado = sinais[a.id];
    // Ao vivo vale a medida; sem resposta (ou aba parada), o último aviso recebido.
    const sinal = m && !parada ? { form: !!m.formularioEditado, midia: !!m.midia } : parada ? null : guardado;
    const est = estimar(m);
    const motivos = motivosDeProtecao(a, real, sinal, cfg, poupadas);
    return {
      id: a.id,
      janela: a.windowId,
      titulo: real.titulo,
      url: real.url,
      icone: real.icone,
      ativa: a.active,
      fixada: a.pinned,
      tocando: !!a.audible,
      suspensa: real.suspensa,
      descartada: !!a.discarded,
      congelada: !!a.frozen,
      ultimoUso: a.lastAccessed,
      medida: m,
      estimativaMB: est,
      pesada: !parada && !!m && (est >= cfg.pesadaMB || (m.cpu ?? 0) >= cfg.cpuPesada),
      protegida: motivos.length > 0,
      motivos,
      poupada: poupadas.has(a.id),
      anonima: !!a.incognito,
    };
  });
  lista.sort((a, b) => (b.estimativaMB ?? -1) - (a.estimativaMB ?? -1));

  const estado = { quando: Date.now(), mem, limiteLivre: cfg.limiteLivre, minutosParada: cfg.minutosParada, abas: lista };
  await sessao.set({ estado }).catch(() => {}); // estado grande demais para guardar: o popup recebe mesmo assim
  return estado;
}

// ---------- Pedidos das páginas da extensão ----------

// Suspensão pedida pelo usuário. `forcar` (uma aba só, pedido explícito) ignora as
// proteções; em massa, confere de novo ativa/som/proteções na hora.
async function suspenderIds(ids, forcar) {
  const abas = (await Promise.all(ids.map(pegarAba))).filter(Boolean);
  if (forcar) {
    for (const a of abas) await suspender(a, true);
    return;
  }
  const [cfg, sess] = await Promise.all([lerConfig(), sessao.get(["sinais", "poupadas"])]);
  const sinais = sess.sinais && typeof sess.sinais === "object" ? sess.sinais : {};
  const poupadas = new Set(Array.isArray(sess.poupadas) ? sess.poupadas : []);
  const livres = abas.filter(
    (a) => !a.active && !a.audible && motivosDeProtecao(a, abaReal(a), null, cfg, poupadas).length === 0
  );
  const antes = JSON.stringify(sinais);
  const ocupadas = await Promise.all(livres.map((a) => ocupada(a, sinais)));
  for (let i = 0; i < livres.length; i++) if (!ocupadas[i]) await suspender(livres[i]);
  if (JSON.stringify(sinais) !== antes) await sessao.set({ sinais });
}

async function reativarIds(ids) {
  for (const id of ids) {
    const aba = await pegarAba(id);
    if (aba) await reativar(aba);
  }
}

async function poupar(id, valor) {
  const { poupadas = [] } = await sessao.get("poupadas");
  const conjunto = new Set(Array.isArray(poupadas) ? poupadas : []);
  if (valor) conjunto.add(id);
  else conjunto.delete(id);
  await sessao.set({ poupadas: [...conjunto] });
}

// Abre (ou foca) a página de abas salvas na janela indicada.
async function abrirSalvas(janela) {
  const url = chrome.runtime.getURL(PAGINA_SALVAS);
  const abertas = (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url || "").startsWith(url));
  const aqui = abertas.find((t) => t.windowId === janela) ?? (janela == null ? abertas[0] : null);
  if (aqui) await chrome.tabs.update(aqui.id, { active: true });
  else await chrome.tabs.create({ url, active: true, ...(janela != null && { windowId: janela }) });
}

// Guarda as abas num grupo novo (como o OneTab) e, se pedido, fecha as abas.
async function salvar({ escopo, janela, ids, fechar, nome }) {
  const cfg = await lerConfig();
  let abas;
  if (escopo === "ids") abas = (await Promise.all(listaDeIds(ids).map(pegarAba))).filter(Boolean);
  else if (escopo === "todas") abas = await chrome.tabs.query({});
  else if (escopo === "janela") abas = await chrome.tabs.query(Number.isInteger(janela) ? { windowId: janela } : { lastFocusedWindow: true });
  else return { grupo: null };

  const escolhidas = abas.filter((a) => !a.incognito && ehWeb(abaReal(a).url) && (cfg.salvarFixadas || !a.pinned));
  const grupo = novoGrupo(escolhidas.map(abaReal), typeof nome === "string" ? nome : "");
  if (!grupo) return { grupo: null };

  // Mesma trava usada pela página de abas salvas, para uma gravação não apagar a outra.
  await navigator.locks.request("grupos", async () => {
    const { grupos } = await local.get("grupos");
    await local.set({ grupos: [grupo, ...(Array.isArray(grupos) ? grupos : [])] });
  });

  if (fechar) {
    // Navegador recém-aberto e o primeiro ciclo ainda não rodou: guarda antes a sessão
    // anterior, senão a foto nova passaria por cima dela.
    const sess = await sessao.get(["sessaoIniciada", "assinaturaSessao"]);
    if (!sess.sessaoIniciada) await fotografarSessao(await chrome.tabs.query({}), sess);
    // A página de abas salvas abre antes, para a janela não fechar junto com a última aba.
    // Ao salvar abas avulsas ("ids") ela só abre se a janela fosse ficar vazia.
    const destino = Number.isInteger(janela) ? janela : escolhidas[0].windowId;
    const fechadas = new Set(escolhidas.map((a) => a.id));
    const esvazia = async () => (await chrome.tabs.query({ windowId: destino })).every((a) => fechadas.has(a.id));
    if (escopo !== "ids" || (await esvazia())) await abrirSalvas(destino).catch(() => {});
    // Uma a uma: se uma aba não puder ser fechada (id trocado, já fechada), as outras fecham.
    const resultados = await Promise.all(escolhidas.map((a) => chrome.tabs.remove(a.id).then(() => true, () => false)));
    let nFechadas = resultados.filter(Boolean).length;
    // Quem não fechou provavelmente trocou de id (o navegador troca o id da aba ao
    // descartá-la): procura de novo pela janela + endereço e fecha.
    const sobraram = escolhidas.filter((_, i) => !resultados[i]);
    if (sobraram.length) {
      const chave = (janela, url) => `${janela}\n${url}`;
      const procuradas = new Map();
      for (const a of sobraram) procuradas.set(chave(a.windowId, abaReal(a).url), (procuradas.get(chave(a.windowId, abaReal(a).url)) ?? 0) + 1);
      const jaFechadas = new Set(escolhidas.filter((_, i) => resultados[i]).map((a) => a.id));
      for (const a of await chrome.tabs.query({})) {
        const k = chave(a.windowId, abaReal(a).url);
        if (jaFechadas.has(a.id) || !procuradas.get(k) || (!cfg.salvarFixadas && a.pinned)) continue;
        procuradas.set(k, procuradas.get(k) - 1);
        if (await chrome.tabs.remove(a.id).then(() => true, () => false)) nFechadas++;
      }
    }
    // Regrava a foto já sem essas abas: fechá-las de propósito não é uma "queda".
    await gravarFoto(fotografar(await chrome.tabs.query({})));
    return { grupo, fechadas: nFechadas };
  }
  return { grupo };
}

// Reabre abas salvas, sem roubar o foco. Suspensas (se configurado), elas não custam
// nada até o usuário clicar; uma por vez, para não travar o navegador.
async function restaurar({ abas, janela }, remetente) {
  const cfg = await lerConfig();
  const lista = abasParaGrupo(Array.isArray(abas) ? abas.slice(0, 5000) : []);
  let destino = Number.isInteger(janela) ? janela : remetente?.tab?.windowId;
  if (destino != null) {
    const j = await chrome.windows.get(destino).catch(() => null);
    if (!j || j.incognito) destino = undefined;
  }
  let abertas = 0;
  for (const a of lista) {
    try {
      await chrome.tabs.create({
        url: cfg.restaurarSuspensas ? urlSuspensa(a) : a.url,
        active: false,
        ...(destino != null && { windowId: destino }),
      });
      abertas++;
    } catch {}
  }
  return { abertas };
}

// A página de aba suspensa avisa quando terminou de carregar: se não estiver em uso,
// o navegador pode descarregá-la.
async function prontaParaDescartar(remetente) {
  const id = remetente.tab?.id;
  if (!Number.isInteger(id) || !remetente.url?.startsWith(baseSuspensa())) return null;
  const cfg = await lerConfig();
  if (!cfg.descartarSuspensas) return null;
  const aba = await pegarAba(id);
  // Só se ela continua sendo a página suspensa (o usuário pode já ter pedido para voltar ao site).
  const parada = aba && aba.status === "complete" && lerSuspensa(baseSuspensa(), aba.pendingUrl || aba.url || "");
  if (parada && !aba.active && !aba.discarded) await chrome.tabs.discard(id).catch(() => {});
  return null;
}

// Depois de uma ação do popup, o estado é refeito com as medidas já guardadas:
// perguntar de novo a todas as abas deixaria cada clique lento.
const semMedir = () => medirTudo({ medir: false });

const ACOES = {
  atualizar: () => medirTudo(),
  suspender: (msg) => {
    const ids = listaDeIds(msg.ids);
    return emFila(() => suspenderIds(ids, msg.forcar === true && ids.length === 1)).then(semMedir);
  },
  reativar: (msg) => reativarIds(listaDeIds(msg.ids)).then(semMedir),
  poupar: (msg) => (Number.isInteger(msg.id) ? emFila(() => poupar(msg.id, msg.valor === true)) : Promise.resolve()).then(semMedir),
  salvar: (msg) => emFila(() => salvar(msg)),
  restaurar: (msg, remetente) => restaurar(msg, remetente), // fora da fila: não mexe em storage e pode demorar
  pronta: (_msg, remetente) => prontaParaDescartar(remetente),
};

// Aviso de uma página: passou a ter (ou deixou de ter) texto digitado ou mídia em uso.
async function receberSinal(id, msg) {
  const { sinais = {} } = await sessao.get("sinais");
  const s = { ...sinais[id] };
  if (typeof msg.form === "boolean") msg.form ? (s.form = true) : delete s.form;
  if (typeof msg.midia === "boolean") msg.midia ? (s.midia = true) : delete s.midia;
  if (Object.keys(s).length) sinais[id] = s;
  else delete sinais[id];
  await sessao.set({ sinais });
}

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (remetente.id !== chrome.runtime.id || !msg || typeof msg.tipo !== "string") return;
  const daExtensao = typeof remetente.url === "string" && remetente.url.startsWith(chrome.runtime.getURL(""));

  // Scripts das páginas só podem mandar "sinal", e só com booleanos.
  if (!daExtensao) {
    const id = remetente.tab?.id;
    const valido = typeof msg.form === "boolean" || typeof msg.midia === "boolean";
    if (msg.tipo === "sinal" && Number.isInteger(id) && remetente.frameId === 0 && valido) {
      emFila(() => receberSinal(id, msg)).catch(() => {});
    }
    return;
  }

  if (!Object.hasOwn(ACOES, msg.tipo)) return;
  Promise.resolve()
    .then(() => ACOES[msg.tipo](msg, remetente))
    .then(responder, (e) => {
      console.error(`Aba Zen: falha em "${msg.tipo}"`, e);
      responder({ erro: String(e?.message ?? e).slice(0, 300) });
    });
  return true;
});

// ---------- Atalhos de teclado ----------

chrome.commands?.onCommand.addListener(async (comando, aba) => {
  aba ??= (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!aba) return;
  if (comando === "suspender-aba") {
    if (!(await reativar(aba))) await suspender(aba, true);
  } else if (comando === "salvar-janela") {
    await emFila(() => salvar({ escopo: "janela", janela: aba.windowId, fechar: true }));
  }
});

// ---------- Instalação, início e alarme ----------

// Injeta os scripts nas abas que já estavam abertas antes da instalação/atualização.
async function injetarNasAbasAbertas() {
  for (const aba of await chrome.tabs.query({ url: ["http://*/*", "https://*/*"], discarded: false })) {
    const alvo = { tabId: aba.id };
    chrome.scripting.executeScript({ target: alvo, files: ["midia.js"], world: "MAIN" }).catch(() => {});
    chrome.scripting.executeScript({ target: alvo, files: ["medidor.js"] }).catch(() => {});
  }
}

function agendar() {
  chrome.alarms.create("ciclo", { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener((detalhes) => {
  atualizou = detalhes.reason === "update";
  agendar();
  chrome.action.setBadgeText({ text: "" }).catch?.(() => {}); // versões antigas usavam o contador no ícone
  injetarNasAbasAbertas().catch(() => {});
  emFila(ciclo).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  navegadorIniciou = true;
  agendar();
});

// Com um ouvinte aqui (mesmo vazio), o navegador não recarrega a extensão no meio do
// uso para atualizar — o que fecharia as abas suspensas. A atualização entra quando
// o navegador for reiniciado.
chrome.runtime.onUpdateAvailable.addListener(() => {});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "ciclo") emFila(ciclo).catch(() => {});
});
// Garante o alarme mesmo se ele tiver sido perdido (ex.: extensão reativada).
chrome.alarms.get("ciclo").then((a) => a || agendar(), () => {});

// Descartar/pré-carregar troca o id da aba: leva junto os sinais e a marcação
// "não suspender esta aba". (Evento raro; não acorda a extensão à toa.)
chrome.tabs.onReplaced.addListener((novo, antigo) => {
  emFila(async () => {
    const { sinais = {}, poupadas = [] } = await sessao.get(["sinais", "poupadas"]);
    const tinhaSinal = antigo in sinais;
    const tinhaMarca = poupadas.includes(antigo);
    if (!tinhaSinal && !tinhaMarca) return;
    if (tinhaSinal) {
      sinais[novo] = sinais[antigo];
      delete sinais[antigo];
    }
    await sessao.set({ sinais, poupadas: tinhaMarca ? poupadas.map((id) => (id === antigo ? novo : id)) : poupadas });
  }).catch(() => {});
});
