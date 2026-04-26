# Epic 21 — TUI Block Widgets

Widgets de blocos executáveis (HTTP, DB, E2E) na TUI: UI de input, output rendering, streaming, cancel, display modes, autocomplete `{{refs}}` e schema SQL.

**Depende de:** Epic 18 (Buffer & Rendering), Epic 19 (Vim Engine)
**Desbloqueia:** —

Referência: [`docs/tui-design.md`](../tui-design.md) §7.3–§7.6, §10.

---

## Story 01: Widget shell compartilhado

Infra comum de todos os blocos: header, display modes, ações, state rendering.

### Tasks

- [ ] Trait `BlockWidget`:
  - [ ] `fn render_header(&self, area, style) -> Header`
  - [ ] `fn render_input(&self, area, focus) -> Vec<Line>`
  - [ ] `fn render_output(&self, area) -> Vec<Line>`
  - [ ] `fn handle_key(&mut self, key) -> WidgetAction`
  - [ ] `fn height(&self, width, display_mode) -> u16`
- [ ] Header padrão: `{icon} {type}  {alias}  [{mode}] {state_badge} [▶] [✕]`
- [ ] Border: simples quando não selecionado, dupla/accent quando `BlockSelected`, cor por estado
- [ ] Display modes: `input` / `output` / `split` — toggle via botões no header (`<C-h>` input, `<C-l>` output, `<C-k>` split)
- [ ] Alias editável inline no header (entra com `<C-a>` em `BlockSelected`)
- [ ] Run button: `<leader>r` ou `:run` — estado durante execução vira `[⟳]`
- [ ] Cancel button: visível durante `running`, dispara cancel no executor
- [ ] State badges:
  - [ ] `idle` (cinza)
  - [ ] `cached` (magenta, com clock icon)
  - [ ] `running` (amarelo, com spinner animado)
  - [ ] `success` (verde, com status text)
  - [ ] `error` (vermelho, com mensagem truncada + tooltip full)
- [ ] Testes: render correto em cada modo/estado

## Story 02: Widget HTTP — input

UI do input do bloco HTTP: method, URL, tabs de params/headers/body/settings.

### Tasks

- [ ] Render do header com method badge colorido (GET=verde, POST=azul, PUT=laranja, PATCH=amarelo, DELETE=vermelho, HEAD=roxo, OPTIONS=cinza)
- [ ] Method selector: dropdown acessível via `<CR>` em cima, ou ex command `:method {VERB}`
- [ ] URL field: single-line textarea com syntax highlight de `{{refs}}` (magenta)
- [ ] Hover `{{ref}}` mostra valor resolvido no status bar
- [ ] Autocomplete `{{`: lista aliases acima + env vars (reusa `extractReferencedAliases` do core)
- [ ] Tabs: Params | Headers | Body | Settings (`<C-Tab>` cicla)
- [ ] **Params/Headers**: tabela key/value com `+` pra adicionar, `d` na linha pra remover
- [ ] **Body**: multi-line textarea com syntect JSON highlight (se detectar `Content-Type: application/json`)
- [ ] **Settings**: campo `timeout_ms` numérico
- [ ] Persistir no fence info string canônico do bloco HTTP (formato alinhado com [`db-block-redesign.md`](../db-block-redesign.md))
- [ ] Testes: edição de cada campo propaga pro `BlockNode`

## Story 03: Widget HTTP — output

Render da resposta HTTP com status, body, headers.

### Tasks

- [ ] Linha de status: badge colorido por classe (2xx verde, 3xx azul, 4xx amarelo, 5xx vermelho) + tempo + tamanho
- [ ] Body:
  - [ ] JSON: formatado e com highlight (syntect)
  - [ ] HTML/XML: com highlight
  - [ ] Plain text: direto
  - [ ] Binary: mostra metadata + ações `o` (open external) / `s` (save to disk)
- [ ] Scroll vertical no body (`<C-e>` / `<C-y>`), horizontal (`zh`/`zl`)
- [ ] Headers colapsáveis: `▸ Headers (N)` → `▾ Headers (N)` com lista key/value
- [ ] Copy body: `y` em foco no output copia pro registro/clipboard
- [ ] Fullscreen toggle: `<leader>bf` abre body em modal fullscreen
- [ ] Testes: render de cada content-type, scroll, copy

## Story 04: Widget DB — input

UI do bloco DB: connection, SQL editor, tabs de query/settings.

### Tasks

