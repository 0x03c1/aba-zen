#!/usr/bin/env python3
"""Gera os pacotes em dist/ (o manifest.json da raiz é o do Chromium):
  - aba-zen-<versão>-chrome.zip   (Chrome Web Store / Edge Add-ons)
  - aba-zen-<versão>-firefox.zip  (addons.mozilla.org)

Cada pacote leva só os arquivos da extensão e um manifest limpo para a loja
(sem as chaves do outro navegador). Uso: python3 ferramentas/empacotar.py
"""
import json
import pathlib
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ARQUIVOS = [
    "config.js", "sessoes.js", "comum.js", "base.css",
    "background.js", "medidor.js", "midia.js",
    "popup.html", "popup.js", "popup.css",
    "options.html", "options.js", "options.css",
    "salvas.html", "salvas.js", "salvas.css",
    "suspensa.html", "suspensa.js", "suspensa.css",
]
# Permissões que só existem no Chromium (o Firefox recusa ou avisa).
SO_CHROMIUM = {"system.memory", "favicon"}


def manifest_para(navegador):
    m = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
    if navegador == "chrome":
        m.pop("browser_specific_settings", None)
    else:
        # O Firefox não tem service worker de extensão: usa script de fundo,
        # com config.js e sessoes.js carregados antes (no Chromium o background.js usa
        # importScripts). Fica só aqui, porque o Chrome acusa erro com "background.scripts" no MV3.
        m.pop("minimum_chrome_version", None)
        m["background"] = {"scripts": ["config.js", "sessoes.js", "background.js"]}
        m["permissions"] = [p for p in m["permissions"] if p not in SO_CHROMIUM]
    return m


def empacotar(navegador):
    manifest = manifest_para(navegador)
    destino = RAIZ / "dist" / f"aba-zen-{manifest['version']}-{navegador}.zip"
    destino.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        for nome in ARQUIVOS:
            z.write(RAIZ / nome, nome)
        for icone in sorted((RAIZ / "icones").glob("*.png")):
            z.write(icone, f"icones/{icone.name}")
    print(f"{destino.relative_to(RAIZ)}  ({destino.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    faltando = [a for a in ARQUIVOS if not (RAIZ / a).exists()]
    if faltando:
        raise SystemExit(f"Arquivos não encontrados: {faltando}")
    empacotar("chrome")
    empacotar("firefox")
