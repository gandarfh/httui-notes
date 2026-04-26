# Epic 21 — TUI Block Widgets

Widgets de blocos executáveis (HTTP, DB, E2E) na TUI.

**Foco atual (2026-04-26):** **paridade do bloco DB com o desktop**. Stories de HTTP e E2E ficam pausadas até as P0–P1 da DB-parity entregarem. Stories existentes mantêm numeração de origem e ressurgem com status atualizado; gaps de paridade descobertos na auditoria de 2026-04-26 viram substories `04.x` / `05.x`.

**Depende de:** Epic 18 (Buffer & Rendering), Epic 19 (Vim Engine — congelado em Round 2 + visual)
**Desbloqueia:** —

Referência: [`docs/tui-design.md`](../tui-design.md) §7.3–§7.6, §10, §15.bis.
Auditoria de paridade Desktop × TUI consolidada em §15.bis.

**Legenda de estado:**
- ✅ **done** — entregue, com testes
- 🚧 **active** — em progresso ou desbloqueada pra começar
- ⏸ **paused** — congelada pelo foco atual
- 🧊 **deferred V2** — fora do escopo da paridade V1

---

## DB Parity Track (foco ativo)

### Story 04 — Widget DB — input ✅ parcial

**Entregue:**
- Connection picker via `Ctrl+L` (popup ancorado acima do bloco com fallback abaixo / centro).
- Footer com `connection: <name> · limit: <N> · press 'r' to run`.
- Fence parser suporta `alias=`, `connection=`, `limit=`, `display_mode=` (em `httui-core::blocks::parser`).
- SQL highlight via `manual_lex` (tree-sitter parse cached pra futuro uso).

**Pendente:** ver substories 04.1–04.9 abaixo.

---

### Story 04.1 — Refs `{{...}}` → bind params 🚧 P0 (segurança)

Hoje `httui-tui::vim::dispatch::resolve_block_refs` faz **string substitution** dos `{{alias.path}}` direto na query SQL. Isso viola o invariante do `CLAUDE.md` ("Block references in SQL ... are always converted to bind parameters, never string-interpolated") e é vetor de SQL injection trivial via valor de bloco upstream.

**Tasks:**
- [ ] Substituir string substitution por extração de placeholders + array de bind values
- [ ] Adaptar para os 3 dialetos: `$N` (Postgres), `?` (MySQL/SQLite)
- [ ] `httui-core::executor::db` já aceita `bind_values: Vec<Value>` — usar
- [ ] Resolver `{{ENV_VAR}}` continua como string (envs não são SQL injection no mesmo sentido — confirmar com desktop)
- [ ] Testes: query com `WHERE id = {{prev.response.id}}` gera `WHERE id = $1` + `[prev_id]`, **não** `WHERE id = '7; DROP TABLE...'`
- [ ] Testes: 3 dialetos geram placeholders corretos
- [ ] Testes: ref resolvendo a array/object falha gracefully (não vira string mal-formada)

**Refs:** `src/components/blocks/db/fenced/DbFencedPanel.tsx:340-360` (`resolveRefsToBindParams` — espelhar).

---

### Story 04.2 — Multi-statement support 🚧 P0

Backend (`httui-core::executor::db::mod.rs:104-161`) já suporta múltiplas statements em uma query (split em `;`, retorna `results: Vec<DbResult>`). TUI hoje só consome `results[0]` e renderiza um único result set.

**Tasks:**
- [ ] Atualizar `App.cached_result` (ou estrutura equivalente) para guardar `Vec<DbResult>` em vez de `Value` único
- [ ] Atualizar resolução de refs: `{{alias.response.0.rows.0.col}}` (caminho explícito) + shim legado `{{alias.response.col}}` → `results[0].rows[0].col`
- [ ] Renderer pega `results.len()`: 0 = "no results", 1 = render direto, 2+ = result tabs (depende de Story 05.1)
- [ ] Testes: query `BEGIN; UPDATE foo SET x=1; SELECT * FROM foo; ROLLBACK;` retorna 4 results no estado
- [ ] Testes: ref legada `{{alias.response.col}}` continua funcionando

---

### Story 04.3 — Schema cache wired 🚧 P0 (gate de 04.4)

Desktop tem `useSchemaCacheStore` (Zustand) + SQLite-cached introspection (TTL 300s). TUI ainda não puxa schema. Sem schema cache, autocomplete de tabelas/colunas (04.4) é impossível.