- [ ] Header com connection slug destacado: `DB  db1  [prod]  ...` (atual mostra no footer)
- [x] **Connection picker**: `Ctrl+L` (em vez de `<leader>dp` — leader keys ainda não landed) abre **popup ancorado acima do bloco** (cai pra baixo se sem headroom). Estado em `App.connection_picker`. Pré-seleciona conexão atual. `Enter` escreve `connection=<id>` em `block.params` + `doc.snapshot()` pra undo. Implementação: `ui::connection_picker` + `vim::dispatch::open_connection_picker`. Keybinding centralizado em `vim::keybindings::OPEN_CONNECTION_PICKER`.
- [ ] SQL editor multi-line:
  - [ ] Syntect SQL highlight
  - [ ] Autocomplete de schema: tabelas e colunas da conexão selecionada (reusa `schema_cache` do core)
  - [ ] Triggers: após `FROM`, `JOIN`, `WHERE`, `SELECT`, `INSERT INTO`, `UPDATE`
  - [ ] Autocomplete `{{refs}}` com Ctrl+Space ou `{{`
- [ ] Tabs: Query | Settings (`<C-Tab>` cicla)
- [ ] **Settings**: `limit` (numérico), `timeout_ms`, `display_mode`
- [ ] Multi-statement: separador `;` permitido, backend já suporta (stage 1 do redesign)
- [ ] Fence info string conforme §2.1 do `db-block-redesign.md`
- [ ] Testes: edição preserva SQL cru, autocomplete schema funciona

## Story 05: Widget DB — output (tabela + streaming)

Renderizar resultados como tabela com scroll, streaming do executor, e Load more.

### Tasks

- [x] `ratatui::widgets::Table` com:
  - [x] Headers colunas (nomes do schema)
  - [x] Linhas virtualizadas (viewport persistente em `App.result_viewport_top`, scroll estilo editor com `clamp_viewport` + `SCROLL_OFF=2`)
  - [ ] Scroll horizontal (`zh`/`zl` ou `<C-h>`/`<C-l>`) — pendente
  - [x] Scroll vertical: `j`/`k` movem cursor; viewport segue. `Ctrl-d`/`Ctrl-u` via motion engine.
- [x] Seleção de linha com `<CR>` abre **modal centralizado** com valores full (em vez de drawer lateral). Modal usa `Document` próprio + redirecionamento de `app.document_mut()`, então motions vim completas funcionam (`hjkl`, `wbe`, text objects `vi{`/`va{`, etc.). `Y` copia row inteiro como JSON via `arboard`.
- [x] Cell com valor null: renderiza `(null)` em cinza
- [ ] Streaming: cada `ExecutionEvent::Row` chega via channel, push na tabela, redraw — pendente (executor atual entrega resultado completo)
- [x] Footer com "N rows" — feito; `[Load more]` substituído por **prefetch automático** no `j` quando cursor está dentro de `DB_PREFETCH_THRESHOLD=5` rows do fundo + `has_more=true`
- [x] Cancel durante execução: `Ctrl-C` aborta via `CancellationToken` em `App.running_query` (intercepta no top do `dispatch`). SQLite/MySQL não propagam cancel pro driver; Postgres funciona limpo.
- [x] Testes: prefetch threshold (`should_prefetch_*`), viewport (`clamp_result_viewport_*`), modal body (`build_body_lines_*`)

## Story 06: Widget E2E — input

UI do bloco E2E: base URL, headers default, lista de steps.

### Tasks

- [ ] Campo base URL (single-line com `{{refs}}`)
- [ ] Default headers: tabela key/value compartilhada por todos os steps
- [ ] Lista de steps:
  - [ ] Cada step é um card colapsável (fold com `za`)
  - [ ] Header do step: `{n}. {method} {path}`
  - [ ] Quando expandido: tabs Request (Params/Headers/Body) + Assertions (Expect/Extract)
- [ ] Adicionar step: `+` ou `:step add` ao fim
- [ ] Reordenar: `Alt-j`/`Alt-k` quando step selecionado
- [ ] Deletar step: `d` em cima do card (ou `:step delete {n}`)
- [ ] **Expect**: status esperado + JSON matches (key=path, value=expected) + body contains
- [ ] **Extract**: mapping de variável → JSON path
- [ ] Fence info string canônica pro E2E
- [ ] Testes: adicionar/reordenar/deletar steps preserva consistência

## Story 07: Widget E2E — output

Render dos resultados por step + summary.

### Tasks

