# Política de privacidade — Aba Zen

*Última atualização: 18 de novembro de 2026*

A Aba Zen funciona **inteiramente no seu computador**. Ela não tem servidor, não faz nenhuma requisição de rede, não tem conta, anúncios, análise de uso nem rastreamento.

## Quais dados a extensão usa e para quê

| Dado | Para quê | Onde fica |
|---|---|---|
| Título, endereço (URL), ícone e estado das abas (ativa, fixada, tocando áudio, suspensa, último uso) | Decidir quais abas estão paradas e suspendê-las; montar a lista do popup | `storage.session` do navegador — apagado ao fechar o navegador |
| Título, endereço e ícone da aba suspensa | Mostrar a página de aba suspensa e voltar ao site quando você clica | No próprio endereço da aba suspensa (parte depois do `#`), dentro do navegador |
| **Abas salvas**: grupos com título, endereço e ícone de cada aba, nome do grupo e data | Abrir essas abas de novo quando você pedir | `storage.local` do navegador, no seu computador, até você excluir |
| **Fotos da sessão**: título, endereço, ícone e posição das abas abertas (a sessão atual e até 5 sessões automáticas anteriores) | Recuperar abas depois de um travamento, do fechamento repentino do navegador ou de uma janela fechada sem querer | `storage.local`; as mais antigas são apagadas sozinhas |
| Suas configurações e o histórico das últimas 30 suspensões automáticas (título, URL e horário) | Lembrar suas preferências e mostrar o que foi suspenso | `storage.local` |
| Medidas de cada página: memória do JavaScript, número de elementos, frames de outros sites, tempo de CPU, quantidade de vídeos | Estimar quanto cada aba pesa — só quando você abre o popup | `storage.session` — apagado ao fechar o navegador |
| Se a página está usando câmera/microfone/tela e se há texto digitado e ainda não enviado (apenas "sim" ou "não"; o texto em si não é copiado nem guardado) | Nunca suspender essas abas automaticamente | `storage.session` — apagado ao fechar o navegador |
| RAM total e disponível do computador (só em navegadores Chromium) | Suspender mais cedo quando a memória aperta e mostrar no popup | `storage.session` |

**Janelas anônimas nunca são guardadas**: nem nas abas salvas, nem nas fotos da sessão.

**Exportação:** o arquivo com as suas abas salvas só é gerado quando você pede, e é salvo no seu próprio computador. A extensão não o envia a lugar nenhum; o que acontece com ele depois é decisão sua.

## O que a extensão **não** faz

- Não envia nenhum dado para fora do seu computador, nem para o desenvolvedor nem para terceiros.
- Não sincroniza dados entre aparelhos.
- Não vende, compartilha nem transfere dados.
- Não usa dados para publicidade, perfil de usuário ou análise de crédito.
- Não lê, copia nem guarda o conteúdo das páginas, senhas ou o texto que você digita.

## Permissões e por que cada uma existe

| Permissão | Por quê |
|---|---|
| `tabs` | Ler título, endereço, ícone e estado das abas; suspender, reativar, salvar, fechar e restaurar abas |
| `storage` | Guardar configurações, histórico, abas salvas e fotos da sessão no navegador |
| `unlimitedStorage` | Permitir que as abas salvas passem do limite padrão de 10 MB do `storage.local`, para quem guarda milhares de abas. Não dá acesso a nenhum dado novo |
| `alarms` | Acordar a extensão uma vez por minuto para suspender abas paradas e atualizar a foto da sessão |
| `system.memory` (só Chromium) | Ler a RAM total e disponível para suspender mais cedo quando a memória aperta |
| `scripting` | Colocar os scripts da própria extensão nas abas que já estavam abertas quando ela é instalada ou atualizada |
| `favicon` (só Chromium) | Mostrar o ícone do site na aba suspensa e nas listas a partir do cache do próprio navegador, **sem** fazer requisição ao site |
| Acesso a páginas `http`/`https` | Saber se a aba tem câmera/microfone/tela em uso ou texto digitado não enviado (para não suspendê-la) e medir o peso da página quando o popup pede |

## Como apagar os dados

- Abas salvas e sessões automáticas: exclua pela página **Abas salvas**.
- Tudo de uma vez: remover a extensão apaga todos os dados dela. Atenção: as abas suspensas são páginas da extensão e fecham junto — reative-as e exporte as abas salvas antes.

## Código aberto

O código-fonte é público e pode ser auditado: <https://github.com/0x03c1/aba-zen>

## Contato

Dúvidas ou problemas: <https://github.com/0x03c1/aba-zen/issues>

---

## Privacy policy (English)

Aba Zen runs entirely on your computer. It has no server, makes no network requests, and has no accounts, ads, analytics or tracking. Tab titles, URLs, icons and state are used only to suspend idle tabs, list tabs, save tabs you ask it to save, and keep session snapshots (the current session plus up to 5 previous ones) so tabs can be recovered after a crash; these, along with your settings and the last 30 automatic suspensions, are kept in the browser's local storage on your device. Per-page measurements (JavaScript memory, element count, third-party frames, CPU time), whether a page uses camera/microphone or has unsent typed text (yes/no only; the text itself is never copied or stored), and system RAM are kept only in session storage, cleared when the browser closes. Incognito windows are never saved. Exports are local files created only when you ask. No data is synced, sold, shared or transferred, or used for any purpose unrelated to the extension's single purpose. Uninstalling the extension deletes all its data.
