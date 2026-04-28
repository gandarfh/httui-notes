# Epic 20 — TUI Editor Shell

Layout fora da área de edição: file tree, tabs, splits, quick open, FTS search, status bar, sidebar. Tudo via teclado e ex commands.

**Depende de:** Epic 18 (Buffer & Rendering), Epic 19 (Vim Engine)
**Desbloqueia:** Epic 22 (Integrations)

Referência: [`docs/tui-design.md`](../tui-design.md) §7.1, §8.

---

## Story 01: Layout raiz e composição de panes ✅ done

Estrutura de containers: sidebar, tab bar, editor area, status bar. Shippado: layout 2-níveis em `ui/mod.rs` (sidebar + main horizontal; tabs + editor + status vertical), `<C-e>` toggle sidebar (`Mode::Tree`), `<C-w>>`/`<C-w><` resize, render correto em viewports variados via ratatui auto-resize.

### Tasks

- [ ] `struct AppLayout { sidebar_visible, sidebar_width, show_tabs, show_status }`
- [ ] Função `compute_layout(area: Rect, layout: &AppLayout) -> Layouts` retorna áreas individuais
- [ ] Render com `ratatui::layout::Layout` em dois níveis (horizontal pra sidebar + main, vertical pra tabs + editor + status)
- [ ] `<C-b>` toggle sidebar visible
- [ ] Sidebar width persistida em config
- [ ] Resize via drag (mouse opcional) ou `<C-w>>` / `<C-w><`
- [ ] Testes: layout correto em viewports de 80x24, 120x40, 200x60

## Story 02: File tree ✅ done

Árvore do vault com navegação e CRUD via teclado. Shippado: `Mode::Tree` + `Mode::TreePrompt`, `tree.rs` com refresh do `list_workspace`, j/k/h/l/o/Enter/gg/G motions, CRUD inline (a/r/d com prompts no status bar), foco swap via `Tab`. Atualização ao vivo via `notify` watcher ainda V2.

### Tasks

- [ ] Usar `tui-tree-widget` ou render custom com `ratatui::widgets::List`
- [ ] Listar estrutura do vault (reuso de `httui-core::session::list_workspace` — filtra `node_modules`, `target`, etc.)
- [ ] Atualização ao vivo via `notify` watcher
- [ ] Nó folha: arquivo; nó interno: pasta colapsável
- [ ] Motions: `j k` navegar, `h` colapsa, `l` expande, `o`/`<CR>` abre
- [ ] `gg` / `G` topo / bottom
- [ ] Criar arquivo: `a` + prompt inline com nome
- [ ] Criar pasta: `A` + prompt inline
- [ ] Rename: `r` em cima do nó + prompt
- [ ] Delete: `d` com confirmação (ex command `:delete` também)
- [ ] Mover: `:move {dest}` (ou yank + paste via registro especial)
- [ ] Indicador de arquivo ativo, arquivo modificado (●), arquivo conflitado (⚠)
- [ ] Foco na file tree via `<C-w>h` (como split esquerdo)
- [ ] Testes: CRUD produz efeito esperado, tree atualiza em tempo real

## Story 03: Sistema de tabs ✅ done

Múltiplos documentos abertos simultaneamente. Shippado: `TabBar` em `app.rs` (`tabs: Vec<TabState>`, `active`), `gt`/`gT` cycle, `:tabnew`/`open_in_new_tab`, `:tabclose`/`close_tab` com dirty check + `!` override. Persistência via `restore_session` ainda V2 (a sessão atual já é persistida em SQLite).

### Tasks

- [ ] `struct Tab { id, path, document, scroll, cursor_snapshot }`
- [ ] `struct TabBar { tabs: Vec<Tab>, active: usize }`
- [ ] Render: tab bar no topo do editor com nome relativo + dirty indicator
- [ ] `<C-Tab>` / `<C-S-Tab>` ou `gt` / `gT` cicla
- [ ] `:tabnew {path}` abre
- [ ] `:tabclose` / `<leader>bd` fecha (pede confirm se dirty)
- [ ] `:tabn {n}` / `{n}gt` vai pra tab N
- [ ] Fechar última tab volta pra estado "no file open" com prompt pra abrir
- [ ] Tabs persistem na sessão (reuso de `restore_session`)
- [ ] Middle click fecha (mouse opcional)
- [ ] Overflow: se tabs > largura, cicla via setas no lado direito
- [ ] Testes: abertura, fechamento, persistência, cursor preservado ao trocar

## Story 04: Split panes ✅ done

Editor dividido horizontal/vertical. Shippado: `PaneNode { Leaf, Split }` em `pane.rs`, full `<C-w>` family (s/v/h/j/k/l/c/o/=/>/<), border destacada no pane focado, render recursivo via ratatui Layout. Mover pane (`<C-w>HJKL`) e maximize (`<C-w>_/|`) ainda V2.

### Tasks

