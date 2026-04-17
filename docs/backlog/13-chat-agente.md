# Epic 13 — Chat Agente (Tools & Permissoes)

Ativacao de tools (Read, Glob, Grep, Bash, Edit, Write), sistema de permissoes com modal, cwd por sessao e renderizacao de tool use na UI.

**Depende de:** Epic 12 (Chat MVP)
**Desbloqueia:** Epic 14 (Chat QoL)
**Status:** backlog

---

## Story 01: Protocolo de tool use no sidecar

Suporte a tool calls no sidecar Node.

### Tasks

- [ ] Implementar `canUseTool` callback no sidecar: emite `permission_request` via stdout e aguarda `permission_response` via stdin
- [ ] Mapear `tool_name` e `tool_input` do SDK para o formato NDJSON do protocolo
- [ ] Emitir `tool_use` (tool iniciada) e `tool_result` (resultado) como eventos separados
- [ ] Propagar `allowed_tools` do comando `chat` para a configuracao do `query()` do SDK
- [ ] Testar fluxo completo: chat → tool_use → permission_request → permission_response → tool_result → done

## Story 02: PermissionBroker no Rust

Gerenciamento de decisoes de permissao no lado Tauri.

### Tasks

- [ ] Criar modulo `src-tauri/src/chat/permissions.rs` com struct `PermissionBroker`
- [ ] Implementar verificacao em cascata: regra persistida → regra de sessao → emitir evento para UI
- [ ] Criar migration para tabela `tool_permissions` (workspace_path, tool_name, input_pattern, decision, created_at)
- [ ] Implementar match de `input_pattern` (glob) contra input serializado
- [ ] Implementar armazenamento de regra de sessao em memoria (`HashMap<(tool, pattern), decision>`)
- [ ] Implementar auto-allow para Read/Glob/Grep dentro do cwd da sessao
- [ ] Hard deny para Edit/Write fora do cwd (sem perguntar)
- [ ] Bash nunca auto-aprovado, sem excecao
- [ ] WebFetch sempre perguntado

## Story 03: Modal de permissao na UI

Interface para aprovar/negar tool calls.

### Tasks

- [ ] Escutar evento Tauri `chat:permission_request` com `session_id`, `permission_id`, `tool_name`, `tool_input`
- [ ] Criar componente `PermissionModal` com Portal + Box (nao Dialog, para evitar focus trap)
- [ ] Exibir nome da tool e input em monospace, sem reformatar, com scroll horizontal
- [ ] Radio options: "Permitir so desta vez", "Permitir nesta sessao", "Permitir sempre (workspace)"
- [ ] Bash nao tem opcao "sempre" — somente "desta vez" ou "nesta sessao"
- [ ] Botoes: Negar (foco default) e Permitir
- [ ] Atalhos: `Enter` = Negar, `Cmd+Enter` = Permitir
- [ ] Implementar Tauri command `respond_permission(permission_id, decision)` que envia `permission_response` ao sidecar

## Story 04: Renderizacao de tool use na conversa

Exibir tool calls e resultados inline na mensagem do assistant.

### Tasks

- [ ] Escutar eventos `chat:tool_use` e `chat:tool_result`
- [ ] Criar componente `ToolUseBlock`: card colapsavel com icone de ferramenta, nome da tool e input
- [ ] Mostrar resultado da tool dentro do card (texto com syntax highlighting se aplicavel)
- [ ] Indicar erro de tool (is_error) com estilo vermelho
- [ ] Indicar tool aguardando permissao com estado "pendente" (spinner ou icone de cadeado)
- [ ] Posicionar tool use blocks inline na mensagem do assistant, entre texto antes e depois
- [ ] Persistir tool_calls no SQLite e reconstruir ao carregar historico

## Story 05: Configuracao de cwd por sessao

Diretorio de trabalho associado a cada sessao de chat.

### Tasks

- [ ] Adicionar campo `cwd` no form de criacao de sessao (file picker para diretorio)
- [ ] Exibir cwd na header da sessao (com icone de pasta)
- [ ] Passar cwd ao sidecar no comando `chat`
- [ ] Sidecar configura cwd no `query()` do Agent SDK
- [ ] Permitir alterar cwd de sessao existente (apenas quando idle)
- [ ] Default: usar vault path atual como cwd se nenhum especificado

## Story 06: Tela de gerenciamento de permissoes

Interface para revisar e deletar regras persistidas.

### Tasks

- [ ] Criar componente `PermissionSettings` (acessivel via settings do app)
- [ ] Listar regras persistidas agrupadas por workspace_path
- [ ] Exibir: tool_name, input_pattern (ou "todas"), decision (allow/deny), data de criacao
- [ ] Botao de deletar regra individual
- [ ] Botao de limpar todas as regras de um workspace
