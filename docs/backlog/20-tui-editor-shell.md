# Epic 20 — TUI Editor Shell

Layout fora da área de edição: file tree, tabs, splits, quick open, FTS search, status bar, sidebar. Tudo via teclado e ex commands.

**Depende de:** Epic 18 (Buffer & Rendering), Epic 19 (Vim Engine)
**Desbloqueia:** Epic 22 (Integrations)

Referência: [`docs/tui-design.md`](../tui-design.md) §7.1, §8.

---

## Story 01: Layout raiz e composição de panes

Estrutura de containers: sidebar, tab bar, editor area, status bar.

### Tasks

- [ ] `struct AppLayout { sidebar_visible, sidebar_width, show_tabs, show_status }`
- [ ] Função `compute_layout(area: Rect, layout: &AppLayout) -> Layouts` retorna áreas individuais
- [ ] Render com `ratatui::layout::Layout` em dois níveis (horizontal pra sidebar + main, vertical pra tabs + editor + status)
- [ ] `<C-b>` toggle sidebar visible
- [ ] Sidebar width persistida em config
- [ ] Resize via drag (mouse opcional) ou `<C-w>>` / `<C-w><`
- [ ] Testes: layout correto em viewports de 80x24, 120x40, 200x60

## Story 02: File tree

Árvore do vault com navegação e CRUD via teclado.

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

## Story 03: Sistema de tabs

Múltiplos documentos abertos simultaneamente, cada um com seu cursor/estado.

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

## Story 04: Split panes

Editor dividido horizontal/vertical com panes independentes.

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

## Story 05: Quick open (`<C-p>`)

Busca fuzzy por nome de arquivo com preview.

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

## Story 06: FTS search (`<leader>fg`)

Busca full-text no conteúdo do vault com snippet preview.

### Tasks

- [ ] Overlay similar ao quick open, mas busca conteúdo (usa `search_content` do core com FTS5)
- [ ] Resultado: `{ path, line, snippet com highlight, score }`
- [ ] Input com debounce (200ms) pra não overwhelm FTS
- [ ] Regex opcional com `\v` prefix (smart-default)
- [ ] Filtros via prefixos: `ext:md` (filetype), `path:docs/` (path contains)
- [ ] `<CR>` abre arquivo no match + move cursor pra linha
- [ ] `<Tab>` adiciona ao quickfix list (opcional MVP)
- [ ] Preview: 3 linhas de contexto antes/depois do match com highlight
- [ ] Testes: encontra matches, preview correto, filtros funcionam

## Story 07: Status bar

Linha de status com modo, env, conexão, cursor, hints.

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
