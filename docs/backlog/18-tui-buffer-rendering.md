# Epic 18 — TUI Buffer & Rendering

Modelo de buffer baseado em árvore de segmentos (prose + blocos), parser/serializer reusado do core, render pipeline com highlight markdown, e layout dinâmico de widgets com reflow.

**Depende de:** Epic 17 (TUI Foundation)
**Desbloqueia:** Epic 19 (Vim Engine), Epic 21 (Block Widgets)

Referência: [`docs/tui-design.md`](../tui-design.md) §5 (buffer model), §7 (render).

---

## Story 01: Block tree buffer model

Implementar a estrutura `Document` com segmentos tipados (prose / bloco) e cursor union type.

### Tasks

- [ ] Módulo `buffer::document` com:
  - [ ] `enum Segment { Prose(Rope), Block(BlockNode) }`
  - [ ] `struct BlockNode { id, block_type, fence_info, fields: IndexMap<FieldId, Rope>, state, cached_result }`
  - [ ] `struct Document { segments, cursor, undo, redo, marks, dirty }`
  - [ ] `enum Cursor { InProse { segment_idx, offset }, BlockSelected { segment_idx }, InBlock { segment_idx, field_id, offset } }`
- [ ] `BlockId` como newtype `u64` incremental, gerado pelo `Document`
- [ ] API de mutação: `insert_char`, `insert_str`, `delete_range`, `replace_range`
- [ ] API de navegação: `cursor_up`, `cursor_down`, `cursor_to_line_start/end`, `cursor_next_word`, `cursor_prev_word`
- [ ] Todas as mutações produzem `Edit` pro undo stack
- [ ] Testes unitários: insert/delete em prose, em campo de bloco, atravessando fronteiras

## Story 02: Markdown parser/serializer reuso

Expor o parser/serializer do `httui-core::blocks` pra construir `Document` a partir de `.md` e vice-versa.

### Tasks

- [ ] Garantir que `httui-core::blocks::parser` aceita string e retorna lista de tokens (`ProseRun(String)`, `Block { block_type, fence_info, body }`)
- [ ] Função `Document::from_markdown(src: &str) -> Result<Document>`:
  - [ ] Usa parser do core
  - [ ] Converte cada `ProseRun` em `Segment::Prose(Rope::from(...))`
  - [ ] Converte cada `Block` em `Segment::Block(BlockNode::from_fence(...))`
  - [ ] Campos do bloco populados via parse do corpo (URL, headers, body pra HTTP; SQL pra DB; steps pra E2E)
- [ ] Função `Document::to_markdown(&self) -> String`:
  - [ ] Walk segments, emite prose cru (rope → string)
  - [ ] Emite fence canônica por bloco (usa serializer do core)
- [ ] Testes de roundtrip: load → save produz bytes idênticos (normalização determinística)
- [ ] Testes de edge cases: arquivo vazio, só blocos, só prose, bloco malformado (parser retorna erro com posição)

## Story 03: Prose rendering com tree-sitter-markdown

Renderizar prose com highlight de markdown (headings, bold, italic, code, links, listas, wikilinks).

### Tasks

- [ ] Adicionar `tree-sitter-markdown` + `tree-sitter-markdown-inline`
- [ ] Carregar highlight queries do tree-sitter pra markdown
- [ ] Função `render_prose(rope: &Rope, area: Rect, theme: &Theme) -> Paragraph`
  - [ ] Itera linhas visíveis (baseado em scroll offset)
  - [ ] Aplica spans do tree-sitter como `ratatui::text::Span` com cor/modifier
- [ ] Suporte a inline: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[link](url)`, `[[wikilink]]`
- [ ] Suporte a block-level: `#` a `######` (headings com cor por nível), `- ` / `* ` / `1.` (listas), `> ` (quote), `---` (divider), `| ... |` (pipe tables)
- [ ] Code blocks não-executáveis renderizados com syntect por linguagem
- [ ] Testes: cada construção markdown renderiza spans corretos

## Story 04: Widget layout e reflow

Alocar espaço vertical dinâmico pra cada bloco e recalcular quando conteúdo ou display_mode muda.

### Tasks

- [ ] Função `layout_segment(segment: &Segment, viewport_width: u16) -> u16` retorna altura
  - [ ] Prose: conta linhas do rope (com wrap se habilitado)
  - [ ] Block: altura varia por tipo + display_mode + estado
- [ ] Cache de altura por segmento invalidado quando conteúdo muta
- [ ] Função `layout_document(&Document, viewport_width) -> Vec<SegmentLayout>` retorna lista com `{ segment_idx, y_start, height }`
- [ ] `viewport_scroll: usize` (y absoluto no documento)
- [ ] `scroll_to_cursor()` ajusta viewport mantendo `scrolloff`
- [ ] Redraw completo quando layout muda; incremental (só linha do cursor) em edição inline
- [ ] Testes: layout estável com conteúdo fixo, reflow correto após mudança de display_mode

## Story 05: Cursor rendering e posicionamento

Mapear `Cursor` lógico pra posição na tela e desenhar visualmente em cada modo.

### Tasks

- [ ] Função `cursor_to_screen(&Document, &SegmentLayouts) -> (u16, u16)`
  - [ ] `InProse`: offset no rope → linha + coluna relativa + y do segment
  - [ ] `BlockSelected`: y do header do bloco, coluna 0
  - [ ] `InBlock`: delegação pro widget do bloco (sabe onde cada campo está)
- [ ] Estilos de cursor por modo:
  - [ ] Normal: block cursor
  - [ ] Insert: vertical bar
  - [ ] Replace: underline
  - [ ] Visual: sem cursor + highlight da seleção
- [ ] `BlockSelected`: borda do bloco vira dupla / accent color
- [ ] Wrap off: cursor horizontal scroll garante visibilidade
- [ ] Testes snapshot: posição de cursor correta em cada combinação modo × cursor variant

## Story 06: Undo / redo

Stack de edições com merge inteligente e scope por região.

### Tasks

- [ ] `Edit` enum com variantes: `InsertText`, `DeleteText`, `InsertSegment`, `DeleteSegment`, `MoveSegment`, `ChangeFence`
- [ ] Cada mutação registra um `Edit` no undo stack
- [ ] `Document::undo()` pop do undo → apply inverso → push no redo
- [ ] `Document::redo()` inverso
- [ ] Merge de edits consecutivos de insert no mesmo offset (evita undo char-por-char)
- [ ] Undo boundary em `<Esc>` saindo de insert (agrupa a sessão de insert inteira)
- [ ] Limite configurável (default 1000 undos)
- [ ] Testes: undo/redo de cada operação, merge correto, boundary respeitado

## Story 07: Viewport scroll e navegação vertical

Scroll suave do documento mantendo cursor visível e respeitando `scrolloff`.

### Tasks

- [ ] `viewport.top: usize` (y absoluto da linha no topo)
- [ ] `viewport.height: u16` (altura da área do editor)
- [ ] `scroll_by(delta: i32)` ajusta `top` clampado
- [ ] `ensure_cursor_visible()`: se cursor fora + `scrolloff`, move `top`
- [ ] `<C-u>` / `<C-d>` scroll meia tela; `<C-f>` / `<C-b>` tela inteira
- [ ] `zz` / `zt` / `zb`: centra / top / bottom (cursor na posição)
- [ ] `H` / `M` / `L`: cursor pra topo / meio / bottom do viewport
- [ ] Bloco parcialmente visível continua renderizando a parte visível
- [ ] Testes: scroll com blocos de altura variável funciona corretamente
