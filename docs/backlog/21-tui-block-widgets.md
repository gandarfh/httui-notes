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

### Story 04.1 — Refs `{{...}}` → bind params ✅ P0 (segurança)

**Entregue:**
- [x] `resolve_block_refs` retorna `(String, Vec<serde_json::Value>)` — placeholders `?` + bind values em paralelo
- [x] `resolve_one_ref` retorna `serde_json::Value` (não mais SQL literal); `value_for_bind` valida scalar (Number/Bool/String/Null) e rejeita Array/Object
- [x] `apply_run_block` + `load_more_db_block` propagam `bind_values: Vec<Value>` até `spawn_db_query` → executor params
- [x] Função pure (`&[Segment]` em vez de `&App`) — testes constroem `Document::from_markdown` direto
- [x] Placeholder canônico `?` em todos os dialetos (sqlx adapta pra `$N` no driver Postgres). Multi-statement já funciona via `count_placeholders`/slice no executor — quando 04.2 entregar, refs em statement N vão pros binds certos.
- [x] Env vars resolvem como `Value::String` (mesma garantia: bind, não interp)
- [x] 8 testes novos em `dispatch::tests::resolve_block_refs_*`:
  - SQL injection guard (`'; DROP TABLE x;` vai pro bind, não pra SQL)
  - Múltiplos placeholders em ordem
  - Tipos preservados (Number, Bool, Null)
  - Env var como String bind
  - Array/Object rejeitado com erro
  - Alias desconhecido falha loud
  - Query sem refs passa-through

**Ref desktop espelhada:** `src/components/blocks/db/fenced/DbFencedPanel.tsx:340-360` (`resolveRefsToBindParams`).

---

### Story 04.2 — Multi-statement support ✅ P0

Backend (`httui-core::executor::db::mod.rs:104-161`) já suportava múltiplas statements em uma query (split em `;`, retorna `results: Vec<DbResult>`). TUI agora reconhece e consome a forma multi-result no resolver de refs e no summary.

**Entregue:**
- [x] `cached_result` continua armazenando o `DbResponse` JSON serializado completo (sem mudança de storage). O acesso é abstraído pelo shim de refs e pelos helpers de render — não vale a pena duplicar a estrutura no estado.
- [x] DB ref shim em `resolve_one_ref` espelha desktop `makeDbResponseView`:
  - **Passthrough**: `{{a.response.results}}`, `{{a.response.messages}}`, `{{a.response.stats}}`, `{{a.response.plan}}` → campos crus do `DbResponse`
  - **Numeric shortcut**: `{{a.response.N.rows.M.col}}` → `results[N].rows[M].col` (forma que `{{` autocomplete vai sugerir)
  - **Legacy column**: `{{a.response.col}}` → `results[0].rows[0].col` (shape pré-redesign continua funcionando)
- [x] Shim só engaja quando: `block.is_db()` AND `cached_result` tem shape `{results: [...]}`. Caches antigos (sem `results` array) caem no path legado de plain dot-navigation, sem regressão.
- [x] Render `db_summary` + status bar `summarize_db_response` ganham sufixo `(+N more)` quando `results.len() > 1`. Renderiza `results[0]` por enquanto; tabs full vêm em Story 05.1.
- [x] Erros descritivos: `out of bounds`, `mutation has no rows`, `column not found in first row`.
- [x] 8 testes novos em `dispatch::tests::db_shim_*`:
  - Legacy `response.col` resolve primeiro row do primeiro result set
  - Path explícito `response.0.rows.1.id` (multi-row)
  - Numeric shortcut `response.2.rows.0.y` (multi-statement com 4 results)
  - Passthrough `response.stats.elapsed_ms`
  - Mutation `response.0.rows_affected` via numeric path
  - Mutation com legacy column → erro claro
  - Out-of-bounds index → erro com tamanho real
  - Cache legado (sem `results` array) → fallback pra dot-nav simples

**Ref desktop espelhada:** `src/lib/blocks/references.ts:174-223` (`makeDbResponseView`).

**Pendente (descopado pra outras stories):**
- Tabs UI pra navegar entre result sets — Story 05.1
- Streamed row chunks por result set — Story 05.4 (V2)

