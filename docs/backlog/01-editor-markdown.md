# Epic 01 — Editor Markdown ✅

Implementar o editor TipTap com suporte completo a markdown, slash commands, e rendering de blocos especiais.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 05 (Block System), Epic 06 (Database Blocks), Epic 07 (HTTP Client)
**Status:** concluido

---

## Story 01: TipTap core setup ✅

Montar o editor TipTap basico com extensions padrao.

### Tasks

- [x] Criar componente `<Editor />` com TipTap + StarterKit (paragraph, heading, bold, italic, code, lists, blockquote, divider)
- [x] Configurar extension de placeholder ("Type / for commands...")
- [x] Configurar extension de Typography (smart quotes, dashes)
- [x] Configurar TaskList + TaskItem extensions
- [x] Configurar Link + Image extensions
- [x] Validar que o editor renderiza e permite edicao de texto basico

## Story 02: Serializacao markdown ✅

Converter entre conteudo TipTap (HTML) e markdown no filesystem.

### Tasks

- [x] Implementar parser markdown -> HTML (via marked, GFM-compatible)
- [x] Implementar serializer HTML -> markdown (via turndown)
- [x] Preservar fenced code blocks customizados (```http, ```db-*, ```e2e) como nodes opacos durante parse/serialize
- [x] Suportar: headings, paragraphs, bold, italic, strikethrough, code inline, code blocks, lists, blockquotes, horizontal rules, links, images
- [x] Integrar no AppShell: read_note -> markdownToHtml -> editor, editor -> htmlToMarkdown -> write_note
- [x] Suportar tabelas GFM (pipe tables) — implementado em Story 05
- [x] Escrever testes de roundtrip — HTTP, DB, E2E blocks + tabelas GFM em `roundtrip.test.ts`

## Story 03: Slash commands ✅

Menu de comandos ao digitar `/`.

### Tasks

- [x] Implementar extension com @tiptap/suggestion para trigger `/`
- [x] Criar componente SlashMenu com daisyUI
- [x] Registrar comandos basicos: Heading 1/2/3, Bullet List, Numbered List, Task List, Quote, Code Block, Divider
- [x] Suporte a filtro fuzzy pelo texto digitado
- [x] Suporte a navegacao por teclado (setas + Enter + Escape)
- [x] Registrar comandos de blocos executaveis: /http, /db, /e2e — implementado em `slashCommands.ts`

## Story 04: Drag and drop de blocos ✅

Permitir reordenacao de blocos via drag.

### Tasks

- [x] Configurar drag handle nos blocos do TipTap
- [x] Implementar drag and drop nativo do ProseMirror
- [x] Validacao de referencias ao mover blocos executaveis — `validateBlockMove()` em `EditorDragDrop.tsx`

## Story 05: GFM tables ✅

Suporte completo a tabelas estilo GitHub.

### Tasks

- [x] Instalar e configurar `@tiptap/extension-table`
- [x] Estilizar tabelas com Chakra UI
- [x] Toolbar contextual de tabela — implementado em `TableToolbar.tsx`
- [x] Serializar tabelas como pipe tables no markdown

## Story 06: Mermaid diagrams ✅

Renderizar blocos ```mermaid como diagramas inline.

### Tasks

- [x] Criar TipTap node customizado `MermaidBlock` com nodeView React
- [x] Integrar mermaid.js para renderizar SVG
- [x] Code editor ao clicar no diagrama
- [x] Re-renderizar em tempo real (debounce 500ms)

## Story 07: KaTeX math ✅

Renderizar expressoes matematicas inline e display.

### Tasks

- [x] Criar TipTap node para math inline (`$...$`) e display (`$$...$$`)
- [x] Renderizar via KaTeX com fallback

## Story 08: Syntax highlighting em code blocks ✅

Code blocks com language identifier renderizam com highlighting.

### Tasks

- [x] Configurar extension `@tiptap/extension-code-block-lowlight`
- [x] Instalar highlight.js + lowlight
- [x] Estilizar com cores compatíveis com theme light/dark via Chakra tokens

## Story 09: Wikilinks ✅

Links internos estilo Obsidian.

### Tasks

- [x] Criar TipTap node para wikilinks `[[...]]`
- [x] Autocomplete de documentos no vault via `[[` trigger
- [x] Suporte a sintaxe `[[target|label]]`
