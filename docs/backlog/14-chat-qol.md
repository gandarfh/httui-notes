# Epic 14 — Chat QoL (Qualidade de Vida) ✅

Edicao de mensagens, regenerar, abort em streaming, busca no historico e integracao com notes.

**Depende de:** Epic 13 (Chat Agente)
**Desbloqueia:** —
**Status:** concluido

---

## Story 01: Edicao de mensagem e regenerar ✅

Permitir editar mensagem enviada e regerar resposta.

### Tasks

- [x] Botao "editar" em mensagens do user (icone de lapis no hover)
- [x] Ao editar: substituir bolha por textarea pre-preenchido com conteudo original
- [x] Ao confirmar edicao (Cmd+Enter ou botao Send): apagar mensagens subsequentes e reenviar
- [x] Cancelar edicao com Escape
- [x] Botao "regerar" na ultima mensagem do assistant (icone de refresh)
- [x] Regerar: reenvia ultima mensagem do user sem alterar
- [x] Tauri command `delete_messages_after(session_id, turn_index)` para limpar mensagens
- [x] Frontend wrapper `deleteMessagesAfter()`

## Story 02: Continue e abort ✅

Controle do streaming em andamento.

### Tasks

- [x] Botao "parar" visivel durante streaming que envia `abort` ao sidecar
- [x] `send_chat_message` retorna `request_id` para o frontend
- [x] `useChat` armazena `activeRequestId` e usa no `abort()`
- [ ] Ao abortar: salvar mensagem parcial com flag `is_partial: true`
- [ ] Botao "continuar" em mensagens parciais (cortadas por max_tokens ou abort)

## Story 03: Busca no historico ✅

Pesquisar em sessoes e mensagens anteriores.

### Tasks

- [x] Campo de busca na sidebar de sessoes (filtra por titulo, toggle com icone de lupa)
- [x] Filtro client-side por titulo (case-insensitive)
- [x] Mensagem "No sessions found" quando busca nao retorna resultados
- [ ] Busca full-text nas mensagens (conteudo) via FTS5 no SQLite
- [ ] Highlight dos termos encontrados nos resultados

## Story 04: Observabilidade de uso

Metricas de consumo de tokens.

### Tasks

- [x] Exibir contagem de tokens por mensagem (discreto no footer da bolha) — ja implementado no Epic 12
- [ ] Agregar tokens por dia/sessao na tabela `usage_stats` (atualizar no `chat:done`)
- [ ] Criar tela "Uso" no settings com grafico de tokens/dia
- [ ] Exibir cache_read_tokens para visualizar eficiencia do cache

## Story 05: Integracao com notes ✅

Ponte entre chat e vault de notas.

### Tasks

- [x] Botao "salvar como nota" em respostas do assistant (icone LuFileDown, abre dialog save, salva .md)
- [x] Permissao `dialog:allow-save` adicionada nas capabilities
- [x] Implementar servidor MCP local expondo `search_notes`, `read_note`, `create_note`, `update_note`, etc. — `httui-mcp` binary com 13 tools
- [x] Registrar MCP server como tool disponivel para o sidecar — configurado em `sidecar/src/handlers/chat.ts` com `--vault` e `--db` args
- [ ] Comando `/note` inline no chat input para referenciar nota do vault
- [ ] Resolucao de wikilinks no contexto do chat