**Tasks:**
- [ ] Identificar API de schema_cache em `httui-core` (já existe — usado por desktop)
- [ ] Adicionar campo em `App` ou store dedicado: `schema_cache: HashMap<ConnectionId, Schema>`
- [ ] Carregar schema lazy: primeira vez que connection picker fecha em conn nova, dispara fetch async
- [ ] Cache invalidation: refresh manual via ex command `:schema refresh` (P1, opcional)
- [ ] Testes: schema é cacheado por conn, não re-fetchado em queries subsequentes
- [ ] Testes: timeout/erro de introspection não trava executor

---

### Story 04.4 — Schema autocomplete (SQL completion) 🚧 P0

Trigger autocomplete dentro do SQL editor após `FROM`, `JOIN`, `WHERE`, `SELECT`, `INSERT INTO`, `UPDATE`.

**Tasks:**
- [ ] Provider de completion no SQL editor (lê `App.schema_cache[conn_id]`)
- [ ] Detector de contexto: que keyword precede o cursor? (heurística; tree-sitter pode ajudar quando walker AST estabilizar)
- [ ] Popup estilo nvim: lista filtra ao digitar, `<C-n>`/`<C-p>` navega, `<Tab>`/`<CR>` aceita, `<Esc>` cancela
- [ ] Após `FROM `: lista tabelas. Após `<table>.`: lista colunas. Após `JOIN <table> ON `: colunas das tabelas em scope.
- [ ] Testes: triggers corretos por keyword, lista filtrada
- [ ] Testes: schema vazio (conn sem schema cacheado) → popup vazio, não trava

**Depende de:** Story 04.3.

---

### Story 04.5 — Token `timeout=` + enforcement 🚧 P1

Desktop tem `timeout=30000` no fence + executor wrap em `tokio::time::timeout`. TUI parser não reconhece o token e executor não aplica timeout.

**Tasks:**
- [ ] Adicionar `timeout` a `DbBlockParams` em `httui-core::blocks` (se ainda não tem)
- [ ] Parser TUI: ler `timeout=NNNN` do info string, validar numérico
- [ ] Executor: `tokio::time::timeout(Duration::from_millis(timeout), query_future)`, erro com mensagem `"query exceeded {timeout}ms"`
- [ ] Default: 30s se ausente
- [ ] Testes: timeout=100 numa query lenta retorna erro com mensagem
- [ ] Testes: timeout ausente usa default

---

### Story 04.6 — Cache hash validation 🚧 P1

Hoje TUI sempre re-executa em `r`. Desktop calcula `SHA256(query + connection_id + limit + env_snapshot)` e serve cache em hit (com badge `cached`). Cache fica em SQLite via `httui-core`.

**Tasks:**
- [ ] Calcular hash em `apply_run_block` antes de spawn task
- [ ] Lookup no cache (`httui-core::cache::get_block_result`?) antes de executar
- [ ] Hit → emit `AppEvent::DbBlockResult` com flag `from_cache=true`, badge muda
- [ ] `:run!` (ou `R` em normal) força bypass do cache (P2 — já listado em Story 09)
- [ ] Mutation methods (UPDATE/INSERT/DELETE/etc.) **nunca** servem de cache (espelhar comportamento desktop)
- [ ] Testes: query idempotente roda, segundo `r` é cache hit
- [ ] Testes: UPDATE sempre re-executa

---

### Story 04.7 — Refs autocomplete `{{...}}` 🚧 P1

Trigger ao digitar `{{` em qualquer campo. Lista aliases de blocos anteriores + env vars do environment ativo.

**Tasks:**
- [ ] Detector: `{{` no input dispara popup
- [ ] Fontes: `App.document` walks blocks anteriores ao cursor, coleta `alias`. `App.env_vars` lista keys do active env.
- [ ] Após `{{alias.`: navega JSON do `cached_result` com dot notation, popup mostra keys disponíveis
- [ ] Ordem: aliases (com type + cached/no-result) antes de env vars
- [ ] Reuso da infra de popup de Story 04.4
- [ ] Testes: triggers corretos, lista filtrada, navegação por tree de JSON

**Depende de:** infra de popup compartilhada com 04.4.

---

### Story 04.8 — Errors com line/col + visual 🚧 P1

Postgres/MySQL retornam `position`/`line`/`column` em erros de syntax. Desktop pinta squiggle no editor + duplica na linha de status.