---

### Story 04.3 — Schema cache wired ✅ P0 (gate de 04.4b)

Desktop tem `useSchemaCacheStore` (Zustand) + SQLite-cached introspection (TTL 300s). TUI agora tem o equivalente em-memória + dedup, alimentado pelo `httui-core::db::schema_cache` que já era usado pelo desktop.

**Entregue:**
- [x] Novo módulo `httui-tui/src/schema.rs`: `SchemaCache` (in-memory) + `SchemaTable` / `SchemaColumn` + `group_entries()` (pure, agrupa flat `SchemaEntry` rows por `(schema, table)`)
- [x] Campo `schema_cache: SchemaCache` em `App`
- [x] `App::ensure_schema_loaded(conn_id)` — kick fetch async se ainda não cached e não pending. Dedup via `pending: HashSet<ConnectionId>`.
- [x] Pipeline: `tokio::spawn` → `get_cached_schema` (SQLite, TTL 300s) → fallback `introspect_schema` (driver query) → `AppEvent::SchemaLoaded { connection_id, result }` → `App::on_schema_loaded` folda no cache + clears pending
- [x] Hook em `apply_confirm_connection_picker`: trocar conn dispara fetch background. Por hora o único trigger; Story 04.4b decide estratégia adicional quando o popup precisar.
- [x] Erros de introspection viram `StatusKind::Error` no status bar; cache não fica poisoned (retry possível).
- [x] 6 testes novos em `schema::tests`:
  - `group_entries` agrupa colunas por table
  - Tabelas com mesmo nome em schemas diferentes não colidem (`public.users` vs `auth.users`)
  - SQLite (schema-less) sorteia primeiro
  - `store` substitui entrada existente (refresh)
  - Pending dedup deixa só um fetch passar
  - `invalidate` limpa data + pending flag

**Pendente (descopado pra outras stories):**
- Cache invalidation via ex command `:schema refresh` — P1 opcional, não bloqueante
- Pre-load schema do conn ativo no startup — pode entrar quando 04.4b precisar UX mais responsiva
- Invalidation em delete de connection — TUI não tem UI de delete de conn ainda

---

### Story 04.4a — Completion engine + SQL keywords/functions ✅ P0

Infra de popup + Sources 1 (keywords) e 2 (builtin functions) entregues. Schema source (04.4b) e Refs source (04.7) plugam na mesma engine sem refactor.

**Entregue:**
- [x] Novo módulo `httui-tui/src/sql_completion.rs`:
  - `CompletionItem { label, kind, detail }` + `CompletionKind` enum (Keyword/Function/Table/Column/Reference — Table/Column/Reference reservados pra próximas stories)
  - `Dialect` enum: `Dialect::from_block(block)` mapeia `db-postgres`/`db-mysql`/`db-sqlite`/`Generic`
  - `complete(dialect, prefix) -> Vec<CompletionItem>` — case-insensitive prefix filter, alphabetical sort, dedup por label (Keyword vence Function quando overlap, ex `CASE`/`COUNT`)
  - `prefix_at_cursor(body, line, offset) -> Option<(start, prefix)>` — detector de prefix word (alfanum + `_`) walking back do cursor
- [x] **Source 1 (Keywords)**: 73 keywords ANSI + dialect-specific extras (Postgres: ILIKE/RETURNING/MATERIALIZED/RECURSIVE; MySQL: IGNORE/REPLACE/STRAIGHT_JOIN; SQLite: PRAGMA/AUTOINCREMENT/GLOB/VACUUM)
- [x] **Source 2 (Functions)**: 36 funções Postgres (COUNT, COALESCE, DATE_TRUNC, JSONB_EXTRACT_PATH, etc.); 37 MySQL (CONCAT_WS, DATE_FORMAT, JSON_EXTRACT, etc.); 29 SQLite (JULIANDAY, STRFTIME, JSON_EXTRACT, etc.)
- [x] **Popup state**: `App.completion_popup: Option<CompletionPopupState>` com items, selected, anchor (line/offset), prefix
- [x] **Render**: novo `httui-tui/src/ui/completion_popup.rs` — popup ancorado abaixo do bloco DB focado (fallback acima/centralizado), max 8 rows visíveis, ListState scroll. Borda cyan, kind label cinza-escuro.
- [x] **Trigger automático**: `refresh_completion_popup` rodado após `Action::InsertChar` ou `Action::DeleteBackward` no body de bloco DB. Calcula prefix → roda sources → preserva selected do popup anterior por label.
- [x] **Keys interceptados** (popup aberto, antes de mode parsing):
  - `Tab` / `Enter` → `CompletionAccept`
  - `Esc` / `Ctrl-C` → `CompletionDismiss`
  - `Down` / `Ctrl-n` → `CompletionNext` (wraps)
  - `Up` / `Ctrl-p` → `CompletionPrev` (wraps)
  - Outros keys: caem no parser de Insert + re-filter automático