- [ ] Summary bar: "N/M passed" com progress bar colorida
- [ ] Lista de resultados por step, colapsável (fold sincronizado com input)
- [ ] Por step:
  - [ ] Ícone ✓/✕/⊙ (skipped), status code, elapsed
  - [ ] Se falha: lista de assertions que falharam (expected vs received)
  - [ ] Response body expandível (reusa renderer do HTTP output)
  - [ ] Extracted variables: `{name: value}` em cinza
- [ ] Continue on failure: steps subsequentes rodam mesmo se um falha (comportamento atual)
- [ ] Testes: render correto pra mix de pass/fail, extractions propagam visualmente

## Story 08: Display mode toggle

Persistir `display_mode` no fence e ajustar render.

### Tasks

- [ ] `input` mode: só UI de input, esconde output
- [ ] `output` mode: só UI de output, esconde input
- [ ] `split` mode: input em cima, output embaixo (vertical) ou lado a lado se viewport width > threshold (horizontal)
- [ ] Toggle via header buttons ou `<C-h>`/`<C-j>`/`<C-k>` em `BlockSelected`
- [ ] Altura do bloco recalculada (dispara reflow do documento)
- [ ] Default: `input` quando `idle`, `split` quando tem resultado (ou conforme fence)
- [ ] Animação de transição não existe (terminal); só redraw
- [ ] Testes: cada modo renderiza conforme esperado, reflow correto

## Story 09: Execução e cancel

Integração com executores do core via channel.

### Tasks

- [x] `r` em normal mode (em vez de `:run`) chama `apply_run_block` → `httui-core::executor::db::DbExecutor`
- [ ] `:run!` ignora cache — pendente (atual sempre re-executa)
- [x] Executor roda em `tokio::spawn`, recebe `CancellationToken` (DB; HTTP/E2E pendentes)
- [x] Resultado vira `AppEvent::DbBlockResult { segment_idx, kind, outcome }` no main loop
- [ ] Tipos de evento granulares (`Started`, `Progress`, `Row`, `StepDone`) — atual entrega resultado completo no `Completed`. Streaming pendente.
- [x] `Ctrl-C` cancela via `cancel_running_query` (intercepta no top do `dispatch`, antes do mode parsing)
- [ ] Cache hit visual ainda não checa hash — sempre re-executa
- [x] Resolução de refs `{{alias.path}}` em `resolve_block_refs` (env vars + block deps)
- [ ] Deps com lock compartilhado pendente
- [x] Testes: `should_prefetch_*`, viewport `clamp_*`, modal body lines

## Story 10: Autocomplete de `{{refs}}` e schema

Provider de completions contextuais dentro dos campos de bloco.

### Tasks

- [ ] Trigger: digitação de `{{` em qualquer campo de texto
- [ ] Listar:
  - [ ] Aliases de blocos anteriores no doc (com tipo + estado cached/no result)
  - [ ] Env variables do environment ativo
- [ ] Após selecionar `{{alias.`: navegar JSON do result cacheado com dot notation (popup mostra keys disponíveis)
- [ ] Trigger SQL: após keywords (`FROM`, `JOIN`, `WHERE`, `SELECT`, `INSERT INTO`, `UPDATE`) → lista tabelas/colunas
- [ ] Popup estilo vim/nvim com lista + highlight do char atual filtrando
- [ ] Navegação: `<C-n>`/`<C-p>` ou `<Tab>`/`<S-Tab>`
- [ ] Accept: `<CR>` ou `<Tab>`
- [ ] Dismiss: `<Esc>`
- [ ] Testes: triggers corretos, lista filtrada ordenadamente, navegação por tree de JSON

## Story 11: Edição inline do fence info string

Editar metadados do bloco (alias, connection, limit, etc.) sem sair do bloco.

### Tasks

- [ ] Header do bloco tem campos editáveis inline por keybinding:
  - [ ] `<C-a>` edita alias
  - [ ] `<C-c>` edita connection (DB) / method (HTTP)
  - [ ] `<C-l>` edita limit (DB) / timeout (qualquer)
  - [ ] `<C-d>` edita display mode (input/output/split)
- [ ] Ao acionar: prompt inline no header com valor atual
- [ ] `<CR>` confirma; `<Esc>` cancela
- [ ] Validação: alias único no doc, connection existe, limit numérico, etc.
- [ ] Erro → notification no status bar
- [ ] Persiste no fence info canônico
- [ ] Testes: cada campo editado persiste corretamente, validações bloqueiam valores inválidos