- [ ] `enum PaneNode { Leaf(TabBar), Split { direction, ratio, left, right } }`
- [ ] Árvore binária raiz em `App.pane_root`
- [ ] `:split` ou `<C-w>s` divide horizontal (embaixo)
- [ ] `:vsplit` ou `<C-w>v` divide vertical (direita)
- [ ] `<C-w>h/j/k/l` navega entre panes
- [ ] `<C-w>H/J/K/L` move pane
- [ ] `<C-w>>` / `<C-w><` / `<C-w>+` / `<C-w>-` resize
- [ ] `<C-w>=` equaliza
- [ ] `<C-w>_` / `<C-w>|` maximiza
- [ ] `:close` / `<C-w>c` fecha pane atual
- [ ] `:only` / `<C-w>o` fecha todos exceto atual
- [ ] Pane ativo tem border destacada
- [ ] Render recursivo: walk da árvore, aloca áreas via `ratatui::Layout`
- [ ] Testes: split/merge produzem árvore correta, navegação não quebra

## Story 05: Quick open (`<C-p>`) ✅ done

Busca fuzzy por nome de arquivo. Shippado: `Mode::QuickOpen`, `QuickOpen` state com `LineEdit` + fuzzy_score (subsequence + adjacency + start-of-segment bonuses), modal centralizado via `ui/quickopen.rs`, Up/Down/Ctrl-n/p navegação, Enter abre em nova tab. Preview pane do arquivo selecionado e MRU history ainda V2.

### Tasks

- [ ] Overlay modal no centro da tela (60% width, 40% height)
- [ ] Input field no topo com cursor
- [ ] Busca incremental conforme digita (usa `search_files` do core)
- [ ] Lista de resultados com até 20 matches, score fuzzy (Sublime Text-like)
- [ ] Match highlight: chars que bateram destacados em cor
- [ ] `<Up>` / `<Down>` navega; `<CR>` abre na pane atual
- [ ] `<C-o>` abre em split horizontal; `<C-v>` vertical; `<C-t>` em nova tab
- [ ] `<Esc>` / `<C-c>` fecha
- [ ] Histórico de arquivos recém abertos: se input vazio, mostra MRU
- [ ] Preview do arquivo selecionado no lado direito do modal (10 linhas do topo)
- [ ] Testes: fuzzy scoring correto, keyboard navigation funciona

## Story 06: FTS search (`<C-f>`) ✅ V1 done (2026-04-27)

Busca full-text no conteúdo do vault com snippet preview.

### Entregue na TUI

- [x] **Modal overlay** — full-screen 90×70 centered (`ui/content_search.rs`), título `Find content · N matches`, prompt `?` (vs `>` do quick-open) pra diferenciação visual
- [x] **Chord `<C-f>`** — bound em `vim/keybindings.rs::CONTENT_SEARCH`, sobrepõe vim's `<C-f>` page-down (já temos `<C-d>` half-page, então OK). Não usa leader (TUI não tem leader infra)
- [x] **Backend reuse** — `httui-core::search::search_content` (FTS5, snippet com `<mark>` tags, ORDER BY rank LIMIT 50). Lib já existe + testada
- [x] **Lazy index rebuild** — `App.content_search_index_built: bool`. First open this session faz `rebuild_search_index` sync via `tokio::block_in_place` (V1 trade-off: brief freeze on big vaults)
- [x] **Per-keystroke search** — `commands/search.rs::requery` chama `search_content` sync após cada char/backspace/delete. Empty query mostra hint placeholder; query malformada (FTS5 syntax error mid-typing) limpa results sem barulho
- [x] **Snippet rendering** — parser leve em `ui/content_search::highlight_snippet` traduz `<mark>…</mark>` pra spans coloridos (bg LightGreen na região marcada, fg DarkGray no resto). Folds CR/LF pra space pra cada result ficar em uma linha
- [x] **Result row** — duas linhas por entry: file path em LightCyan, snippet indented em DarkGray. ListItem multi-line (Ratatui suporta nativo)
- [x] **Navegação** — Up/Down + Ctrl-n/Ctrl-p movem highlight; **j/k vão pro buffer** (FTS5 query pode conter j/k literais)
- [x] **`<CR>` abre arquivo** — chama `app.open_in_new_tab(path)`, falha (file moved/deleted desde index) surface como status error
- [x] **Tests:** 5 novos (3 do `highlight_snippet` em UI module + 2 do parser routing)

### Polish entregue (mesmo dia)

