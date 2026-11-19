// Página que fica no lugar de uma aba suspensa. Guarda o endereço original no próprio
// endereço (depois do "#") e só volta para ele quando a pessoa clica ou aperta Enter/Espaço.
// Feita para ser mínima: sem medições, sem storage, sem rede.
(() => {
  const dados = lerSuspensa(baseSuspensa(), location.href); // só devolve destino http(s) válido
  const $ = (id) => document.getElementById(id);

  if (!dados) {
    $("titulo").textContent = "Aba suspensa";
    $("dica").textContent = "Não foi possível ler o endereço original desta aba.";
    $("voltar").disabled = true;
    document.body.style.cursor = "default";
    return;
  }

  const site = dominio(dados.url);
  document.title = dados.titulo || site;
  $("titulo").textContent = dados.titulo || site; // sempre textContent: o título vem de fora
  $("site").textContent = site;

  let voltando = false;
  function voltar() {
    if (voltando) return;
    voltando = true;
    $("dica").textContent = "Carregando…";
    location.replace(dados.url); // replace: a página suspensa não fica no histórico da aba
  }
  document.addEventListener("click", voltar);
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); voltar(); }
  });
  // Se a extensão trocar só o "#" desta mesma aba, recomeça com os dados novos.
  addEventListener("hashchange", () => location.reload());

  // Avisa o background que a página está pronta (ele pode então descartá-la para
  // liberar até a memória desta página). Só depois de o ícone da aba estar definido,
  // senão a aba descartada ficaria sem ícone.
  let avisou = false;
  function pronta() {
    if (avisou) return;
    avisou = true;
    setTimeout(() => chrome.runtime.sendMessage({ tipo: "pronta" }).catch(() => {}), 250);
  }

  function definirIcone(href) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.append(link);
  }

  // Ícone original: no Chromium vem do próprio navegador (sem rede); senão, o que veio no endereço.
  let origem = dados.icone;
  try {
    if (chrome.runtime.getManifest().permissions?.includes("favicon"))
      origem = `${chrome.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(dados.url)}&size=32`;
  } catch {}
  if (!origem) return pronta();

  const img = new Image();
  img.onload = () => {
    $("icone").src = origem;
    $("icone").hidden = false;
    // Na barra de abas o ícone fica esmaecido, para a aba suspensa se distinguir das outras.
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const ctx = c.getContext("2d");
      ctx.globalAlpha = 0.45;
      ctx.drawImage(img, 0, 0, 32, 32);
      definirIcone(c.toDataURL("image/png"));
    } catch {
      definirIcone(origem); // ícone de outro site "suja" o canvas: usa sem esmaecer
    }
    pronta();
  };
  img.onerror = pronta;
  img.src = origem;
  setTimeout(pronta, 1500); // ícone lento não segura o aviso
})();
