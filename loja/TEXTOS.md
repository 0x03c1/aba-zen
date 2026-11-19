# Chrome Web Store — textos para o envio

Painel: <https://chrome.google.com/webstore/devconsole> → abrir o item → **Pacote** → **Enviar novo pacote** → `dist/aba-zen-0.4.0-chrome.zip`
(gerado com `python3 ferramentas/empacotar.py`).

---

## 1. Detalhes da loja (Store listing)

**Nome** (vem do manifest): `Aba Zen`

**Resumo** (vem do manifest, 107/132 caracteres):

```
Suspende abas paradas sem recarregar ao visitar, guarda abas em grupos e recupera a sessão. Leve, sem rede.
```

**Descrição** (colar inteira):

```
Aba Zen suspende as abas que você não está usando, guarda abas em grupos para abrir depois e recupera suas abas quando o navegador fecha de repente. Tudo isso gastando o mínimo: a própria extensão quase não usa memória nem CPU.

SUSPENDE SEM ATRAPALHAR
• A aba parada há 30 minutos (você escolhe o tempo) vira uma página leve, com o mesmo título e ícone
• Visitar a aba NÃO recarrega o site: ele só volta quando você clica na página ou aperta Enter
• Com a memória do computador apertada, suspende mais cedo
• A aba suspensa não ocupa memória

GUARDA ABAS PARA DEPOIS
• Salve as abas da janela num grupo, fechando ou não
• Abra de novo uma aba, um grupo ou tudo — as abas restauradas já abrem suspensas e só carregam quando você clica
• Renomeie grupos, busque, exporte e importe (inclusive a lista exportada pelo OneTab)

RECUPERA O QUE SE PERDEU
• Se o navegador travar ou fechar de repente, ou se uma janela cheia for fechada sem querer, as últimas 5 sessões ficam guardadas para restaurar

NUNCA SUSPENDE O QUE IMPORTA
Ficam de fora automaticamente:
• a aba que você está usando e abas tocando áudio
• abas usando câmera, microfone ou compartilhando a tela
• abas com texto digitado e ainda não enviado
• abas fixadas (opcional)
• os sites que você proteger — Google Meet, Microsoft Teams, Zoom e WhatsApp Web já vêm protegidos
• a aba que você marcar como "não suspender"

VEJA O QUE ESTÁ PESANDO
Ao abrir o painel: memória estimada, CPU e tempo parada de cada aba, com busca, filtros, ordenação e agrupamento por site. Suspenda ou reative uma aba, um site inteiro ou tudo o que está filtrado.

FEITA PARA SER LEVE
• Não fica medindo as abas: a medição só acontece com o painel aberto
• Uma verificação rápida por minuto, e mais nada
• Sem requisições de rede, sem bibliotecas externas

ATALHOS
• Alt+Shift+S — suspende ou reativa a aba atual
• Alt+Shift+A — salva e fecha as abas da janela

PRIVACIDADE
Tudo acontece no seu computador. A extensão não faz nenhuma requisição de rede e não tem conta, anúncios nem rastreamento. As abas salvas e as sessões ficam no armazenamento do próprio navegador; janelas anônimas nunca são guardadas. O código é aberto: https://github.com/0x03c1/aba-zen

É BOM SABER
• As abas suspensas são páginas da extensão: se você remover ou desativar a extensão, elas fecham. Reative as abas e exporte as abas salvas antes.
• Os navegadores não informam a memória real de cada aba para extensões; os valores do painel são estimativas.

Funciona no Windows, macOS, Linux e ChromeOS.
```

**Categoria:** Produtividade → Ferramentas
**Idioma:** Português (Brasil)

**Imagens** (pasta `loja/imagens/`):

| Campo | Arquivo |
|---|---|
| Ícone da loja (128×128) | `icone-loja-128.png` |
| Capturas de tela (1280×800), nesta ordem | `captura-1-suspensa.png`, `captura-2-lista.png`, `captura-3-salvas.png`, `captura-4-recuperar-escuro.png`, `captura-5-protecoes.png` |
| Bloco promocional pequeno (440×280) | `promo-pequeno-440x280.png` |
| Bloco promocional de destaque (1400×560) | `promo-banner-1400x560.png` |

**URL da página inicial:** `https://github.com/0x03c1/aba-zen`
**URL de suporte:** `https://github.com/0x03c1/aba-zen/issues`
**Conteúdo adulto:** Não

---

## 2. Práticas de privacidade (Privacy)

**Finalidade única:**

```
Gerenciar as abas abertas para reduzir o uso de memória: suspender as abas paradas, guardar abas em grupos para abrir depois e recuperar as abas da sessão após um fechamento inesperado.
```

**Justificativa — tabs:**

