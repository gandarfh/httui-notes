# Epic 11 — Chat Sidecar & Protocolo ✅

Infraestrutura do chat: processo sidecar Node com Agent SDK, protocolo NDJSON, supervisao e persistencia SQLite.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 12 (Chat MVP), Epic 13 (Chat Agente)
**Status:** concluido

---

## Story 01: Sidecar Node com Agent SDK ✅

Setup do binario sidecar TypeScript que encapsula o Claude Code via Agent SDK.

### Tasks

- [x] Criar workspace `sidecar/` com package.json e dependencia `@anthropic-ai/claude-agent-sdk`
- [x] Implementar entrypoint que le stdin (NDJSON) e escreve stdout (NDJSON)
- [x] Implementar handler `chat`: recebe content blocks, chama `query()` do SDK, streama eventos
- [x] Implementar handler `abort`: cancela query em andamento via `interrupt()`
- [x] Implementar handler `ping` / `pong` para health check
- [x] Suportar `claude_session_id` para resume de sessao existente
- [x] Configurar build com `bun --compile` para eliminar dependencia de Node
- [x] Limpar `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do env ao iniciar (forcar uso via Max)

## Story 02: SidecarManager no Rust ✅

Gerenciamento do processo sidecar no lado Tauri.

### Tasks

- [x] Criar modulo `src-tauri/src/chat/sidecar.rs` com struct `SidecarManager`
- [x] Implementar `spawn()`: inicia processo sidecar via `tauri-plugin-shell` sidecar
- [x] Implementar escritor stdin: serializa comandos como NDJSON e envia ao sidecar
- [x] Implementar leitor stdout: task Tokio dedicada parseando NDJSON por linha
- [x] Implementar multiplexacao por `request_id`: mapa de `pending_requests` com canais mpsc
- [x] Implementar leitor stderr: captura logs do sidecar e escreve em eprintln
- [x] Limpar `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do env antes do spawn (via `.env("KEY", "")`)

## Story 03: Supervisao e health check ✅

Resiliencia do processo sidecar.

### Tasks

- [x] Implementar deteccao de sidecar morto via `CommandEvent::Terminated`
- [x] Notificar todas as requests pendentes com erro `category: "internal"` quando sidecar morre
- [x] Implementar respawn com backoff exponencial (1s, 2s, 4s, 8s, 30s max)
- [x] Implementar health check periodico (30s): envia `ping`, espera `pong`
- [x] Se health check falhar (timeout 5s), matar processo e supervisor respawna
- [x] Tratar `on_window_event(CloseRequested)`: enviar `abort` para requests ativas, aguardar 2s, matar processo

## Story 04: Protocolo NDJSON ✅

Tipos e parsing do protocolo de comunicacao.

### Tasks

- [x] Definir tipos Rust para mensagens Rust→Sidecar: `Chat`, `PermissionResponse`, `Abort`, `Ping`
- [x] Definir tipos Rust para mensagens Sidecar→Rust: `Session`, `TextDelta`, `ToolUse`, `ToolResult`, `PermissionRequest`, `Done`, `Error`, `Pong`
- [x] Implementar serialization/deserialization com serde + tag `type`
- [x] Implementar dispatch de eventos recebidos para o handler correto
- [x] Escrever testes unitarios para parsing de cada tipo de mensagem (12 testes)

## Story 05: Schema SQLite para chat ✅

Tabelas de persistencia do historico de chat.

### Tasks

- [x] Criar migration para tabela `sessions` (id, claude_session_id, title, cwd, created_at, updated_at, archived_at)
- [x] Criar migration para tabela `messages` (id, session_id, role, turn_index, content_json, tokens_in, tokens_out, is_partial, created_at)
- [x] Criar migration para tabela `attachments` (id, message_id, kind, media_type, path, size_bytes, created_at)
- [x] Criar migration para tabela `tool_calls` (id, message_id, tool_use_id, tool_name, input_json, result_json, is_error, created_at)
- [x] Criar migration para tabela `usage_stats` (date, session_id, input_tokens, output_tokens, cache_read_tokens)
- [x] Criar indices: `idx_sessions_updated`, `idx_messages_session`
- [x] Implementar funcoes CRUD no Rust: create/list/get/archive sessions, insert/list messages, insert/update tool_calls (8 testes)

## Story 06: Tauri commands para chat ✅

Comandos IPC expostos ao frontend.

### Tasks

- [x] `send_chat_message(session_id, text, attachments)` — persiste mensagem do user, despacha para sidecar, streama eventos via Tauri events
- [x] `abort_chat(request_id)` — envia abort ao sidecar para request em andamento
- [x] `list_chat_sessions()` — lista sessoes nao-arquivadas ordenadas por updated_at DESC
- [x] `get_chat_session(session_id)` — retorna sessao com metadados
- [x] `archive_chat_session(session_id)` — soft delete (set archived_at)
- [x] `list_chat_messages(session_id)` — retorna mensagens + tool_calls da sessao
- [x] `create_chat_session(cwd)` — cria sessao draft
- [x] `respond_chat_permission(permission_id, behavior, message)` — responde a permission request
- [x] Registrar todos os commands no builder do Tauri
- [x] Criar frontend wrappers em `src/lib/tauri/chat.ts`