**Tasks:**
- [ ] Parser de erros no executor (3 dialetos): extrai `(line, col, message)`
- [ ] Estado: `ExecutionState::Error` ganha campo `position: Option<(usize, usize)>`
- [ ] Render: linha `line` ganha underline vermelho na faixa de col±N
- [ ] Status bar: `error: <msg> at line:col`
- [ ] Testes: erro do Postgres parseado, posição extraída, render aplica underline

---

### Story 04.9 — Read-only mode + confirm dialog 🚧 P1

Connections têm flag `is_readonly`. Desktop bloqueia mutations em RO connections com confirm modal. Também avisa em `UPDATE`/`DELETE` sem `WHERE` mesmo em RW.

**Tasks:**
- [ ] Detector SQL: classifica statement como mutation/select via parsing leve (regex inicial — `^\s*(UPDATE|DELETE|INSERT|DROP|TRUNCATE|ALTER)`)
- [ ] Detector "unscoped": `UPDATE` ou `DELETE` sem `WHERE` (regex + tree-sitter quando walker estabilizar)
- [ ] Modal de confirmação: `Mode::DbConfirmRun` com mensagem + `[y]es / [n]o`
- [ ] Bloqueio total quando RO + mutation: erro inline, sem modal
- [ ] Testes: RO + UPDATE = blocked, RW + UPDATE sem WHERE = confirm, RW + UPDATE com WHERE = direto

---

### Story 05 — Widget DB — output ✅ parcial

**Entregue:**
- `ratatui::Table` com viewport persistente (clamp + `SCROLL_OFF=2`).
- Cell rendering: null em cinza `(null)`, JSON pretty-printed, truncate em 30 chars.
- Modal row-detail (`Mode::DbRowDetail`) com vim motions completas (`hjkl`/`wbe`/`gg`/`G`/`Ctrl-d`/`Ctrl-u`/`f`/`F`/`vi{`/`va{`).
- `Y` copia row inteiro como JSON pretty-printed via `arboard`.
- Auto-prefetch quando cursor a ≤5 rows do fundo + `has_more=true` (`DB_PREFETCH_THRESHOLD=5`).
- Cancel via `Ctrl+C` (`CancellationToken` em `App.running_query`). Postgres limpo, SQLite/MySQL não propagam pro driver.
- Footer com "N rows".

**Pendente:** ver substories 05.1–05.4.

---

### Story 05.1 — Result tabs (Result(s)/Messages/Plan/Stats) 🚧 P2

Após Story 04.2 (multi-statement), result panel precisa abas. Espelha desktop:
- **Result(s)** — uma sub-aba numerada por result set se 2+
- **Messages** — NOTICE/WARNING dos result sets (ainda STUB no executor; expor o que vier)
- **Plan** — populated por Story 05.2 (EXPLAIN)
- **Stats** — elapsed, rows totais, cache hit, statement count

**Tasks:**
- [ ] Estado: `ResultPanelTab` enum
- [ ] Render condicional: 0 results = "no results"; 1 = render direto; 2+ = sub-tabs com `[1] [2] [3]`
- [ ] Cycle: `<Tab>`/`<S-Tab>` ou `<C-Tab>`
- [ ] Aba Stats sempre visível
- [ ] Testes: render correto pra 0/1/2+ result sets

**Depende de:** Story 04.2.

---

### Story 05.2 — EXPLAIN integration 🚧 P2

`<leader>e` (ou ex `:explain`) wrappa primeira statement em `EXPLAIN` (Postgres/MySQL) ou `EXPLAIN QUERY PLAN` (SQLite), executa one-off, popula tab Plan.

**Tasks:**
- [ ] Detector de dialect → wrapper apropriado
- [ ] Execução paralela ao normal? Ou separada? — desktop faz separada, mantém
- [ ] Render do plano: text bruto formatado (Postgres tem ANALYZE com tree, mas V1 só EXPLAIN — texto plano)
- [ ] Auto-switch pra tab Plan ao receber resultado
- [ ] Testes: query EXPLAIN é wrapper correto pro dialeto, não modifica fence

**Depende de:** Story 05.1.

---

### Story 05.3 — Export menu (CSV/MD/INSERT além de JSON) 🚧 P2

Hoje só `Y` no modal copia row como JSON. Desktop oferece 4 formatos via menu.

**Tasks:**
- [ ] Ex command `:export <format>` ou keybinding `<leader>y` abre picker
- [ ] Formatos: CSV (RFC 4180), JSON (array), Markdown (GFM table), INSERT (per-row INSERT inferring table name)
- [ ] Destinos: clipboard (default) ou `:export <format> <path>` salva file
- [ ] Reuso da lógica de `httui-core` se já existe (desktop usa `src/lib/blocks/db-export.ts` — pode ter equivalent Rust); senão portar
- [ ] Testes: cada formato gera output esperado pra dataset fixture

