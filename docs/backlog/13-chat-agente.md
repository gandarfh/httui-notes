# Epic 13 — Chat Agente (Tools & Permissoes) ✅

Ativacao de tools (Read, Glob, Grep, Bash, Edit, Write), sistema de permissoes com modal, cwd por sessao e renderizacao de tool use na UI.

**Depende de:** Epic 12 (Chat MVP)
**Desbloqueia:** Epic 14 (Chat QoL)
**Status:** concluido

---

## Story 01: Protocolo de tool use no sidecar ✅

Suporte a tool calls no sidecar Node. (Implementado no Epic 11)

### Tasks

- [x] Implementar `canUseTool` callback no sidecar: emite `permission_request` via stdout e aguarda `permission_response` via stdin
- [x] Mapear `tool_name` e `tool_input` do SDK para o formato NDJSON do protocolo
- [x] Emitir `tool_use` (tool iniciada) e `tool_result` (resultado) como eventos separados
- [x] Propagar `allowed_tools` do comando `chat` para a configuracao do `query()` do SDK (Read, Glob, Grep, Bash, Edit, Write)

## Story 02: PermissionBroker no Rust

Gerenciamento de decisoes de permissao no lado Tauri. (Simplificado — sem tabela de regras persistidas)

### Tasks

- [x] Tools ativadas: Read, Glob, Grep, Bash, Edit, Write
- [ ] Criar modulo `src-tauri/src/chat/permissions.rs` com struct `PermissionBroker`
- [ ] Implementar verificacao em cascata: regra persistida → regra de sessao → emitir evento para UI
- [ ] Criar migration para tabela `tool_permissions`
- [ ] Implementar auto-allow para Read/Glob/Grep dentro do cwd da sessao
- [ ] Hard deny para Edit/Write fora do cwd (sem perguntar)
- [ ] Bash nunca auto-aprovado, sem excecao

## Story 03: Modal de permissao na UI ✅

Interface para aprovar/negar tool calls.

### Tasks

- [x] Escutar evento Tauri `chat:permission_request` no hook useChat
- [x] Criar componente `PermissionModal` com Portal + Box (evita focus trap do ProseMirror)
- [x] Exibir nome da tool e input em monospace, com scroll
- [x] Botoes: Negar (foco default) e Permitir
- [x] Atalhos: `Enter` = Negar, `Cmd+Enter` = Permitir
- [x] Comando `respond_chat_permission` ja implementado (Epic 11)
- [ ] Radio options: "Permitir so desta vez", "Permitir nesta sessao", "Permitir sempre"

## Story 04: Renderizacao de tool use na conversa ✅

Exibir tool calls e resultados inline na mensagem do assistant.

### Tasks

- [x] Escutar eventos `chat:tool_use` e `chat:tool_result` no hook useChat (toolActivity state)
- [x] Criar componente `ToolUseBlock`: card colapsavel com icone, nome da tool, input e resultado
- [x] Indicar erro de tool (is_error) com estilo vermelho
- [x] Indicar tool pendente com estado "Executing..." e icone spinner
- [x] Posicionar tool use blocks inline na mensagem do assistant
- [x] Persistir tool_calls no SQLite (insert no ToolUse, update result no ToolResult)
- [x] Reconstruir tool_calls ao carregar historico (list_messages join tool_calls)

## Story 05: Configuracao de cwd por sessao ✅

Diretorio de trabalho associado a cada sessao de chat.

### Tasks

- [x] Campo `cwd` na tabela sessions (ja existia do Epic 11)
- [x] Passar cwd ao sidecar no comando `chat`
- [x] Sidecar configura cwd no `query()` do Agent SDK
- [x] Tauri command `update_chat_session_cwd` para alterar cwd
- [x] Frontend wrapper `updateChatSessionCwd`
- [ ] UI para exibir/alterar cwd na header da sessao (file picker)
- [ ] Default: usar vault path atual como cwd

## Story 06: Tela de gerenciamento de permissoes

Interface para revisar e deletar regras persistidas. (Adiado para Epic 14)

### Tasks

- [ ] Criar componente `PermissionSettings` (acessivel via settings do app)
- [ ] Listar regras persistidas agrupadas por workspace_path
- [ ] Exibir: tool_name, input_pattern, decision, data de criacao
- [ ] Botao de deletar regra individual