- [x] **Accept**: backspace `prefix.len()` chars + insere chars do label um a um. Cursor termina no fim. `doc.snapshot()` antes pra undo restaurar estado anterior.
- [x] 11 testes em `sql_completion::tests`:
  - Filtro case-insensitive
  - Dialect-specific extras (Postgres `RETURNING`, MySQL `STRAIGHT_JOIN`)
  - Functions per dialect (`DATE_TRUNC` em Postgres, não em SQLite)
  - Sort alphabetical determinístico
  - Empty prefix (manual force open) retorna tudo do dialeto
  - Dedup `CASE` (overlap keyword/function)
  - `prefix_at_cursor` end-of-word, mid-word, after-non-word, underscore-as-word, multi-line
  - `Dialect::from_block` mapping

**Refinamentos pós-merge inicial:**
- [x] `<C-Space>` (Insert mode em DB block) — manual force-open, aceita prefix vazio (lista tudo do dialeto). Útil pra abrir popup logo após espaço, ou re-abrir após Esc.
- [x] Popup cursor-anchored — drop-down sai logo abaixo da palavra que está sendo completada (slide pra esquerda se passar do edge direito; fallback acima se sem headroom). Antes ancorava abaixo do bloco inteiro, longe do cursor.

**Não cobre (próximas stories):**
- Schema-aware completion (tables/columns) — Story 04.4b plugando 3rd source na mesma engine
- Refs `{{...}}` autocomplete — Story 04.7

---

### Story 04.4b — Schema autocomplete (tables/columns) ✅ P0

Trigger contextual após `FROM`/`JOIN`/`UPDATE`/`INSERT INTO` → tabelas; após `<table>.` → colunas. **Fecha o P0**.

**Entregue:**
- [x] `SqlContext` enum em `sql_completion.rs`: `Open`, `Table`, `ColumnOf(String)`
- [x] `detect_context(body, line, anchor_offset)` — walks back na linha atual:
  - Trailing `.` precedido de palavra → `ColumnOf(palavra)`
  - Trailing whitespace + última palavra ∈ {FROM/JOIN/INTO/UPDATE} → `Table`
  - Caso contrário → `Open`
- [x] `complete()` ganha 2 parâmetros: `context: SqlContext` + `schema: Option<&[SchemaTable]>`. Layering:
  - `Open`: keywords + builtins (comportamento V1)
  - `Table`: tables matching prefix (kind=Table, detail=schema name) + keywords + builtins (subquery `FROM (SELECT...)` é legal)
  - `ColumnOf(table)`: **só** colunas da tabela (kind=Column, detail=data_type), keywords suprimidos. Match case-insensitive de table name (`Users` casa com `users`).
- [x] Dispatcher: `refresh_completion_popup` lê `block.params["connection"]` → `App.schema_cache.get(conn_id).tables` → passa pra engine
- [x] Quando schema não está cacheado (`None`): fallback gracioso pra keywords. Quando bloco sem `connection=`: idem.
- [x] 14 testes novos em `sql_completion::tests`:
  - `detect_context`: after FROM/JOIN/INTO/UPDATE/word-dot, mid-word variants, line start (Open)
  - `complete` Table ctx surface schema tables com detail
  - `complete` ColumnOf surface só columns, keywords suprimidos
  - `complete` ColumnOf table desconhecido → vazio
  - `complete` ColumnOf case-insensitive table match
  - `complete` Table sem schema → fallback keywords
  - `complete` Table com schema → keywords convivem com tables