```
Ler título, endereço, ícone e estado de cada aba (ativa, fixada, tocando áudio, último uso) para decidir quais estão paradas e suspendê-las (trocando o endereço da aba por uma página leve da própria extensão, que guarda o endereço original), reativá-las, salvar abas em grupos, fechá-las e restaurá-las a pedido do usuário, e manter a foto da sessão usada na recuperação. Esses dados não saem do computador.
```

**Justificativa — storage:**

```
Guardar localmente (storage.local) as configurações, o histórico das últimas 30 suspensões automáticas, os grupos de abas salvas pelo usuário e as fotos da sessão (até 5 sessões anteriores) usadas para recuperar abas. A última medição das abas fica em storage.session, apagada ao fechar o navegador. Nada é sincronizado nem enviado para fora.
```

**Justificativa — unlimitedStorage:**

```
As abas salvas pelo usuário (título, endereço e ícone) ficam em storage.local e podem passar do limite padrão de 10 MB para quem guarda milhares de abas. A permissão evita que salvar abas falhe por falta de espaço e que o usuário perca abas. Não dá acesso a nenhum dado adicional.
```

**Justificativa — alarms:**

```
Acordar o service worker a cada 1 minuto para suspender as abas paradas há mais tempo que o limite escolhido e atualizar a foto da sessão quando a lista de abas mudou.
```

**Justificativa — system.memory:**

```
Ler a RAM total e disponível do computador para suspender abas mais cedo quando a memória livre fica abaixo do limite escolhido pelo usuário, e para mostrar esse valor no popup.
```

**Justificativa — scripting:**

```
Injetar os scripts de conteúdo (arquivos do próprio pacote) nas abas que já estavam abertas quando a extensão é instalada ou atualizada. Sem isso, essas abas só teriam a proteção contra perda de texto digitado e de chamadas em andamento depois de recarregadas.
```

**Justificativa — favicon:**

```
Mostrar o ícone do site na página de aba suspensa e nas listas de abas (popup e abas salvas) a partir do cache de ícones do próprio navegador, sem fazer nenhuma requisição de rede ao site. Assim o usuário reconhece a aba suspensa na barra de abas.
```

**Justificativa — permissão de host (http://*/*, https://*/*):**

```
Os scripts de conteúdo rodam em páginas http/https para saber se a aba está usando câmera/microfone/tela ou tem texto digitado e não enviado — nesses casos a aba nunca é suspensa automaticamente, para o usuário não perder uma chamada ou o que escreveu — e para medir localmente o peso da página (memória do JavaScript, número de elementos, frames de outros sites e tarefas longas de CPU) quando o usuário abre o popup. Os scripts só informam "sim/não" e respondem quando a própria extensão pede; não copiam, guardam nem enviam o conteúdo das páginas. É preciso acesso a todos os sites porque qualquer aba aberta pode ficar parada e ser suspensa.
```

**Código remoto:** `Não, não estou usando código remoto`
(Todo o JavaScript está no pacote; não há eval, scripts externos nem WebAssembly.)

**Uso de dados — marcar:**
- [x] **Histórico da Web** — títulos e URLs das abas abertas, das abas salvas e das fotos da sessão, guardados só no computador do usuário
- [x] **Conteúdo do site** — medidas da página e a verificação "há texto não enviado? sim/não"
- Demais categorias: não marcar (sem dados pessoais, de saúde, financeiros, de autenticação, comunicações pessoais, localização ou atividade do usuário)

**Certificações — marcar as três:**
- [x] Não vendo nem transfiro dados de usuários a terceiros, fora dos casos de uso aprovados
- [x] Não uso nem transfiro dados de usuários para finalidades não relacionadas à finalidade única do item
- [x] Não uso nem transfiro dados de usuários para determinar capacidade de crédito ou para empréstimos

**URL da política de privacidade:** `https://github.com/0x03c1/aba-zen/blob/main/PRIVACY.md`

---

## 3. Distribuição

- **Visibilidade:** Pública
- **Regiões:** Todas
- **Pagamento:** Gratuito

## 4. Instruções de teste (opcional)

```
Não precisa de conta. Abra 5 ou mais abas em sites diferentes.
1) Suspender: clique no ícone da extensão e suspenda uma aba pela lista (ou use Alt+Shift+S na aba atual). A aba passa a mostrar uma página leve com o título do site; visitar a aba não recarrega o site, clicar na página sim.
2) Automático: em Configurações, reduza "aba parada há pelo menos" para 1 minuto; as abas em segundo plano são suspensas no minuto seguinte. Abas com câmera/microfone, com texto digitado não enviado, tocando áudio, fixadas ou de sites protegidos nunca são suspensas automaticamente.
3) Salvar: no popup, salve e feche as abas da janela (ou Alt+Shift+A). Abre a página "Abas salvas", de onde dá para restaurar uma aba ou o grupo inteiro, exportar e importar.
4) Recuperação: feche uma janela com 5 ou mais abas mantendo outra aberta; em até 1 minuto a sessão aparece em "Abas salvas" → sessões automáticas.
```
