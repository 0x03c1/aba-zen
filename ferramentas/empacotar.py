#!/usr/bin/env python3
"""Gera os pacotes em dist/ (o manifest.json da raiz é o do Chromium):
  - memoria-das-abas-<versão>-chrome.zip   (Chrome Web Store / Edge Add-ons)
  - memoria-das-abas-<versão>-firefox.zip  (addons.mozilla.org)

Cada pacote leva só os arquivos da extensão e um manifest limpo para a loja
(sem as chaves do outro navegador). Uso: python3 ferramentas/empacotar.py
"""
import json
import pathlib
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ARQUIVOS = [
    "background.js", "config.js", "comum.js", "medidor.js", "midia.js",
    "popup.html", "popup.js", "popup.css",
    "options.html", "options.js", "options.css",
]


def manifest_para(navegador):
    m = json.loads((RAIZ / "manifest.json").read_text(encoding="utf-8"))
    if navegador == "chrome":
        m.pop("browser_specific_settings", None)
    else:
        # O Firefox não tem service worker de extensão: usa script de fundo,
        # com o config.js carregado antes (no Chromium o background.js usa importScripts).
        # Fica só aqui, porque o Chrome acusa erro com "background.scripts" no MV3.
        m.pop("minimum_chrome_version", None)
        m["background"] = {"scripts": ["config.js", "background.js"]}
        m["permissions"] = [p for p in m["permissions"] if p != "system.memory"]
    return m


def empacotar(navegador):
    manifest = manifest_para(navegador)
    destino = RAIZ / "dist" / f"memoria-das-abas-{manifest['version']}-{navegador}.zip"
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