**Refinamento incluído pós-feedback:**
- [x] **Scope-aware bare columns** — `SqlContext::Open` agora carrega `in_scope: Vec<String>` extraído via `extract_tables_in_scope(body)` (scan global do SQL atrás de `FROM <tbl>` e `JOIN <tbl>`, dedup, skip de pseudo-keywords como `SELECT`/`LATERAL` em subqueries). Engine adiciona colunas dessas tabelas alongside keywords/builtins, com `detail = "from <table>"` pra disambiguar quando 2 tabelas têm coluna com mesmo nome (V1 dedup-by-label mantém primeira; explicit `<tbl>.col` continua via ColumnOf).
- [x] 9 testes adicionais cobrindo: `extract_tables_in_scope` (FROM, JOIN, dedup, subquery skip, sem FROM), `detect_context` retorna Open com scope após WHERE, complete surface columns + keywords concorrentes, multi-table scope, fallback sem schema.

**Pendente (V2):**
- Alias resolution: `FROM users u WHERE u.|` → completar colunas de `users`
- Multi-line context detection (FROM em linha anterior — atual scan já é global, mas detector imediato só olha linha do cursor)
- Quoted identifiers `"users"."email"`
- Refresh manual via `:schema refresh` ex command
- Loading placeholder no popup quando schema_cache vazio + fetch em progresso
- Multiple-id resolution UX (hoje dedup-by-label esconde 2ª ocorrência; futura UX: 2 entries com detail diferenciado)

**Depende de:** Story 04.3 (schema cache), Story 04.4a (engine). Ambas concluídas.

---

---

### Story 04.5 — Token `timeout=` + enforcement ✅ P1

**Achado**: parser core (`httui-core/src/blocks/parser.rs:149-156`) já extraía `timeout=NNNN` do fence pra `params["timeout_ms"]`, e executor (`httui-core/src/executor/db/mod.rs:64-72`) já wrappa `tokio::time::timeout` com fallback `connection default → 30s`. Story foi puramente plumbing TUI.

**Entregue:**
- [x] Novo helper `build_db_executor_params(conn, query, binds, offset, limit, timeout_ms)` extraído de `spawn_db_query` — pure function, testável em isolamento, fica em lockstep com `httui-core::executor::db::DbParams` (qualquer field novo lá precisa thread aqui).
- [x] `apply_run_block` lê `timeout_ms` de `block.params` (`Option<u64>`)
- [x] `load_more_db_block` lê o mesmo (paginação respeita timeout do bloco)
- [x] `spawn_db_query` ganha param `timeout_ms`, threading direto pro builder
- [x] JSON params inclui `"timeout_ms": <u64 or null>` — `None` serializa como `null`, executor's `Option<u64>` deserialize back to `None`, fallback no executor pra connection default → 30s.
- [x] 3 testes novos em `dispatch::tests::executor_params_*`:
  - timeout setado vai pro JSON
  - timeout ausente vira null
  - bind_values + fetch_size também passam corretamente

**Pra usar:**
```
```db-postgres alias=q connection=prod timeout=5000
SELECT pg_sleep(10)
```
```
→ erro `Query timed out after 5000ms` após 5s.

Sem token: usa `connections.query_timeout_ms` da conn (default 30000).

---

### Story 04.6 — Cache hash validation ✅ P1

Hoje TUI sempre re-executava em `r`. Agora consulta cache primeiro (per-file SQLite, mesma tabela `block_results` do desktop). Hit → ⛁ badge azul, sem rodar query.

