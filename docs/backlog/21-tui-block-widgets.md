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

- [ ] Header com connection slug destacado: `DB  db1  [prod]  ...`
- [ ] Connection picker: `<leader>dp` ou click no slug → overlay com lista de conexões
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

- [ ] `ratatui::widgets::Table` com:
  - [ ] Headers colunas (nomes do schema)
  - [ ] Linhas virtualizadas (só renderiza visíveis)
  - [ ] Scroll horizontal (`zh`/`zl` ou `<C-h>`/`<C-l>`)
  - [ ] Scroll vertical (`<C-e>`/`<C-y>`)
- [ ] Seleção de linha com `<CR>` abre drawer lateral com valores full (útil pra JSON/texto longo)
- [ ] Cell com valor null: renderiza `NULL` em cinza itálico
- [ ] Streaming: cada `ExecutionEvent::Row` chega via channel, push na tabela, redraw
- [ ] `ExecutionEvent::Stats` finaliza com "N rows fetched" no footer
- [ ] Footer com "N rows" + `[Load more]` botão/ação (`<CR>` no footer executa query com `OFFSET`)
- [ ] Cancel durante streaming: `<C-c>` aborta (reusa cancel token do stage 3 do redesign)
- [ ] Testes: streaming atualiza incrementalmente, cancel funciona, Load more buscando offset correto

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

- [ ] `:run` em `BlockSelected` chama `httui-core::executor::dispatch(block_node)`
- [ ] `:run!` ignora cache (força re-execução)
- [ ] Executor roda em `tokio::spawn`, recebe `CancelToken`
- [ ] Eventos do executor viram `AppEvent::BlockEvent { block_id, event }`
- [ ] Tipos de evento: `Started`, `Progress`, `Row` (DB), `StepDone` (E2E), `Completed { result }`, `Failed { error }`
- [ ] `<C-c>` com block selected cancela via token
- [ ] Cache hit: se `cached_result.is_some()` e hash bate, não executa — só mostra cached badge
- [ ] Resolução de dependências (reuso de `resolve_dependencies` do core)
- [ ] Deps executando simultaneamente: lock compartilhado (já existe em core)
- [ ] Testes: execução com sucesso, com erro, cancelada, com deps

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
