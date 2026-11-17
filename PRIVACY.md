# Política de privacidade — Memória das Abas

*Última atualização: 16 de novembro de 2026*

A Memória das Abas funciona **inteiramente no seu computador**. Ela não tem servidor, não faz nenhuma requisição de rede, não tem conta, anúncios, análise de uso nem rastreamento.

## Quais dados a extensão usa e para quê

| Dado | Para quê | Onde fica |
|---|---|---|
| Título, endereço (URL), ícone e estado das abas (ativa, fixada, tocando áudio, suspensa, último uso) | Montar a lista de abas, decidir quais podem ser suspensas e suspendê-las | `storage.session` do navegador — apagado ao fechar o navegador |
| Medidas de cada página: memória do JavaScript, número de elementos, frames de outros sites, tempo de CPU, quantidade de vídeos | Estimar quanto cada aba pesa | `storage.session` — apagado ao fechar o navegador |
| Se a página está usando câmera/microfone/tela e se há texto digitado e ainda não enviado (apenas "sim" ou "não"; o texto em si não é copiado nem guardado) | Nunca suspender essas abas automaticamente | Não é guardado |
| RAM total e disponível do computador | Decidir quando suspender abas e mostrar no popup | `storage.session` |
| Suas configurações e o histórico das últimas 30 suspensões automáticas (título, URL, horário e memória estimada) | Lembrar suas preferências e mostrar o que foi suspenso | `storage.local` do navegador, no seu computador |

## O que a extensão **não** faz

- Não envia nenhum dado para fora do seu computador, nem para o desenvolvedor nem para terceiros.
- Não vende, compartilha nem transfere dados.
- Não usa dados para publicidade, perfil de usuário ou análise de crédito.
- Não lê, copia nem guarda o conteúdo das páginas, senhas ou o texto que você digita.

## Como apagar os dados

Remover a extensão apaga todos os dados dela. O histórico de suspensões também pode ser zerado removendo e reinstalando a extensão.

## Código aberto

O código-fonte é público e pode ser auditado: <https://github.com/0x03c1/memoria-das-abas>

## Contato

Dúvidas ou problemas: <https://github.com/0x03c1/memoria-das-abas/issues>

---

## Privacy policy (English)

Memória das Abas runs entirely on your computer. It has no server, makes no network requests, and has no accounts, ads, analytics or tracking. Tab titles, URLs and state, per-page measurements (JavaScript memory, element count, third-party frames, CPU time), whether a page uses camera/microphone or has unsent typed text (yes/no only; the text itself is never copied or stored), and system RAM are used only to list tabs and decide which to discard. Settings and the last 30 automatic discards are kept in the browser's local storage on your device. No data is sold, shared or transferred, or used for any purpose unrelated to the extension's single purpose. Uninstalling the extension deletes all its data.