**Entregue:**
- [x] `compute_db_cache_hash(body, conn_id, env_vars)` — espelha exatamente desktop `computeDbCacheHash`: hash SHA-256 sobre `body + "\n__ENV__\n" + sorted(KEY=VALUE)` apenas das env vars **referenciadas no body**. Conn id como segundo input pra `compute_block_hash`. **Cross-app cacheable**: desktop e TUI compartilham entries no mesmo vault.
- [x] `is_cacheable_query(query)` — strip leading whitespace + `--` line comments + `/* */` block comments, classifica primeiro statement. Cacheable: `SELECT/WITH/EXPLAIN/SHOW/PRAGMA/DESC/DESCRIBE`. Mutation (sempre re-exec): `UPDATE/DELETE/INSERT/REPLACE/CREATE/ALTER/DROP/TRUNCATE`.
- [x] `apply_run_block` cache check antes de spawn:
  - Lê `app.active_pane().document_path` (cache é per-file)
  - Se `is_cacheable_query` AND tem path: computa hash, faz `block_in_place` lookup `httui-core::block_results::get_block_result`
  - Hit `status=success`: deserialize response → `b.state = ExecutionState::Cached`, `b.cached_result = value`, status bar mostra `⛁ cached · N rows · Xms`, **return sem spawn**
  - Miss: continua spawn normal, `cache_key = Some((path, hash))` propaga via `RunningQuery`
- [x] `RunningQuery.cache_key: Option<(String, String)>` — novo campo, threading pra save-on-success
- [x] `handle_db_block_result` Run+success: se `cache_key` presente, dispara `save_db_cache_async` (`tokio::spawn` fire-and-forget, status `success`, total_rows do primeiro SELECT)
- [x] **Mutation never caches**: `is_cacheable_query` retorna false → `cache_key = None` → nunca lê nem escreve
- [x] **Errors never cache**: handler só salva quando primeiro result não é Error
- [x] **Load-more never caches**: spawn passa `cache_key=None` (paginação tem offset, não combina com hash do body)
- [x] **Renderer já paint Cached**: `db_result_line` em `ui::blocks` já tinha branch `Cached` com `⛁ cached · …` em azul. Só faltava setar.
- [x] 10 testes novos em `dispatch::tests::{cacheable_query_*, cache_hash_*, db_summary_from_value_*}`:
  - Cacheable reconhece SELECT/WITH/EXPLAIN/SHOW/PRAGMA/DESC
  - Cacheable rejeita UPDATE/DELETE/INSERT/REPLACE/CREATE/ALTER/DROP/TRUNCATE
  - Strip comments (-- e /* */) — header + statement real
  - Hash determinístico mesmo input
  - Hash muda quando env value referenciado muda
  - Hash ignora env vars não-referenciadas
  - Hash muda com connection_id diferente
  - Summary multi-statement com `(+N more)`
  - Summary mutation rows_affected

**Pendente (futuro):**
- `:run!` / `R` — force bypass cache (story 09 mencionou; quando precisar de "sempre fresco" sem editar query)
- Cache TTL: hoje cache nunca expira; desktop também não. Quando ficar problemático, adicionar `cached_at < datetime('now', '-1 hour')` filter no get.
- Visual "ran X ago" no status — desktop tem; pode entrar em Story 11 (inline fence edit) ou separada.

---

### Story 04.7 — Refs autocomplete `{{...}}` 🚧 P1

Trigger ao digitar `{{` em qualquer campo. Lista aliases de blocos anteriores + env vars do environment ativo. Vale tanto pro SQL quanto pra futuros campos de HTTP/E2E quando voltarem.

**Tasks:**
- [ ] **Source 4 — Refs**: nova `CompletionSource` que ativa apenas dentro de `{{...}}` aberto.
- [ ] Detector: `{{` antes do cursor (sem `}}` fechando) abre popup; `}}` fecha.
- [ ] Fontes de items:
  - `App.document` walks blocks anteriores ao cursor, coleta `alias` (com type-tag: HTTP/DB/E2E + flag `cached`/`no-result`).
  - `App.env_vars` lista keys do active env.
- [ ] Após `{{alias.`: navega JSON do `cached_result` daquele bloco com dot notation, popup mostra keys disponíveis no nível atual. Cada `.` redoes o lookup.
- [ ] Ordem: aliases acima de env vars (mais comum em scripts).
- [ ] Reuso da infra de popup de Story 04.4a (mesmas keybindings, mesmo widget).
- [ ] Testes: triggers corretos, lista filtrada, navegação por tree de JSON, `{{ENV_KEY}}` (sem dots) lista envs sem aliases.

**Depende de:** Story 04.4a (engine).

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
