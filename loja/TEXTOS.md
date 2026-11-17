# Chrome Web Store — textos para o envio

Painel: <https://chrome.google.com/webstore/devconsole> → **Novo item** → enviar `dist/memoria-das-abas-0.3.0-chrome.zip`
(gerado com `python3 ferramentas/empacotar.py`).

---

## 1. Detalhes da loja (Store listing)

**Nome** (vem do manifest): `Memória das Abas`

**Resumo** (vem do manifest, 97/132 caracteres):

```
Mostra quais abas estão pesando e suspende as mais pesadas quando a memória do computador aperta.
```

**Descrição** (colar inteira):

```
Memória das Abas mostra quais abas estão pesando no seu navegador e, quando a memória do computador aperta, suspende automaticamente as abas paradas mais pesadas. Elas continuam na barra e recarregam quando você clica.

O QUE VOCÊ VÊ
• Memória estimada de cada aba, da mais pesada para a mais leve
• CPU, quantidade de elementos, frames de outros sites e há quanto tempo cada aba está parada
• Resumo com o total de abas, a memória em uso e quanto já foi liberado
• RAM livre do computador e, no ícone, quantas abas estão pesadas

FEITA PARA QUEM TEM MUITAS ABAS
• Busca por título ou site
• Filtros: pesadas, abertas, suspensas e protegidas
• Ordenação por memória, CPU ou tempo parada
• Agrupamento por site, com a memória somada de cada um
• Suspenda uma aba, um site inteiro ou tudo o que está filtrado, com confirmação

NUNCA SUSPENDE O QUE IMPORTA
Ficam de fora automaticamente:
• a aba que você está usando e abas tocando áudio
• abas usando câmera, microfone ou compartilhando a tela
• abas com texto digitado e ainda não enviado
• abas fixadas (opcional)
• os sites que você proteger — Google Meet, Microsoft Teams, Zoom e WhatsApp Web já vêm protegidos

VOCÊ NO CONTROLE
Escolha o limite de RAM livre que dispara a suspensão, há quanto tempo a aba precisa estar parada, o que conta como "pesada" e quantas abas suspender por minuto. Se preferir, desligue a suspensão automática e use só o painel.

PRIVACIDADE
Tudo acontece no seu computador. A extensão não faz nenhuma requisição de rede e não tem conta, anúncios nem rastreamento. Títulos e endereços das abas servem só para montar a lista e ficam no armazenamento do próprio navegador. O código é aberto: https://github.com/0x03c1/memoria-das-abas

SOBRE OS NÚMEROS
Os navegadores não informam a memória real de cada aba para extensões. Os valores mostrados são estimativas (memória do JavaScript + elementos da página + frames de outros sites). Para os números exatos por processo, use o gerenciador de tarefas do navegador.

Funciona no Windows, macOS, Linux e ChromeOS.
```

**Categoria:** Produtividade → Ferramentas
**Idioma:** Português (Brasil)

**Imagens** (pasta `loja/imagens/`):

| Campo | Arquivo |
|---|---|
| Ícone da loja (128×128) | `icone-loja-128.png` |
| Capturas de tela (1280×800), nesta ordem | `captura-1-lista.png`, `captura-2-agrupado.png`, `captura-3-protecoes.png`, `captura-4-suspensas.png`, `captura-5-busca-escuro.png` |
| Bloco promocional pequeno (440×280) | `promo-pequeno-440x280.png` |
| Bloco promocional de destaque (1400×560) | `promo-banner-1400x560.png` |

**URL da página inicial:** `https://github.com/0x03c1/memoria-das-abas`
**URL de suporte:** `https://github.com/0x03c1/memoria-das-abas/issues`
**Conteúdo adulto:** Não

---

## 2. Práticas de privacidade (Privacy)

**Finalidade única:**

```
Mostrar o uso estimado de memória das abas abertas e suspender (descartar) as abas paradas e mais pesadas para liberar memória quando a RAM do computador está baixa.
```

**Justificativa — tabs:**

```
Ler título, endereço, ícone e estado de cada aba (ativa, fixada, tocando áudio, suspensa e último uso) para montar a lista no popup, decidir quais abas podem ser suspensas e suspendê-las com chrome.tabs.discard. Esses dados não saem do computador.
```

**Justificativa — storage:**

```
Guardar as configurações do usuário e o histórico das últimas 30 suspensões automáticas (storage.local), e a última medição das abas (storage.session, apagada ao fechar o navegador). Nada é sincronizado nem enviado para fora.
```

**Justificativa — alarms:**

```
Acordar o service worker a cada 1 minuto para medir as abas, atualizar o número de abas pesadas no ícone e verificar se a memória do computador está baixa.
```

**Justificativa — system.memory:**

```
Ler a RAM total e disponível do computador para suspender abas somente quando a memória livre fica abaixo do limite escolhido pelo usuário, e para mostrar esse valor no popup.
```

**Justificativa — scripting:**

```
Injetar os scripts de medição (arquivos do próprio pacote) nas abas que já estavam abertas quando a extensão é instalada ou atualizada. Sem isso, essas abas só seriam medidas depois de recarregadas.
```

**Justificativa — permissão de host (http://*/*, https://*/*):**

```
Os scripts de conteúdo rodam em páginas http/https para medir localmente o peso de cada página (memória do JavaScript, número de elementos, frames de outros sites e tarefas longas de CPU) e para saber se a aba está usando câmera/microfone/tela ou tem texto digitado e não enviado — nesses casos a aba nunca é suspensa automaticamente. Os scripts só respondem quando a própria extensão pede uma medição; não copiam, guardam nem enviam o conteúdo das páginas. É preciso acesso a todos os sites porque qualquer aba aberta pode ser a que está pesando.
```

**Código remoto:** `Não, não estou usando código remoto`
(Todo o JavaScript está no pacote; não há eval, scripts externos nem WebAssembly.)

**Uso de dados — marcar:**
- [x] **Histórico da Web** — títulos e URLs das abas abertas, usados só para a lista
- [x] **Conteúdo do site** — medidas da página e a verificação "há texto não enviado? sim/não"
- Demais categorias: não marcar (sem dados pessoais, de saúde, financeiros, de autenticação, comunicações pessoais, localização ou atividade do usuário)

**Certificações — marcar as três:**
- [x] Não vendo nem transfiro dados de usuários a terceiros, fora dos casos de uso aprovados
- [x] Não uso nem transfiro dados de usuários para finalidades não relacionadas à finalidade única do item
- [x] Não uso nem transfiro dados de usuários para determinar capacidade de crédito ou para empréstimos

**URL da política de privacidade:** `https://github.com/0x03c1/memoria-das-abas/blob/main/PRIVACY.md`

---

## 3. Distribuição

- **Visibilidade:** Pública
- **Regiões:** Todas
- **Pagamento:** Gratuito

## 4. Instruções de teste (opcional)

```
Não precisa de conta. Abra 5 ou mais abas em sites diferentes e clique no ícone da extensão: a lista mostra a memória estimada de cada aba, com busca, filtros e agrupamento por site. O botão ⏸ suspende uma aba. A suspensão automática acontece quando a RAM livre do computador fica abaixo do limite (padrão 15%, ajustável em ⚙ Configurações; para testar, aumente o limite para 60% e reduza "aba parada há pelo menos" para 1 minuto). Abas com câmera/microfone, com texto digitado não enviado, fixadas ou de sites protegidos nunca são suspensas automaticamente.
```