- [x] **Update-on-save** — hook em `vim/ex.rs::write_document`. Após `write_note` succeed, spawn-and-forget `update_search_entry(pool, file_path, body)`. Gate em `content_search_index_built` pra não escrever rows que o user nunca vai consultar. Apenas `.md`.
- [x] **Update-on-delete** — hook em `app.rs::delete_path`. Após `remove_file/remove_dir_all`, spawn-and-forget purge: file → `remove_search_entry`; dir → `DELETE WHERE file_path = ? OR file_path LIKE 'dir/%'` direto via sqlx.
- [x] **Update-on-rename** — hook em `app.rs::rename_path`. Após `fs::rename`, drop a row antiga + re-insert sob o novo path com o body atual lido do disco.
- [x] **Async rebuild com banner "indexing…"** — `open_content_search` agora spawn-task em vez de `tokio::block_in_place`. Modal abre imediatamente com `state.building = true` e banner amarelo "indexing vault…". Per-keystroke `requery` é no-op enquanto building (querying um índice meio-construído mostraria resultados parciais). `AppEvent::ContentSearchIndexBuilt` flippa o flag, dispara um requery final contra o índice fresh, e — em failure — fecha o modal + status error.

### Não cobre (V2)

- [ ] Watcher integration (`notify` crate) pra detectar mudanças externas (edição via outro editor enquanto TUI está aberto)
- [ ] Move cursor pra linha do match (FTS5 schema atual não armazena offsets, precisa ampliar)
- [ ] Filtros via prefixos (`ext:md`, `path:docs/`)
- [ ] Quickfix list (`<Tab>` adiciona match à lista)
- [ ] 3-line context preview no result panel

## Story 07: Status bar ✅ done (parcial)

Linha de status com modo, env, conexão, cursor, hints. Shippado: `ui/status.rs` com layout 3-zone (modo + ctx esquerda, posição centro, hints/messages direita), modo com bg color por kind (Normal cyan, Insert yellow, Visual red, Find green, etc.), minibuffer pra `:` e `/` (CommandLine/Search), TreePrompt inline, indicador dirty (`·●`). Pendente V2: env ativa + conexão default no chrome do status bar, encoding/file type, `:messages` log de notifications.

### Tasks

- [ ] Layout em 3 zonas: left (modo + contexto), center (posição), right (hints)
- [ ] Modo: `NOR` / `INS` / `VIS` / `VLINE` / `VBLOCK` / `REPLACE` / `CMD` / `SEARCH`
- [ ] Background color por modo (normal: cinza, insert: verde, visual: azul, replace: vermelho)
- [ ] Environment ativa ao lado do modo
- [ ] Conexão DB default (se houver)
- [ ] Indicador dirty (`·●` amarelo)
- [ ] Indicador de conflito (`⚠` vermelho)
- [ ] Posição: `Ln 12 Col 4`, `12%` (linha atual / total)
- [ ] Encoding + file type: `UTF-8 md`
- [ ] Hints contextuais (ou mensagens de erro temporárias, 3s timeout)
- [ ] Durante `:` ou `/`: minibuffer ocupa a status bar inteira
- [ ] Testes: render correto em cada modo/estado

## Story 08: Slash-like command palette (`<leader>`)

Which-key style overlay com mappings disponíveis após prefix.

### Tasks

- [ ] Ao pressionar `<leader>` (default `<Space>`), aguardar próxima tecla com timeout configurável
- [ ] Se nenhum mapping bate, cancela
- [ ] Timeout cria overlay centralizado com lista de mappings disponíveis
- [ ] Lista filtrada conforme teclas subsequentes (ex: `<leader>f` mostra todos que começam com `f`)
- [ ] Agrupamento por namespace: `file/`, `buffer/`, `env/`, `db/`, `search/`
- [ ] Descrições curtas por mapping
- [ ] `<Esc>` cancela
- [ ] Testes: overlay aparece com timeout, mappings corretos exibidos

## Story 09: Notifications e dialogs

Mensagens temporárias, confirmações, prompts inline.

### Tasks

- [ ] `enum Notification { Info(String), Warn(String), Error(String) }` com auto-timeout
- [ ] Render na status bar (prioridade sobre hints)
- [ ] Stack de notifications; mais recente visível, histórico acessível via `:messages`
- [ ] Dialog modal: `confirm("Delete file? y/n")` bloqueia input global até resposta
- [ ] Prompt inline: input field no topo da viewport ou overlay pequeno
- [ ] Usado pra: rename file, create file/folder, confirm destructive actions
- [ ] Testes: notification timeout, dialog bloqueia corretamente, prompt aceita input

## Story 10: Resize e terminal quirks

Handling de resize + compatibilidade com terminais diversos.

### Tasks

- [ ] Listener `crossterm::event::Event::Resize(u16, u16)` reatribui layout
- [ ] Min size: 60×20. Abaixo disso, mostra tela "Terminal too small" até resize.
- [ ] Detectar truecolor vs 256 color via env vars (`COLORTERM`, `TERM`) e ajustar tema
- [ ] Testar em: iTerm2, Alacritty, Kitty, Wezterm, Windows Terminal, tmux, Ghostty
- [ ] Documentar limitações por terminal (ex: cursor shape não muda em alguns)
- [ ] Mouse support opt-in via config (muitos terminais conflitam com seleção nativa)
- [ ] Testes manuais matrix (checklist documentado)
