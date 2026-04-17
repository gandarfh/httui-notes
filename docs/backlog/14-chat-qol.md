# Epic 14 — Chat QoL (Qualidade de Vida)

Edicao de mensagens, regenerar, abort em streaming, busca no historico e integracao com notes.

**Depende de:** Epic 13 (Chat Agente)
**Desbloqueia:** —
**Status:** backlog

---

## Story 01: Edicao de mensagem e regenerar

Permitir editar mensagem enviada e regerar resposta.

### Tasks

- [ ] Botao "editar" em mensagens do user (icone de lapis no hover)
- [ ] Ao editar: substituir bolha por textarea pre-preenchido com conteudo original
- [ ] Ao confirmar edicao: apagar mensagens subsequentes na sessao e reenviar
- [ ] Botao "regerar" na ultima mensagem do assistant (icone de refresh)
- [ ] Regerar: reenvia ultima mensagem do user sem alterar

## Story 02: Continue e abort

Controle do streaming em andamento.

### Tasks

- [ ] Botao "parar" visivel durante streaming que envia `abort` ao sidecar
- [ ] Ao abortar: salvar mensagem parcial com flag `is_partial: true`
- [ ] Botao "continuar" em mensagens parciais (cortadas por max_tokens ou abort)
- [ ] Continuar: envia mensagem vazia com instrucao "continue" ao sidecar na mesma sessao

## Story 03: Busca no historico

Pesquisar em sessoes e mensagens anteriores.

### Tasks

- [ ] Campo de busca na sidebar de sessoes (filtra por titulo)
- [ ] Busca full-text nas mensagens (conteudo) via FTS5 no SQLite
- [ ] Highlight dos termos encontrados nos resultados
- [ ] Ao clicar num resultado, abrir sessao e scrollar ate a mensagem

## Story 04: Observabilidade de uso

Metricas de consumo de tokens.

### Tasks

- [ ] Agregar tokens por dia/sessao na tabela `usage_stats` (atualizar no `chat:done`)
- [ ] Criar tela "Uso" no settings com grafico de tokens/dia
- [ ] Exibir contagem de tokens por mensagem (discreto no footer da bolha)
- [ ] Exibir cache_read_tokens para visualizar eficiencia do cache

## Story 05: Integracao com notes

Ponte entre chat e vault de notas (Fase 4 do design doc).

### Tasks

- [ ] Implementar servidor MCP local expondo `search_notes`, `read_note`, `link_notes`
- [ ] Registrar MCP server como tool disponivel para o sidecar
- [ ] Comando `/note` inline no chat input para referenciar nota do vault
- [ ] Botao "salvar como nota" em respostas do assistant (cria .md no vault com conteudo)
- [ ] Resolucao de wikilinks no contexto do chat (se usuario menciona `[[nota]]`, incluir conteudo)