---

### Story 05.4 — Streamed row chunks 🧊 deferred V2

Hoje executor entrega `DbResponse` completa. Desktop tem channel preparado mas também não chunkifica payload. Implementar streaming na TUI sem o desktop fazer primeiro é trabalho duplicado e contradiz "paridade".

**Quando reativar:** quando `httui-core::executor::db` emitir `ExecutionEvent::Row` chunks.

---

### Story 08 — Display mode toggle (input/output/split) 🚧 P2

**Tasks:**
- [ ] Persistir `display_mode` no fence (`display=input|output|split`)
- [ ] Toggle: `<C-d>` ou `:display <mode>` em `BlockSelected`
- [ ] Render condicional baseado em mode + tem-resultado
- [ ] Default: `input` quando idle, `split` quando tem resultado (espelha desktop)
- [ ] Reflow do documento (recalcular altura)
- [ ] Testes: cada modo renderiza conforme esperado, height correto

---

### Story 09 — Execução e cancel ✅ parcial

**Entregue:**
- `r` em normal mode → `apply_run_block` → executor async via `tokio::spawn` + `CancellationToken`
- Resultado vira `AppEvent::DbBlockResult { segment_idx, kind, outcome }` no main loop
- `Ctrl-C` cancela (intercepta no top do `dispatch`, antes do mode parsing)
- Resolução de refs `{{alias.path}}` em `resolve_block_refs` (env vars + block deps)

**Pendente:**
- [ ] `:run!` (ou `R`) ignora cache — depende de Story 04.6
- [ ] Tipos de evento granulares (`Started`, `Progress`, `Row`, `StepDone`) — Story 05.4 (deferred V2)
- [ ] Deps com lock compartilhado — Story 04.7 / autocomplete

---

### Story 11 — Edição inline do fence info string (DB) 🚧 P2

Editar metadados do bloco DB sem sair (alias, connection, limit, timeout, display_mode).

**Tasks:**
- [ ] `<C-a>` edita alias (prompt inline)
- [ ] `<C-c>` edita connection — já existe via `Ctrl+L` picker; não duplicar
- [ ] `<C-l>` edita limit (numérico)
- [ ] `<C-t>` edita timeout (numérico, ms)
- [ ] `<C-d>` edita display mode (input/output/split) — Story 08 cobre
- [ ] `<CR>` confirma; `<Esc>` cancela
- [ ] Validação: alias único no doc, limit > 0, timeout > 0
- [ ] Erro → notification no status bar
- [ ] Persiste no fence canônico (ordem: alias → connection → limit → timeout → display)
- [ ] Testes: cada campo persiste, validação bloqueia inválido

**Depende de:** Story 04.5 (timeout token).

---

## P3 / Deferred V2 (DB)

- 🧊 **Schema panel UI lateral** — desktop também só tem STUB. Quando virar, ambos avançam juntos.
- 🧊 **Run history persistence + viewer** — `block_run_history` table existe no desktop mas não é populado pelo bloco DB. Aguardar product decision.
- 🧊 **Resolved bindings debug panel** — útil mas baixa prioridade; pode virar `:resolve <alias>` ex command no futuro.
- 🧊 **Live elapsed timer (100ms tick)** — verificar se TUI já mostra elapsed; se não, baixa prioridade.

---

## Stories pausadas (HTTP / E2E) ⏸

Retomar após DB-parity P0–P1 entregar. Estado preservado pra retomar sem perda.

### Story 01 — Widget shell compartilhado ⏸

Trait `BlockWidget` + header padrão + display modes + state badges. Útil quando voltar pros 3 tipos de bloco. Hoje cada bloco tem render ad-hoc — refatoração pode esperar.

### Story 02 — Widget HTTP — input ⏸
### Story 03 — Widget HTTP — output ⏸
### Story 06 — Widget E2E — input ⏸
### Story 07 — Widget E2E — output ⏸

(Bodies originais preservados em `git log` — `docs/backlog/21-tui-block-widgets.md` antes de 2026-04-26.)

### Story 10 — Autocomplete `{{refs}}` cross-block (todos os tipos) ⏸

Cobertura DB-only via Stories 04.4 + 04.7. Quando HTTP/E2E voltarem, esta story expande pros outros 2 tipos.
