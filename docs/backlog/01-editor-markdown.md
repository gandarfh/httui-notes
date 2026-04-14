# Epic 01 — Editor Markdown (parcial)

Implementar o editor TipTap com suporte completo a markdown, slash commands, e rendering de blocos especiais.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 05 (Block System), Epic 06 (Database Blocks), Epic 07 (HTTP Client)
**Status:** em andamento (stories core concluidas, stories avancadas pendentes)

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
- [ ] Suportar tabelas GFM (pipe tables) — adiado para Story 05
- [ ] Escrever testes de roundtrip — adiado

## Story 03: Slash commands ✅

Menu de comandos ao digitar `/`.

### Tasks

- [x] Implementar extension com @tiptap/suggestion para trigger `/`
- [x] Criar componente SlashMenu com daisyUI
- [x] Registrar comandos basicos: Heading 1/2/3, Bullet List, Numbered List, Task List, Quote, Code Block, Divider
- [x] Suporte a filtro fuzzy pelo texto digitado
- [x] Suporte a navegacao por teclado (setas + Enter + Escape)
- [ ] Registrar comandos de blocos executaveis: /http, /sql, /db, /e2e — depende do Epic 05

## Story 04: Drag and drop de blocos

Permitir reordenacao de blocos via drag.

### Tasks

- [ ] Configurar drag handle nos blocos do TipTap
- [ ] Implementar drag and drop nativo do ProseMirror
- [ ] Validacao de referencias ao mover blocos executaveis

## Story 05: GFM tables

Suporte completo a tabelas estilo GitHub.

### Tasks

- [ ] Instalar e configurar `@tiptap/extension-table`
- [ ] Estilizar tabelas com classes daisyUI
- [ ] Toolbar contextual de tabela
- [ ] Serializar tabelas como pipe tables no markdown

## Story 06: Mermaid diagrams

Renderizar blocos ```mermaid como diagramas inline.

### Tasks

- [ ] Criar TipTap node customizado `MermaidBlock` com nodeView React
- [ ] Integrar mermaid.js para renderizar SVG
- [ ] Code editor ao clicar no diagrama
- [ ] Re-renderizar em tempo real (debounce)

## Story 07: KaTeX math

Renderizar expressoes matematicas inline e display.

### Tasks

- [ ] Criar TipTap mark/node para math inline e display
- [ ] Renderizar via KaTeX com fallback

## Story 08: Syntax highlighting em code blocks

Code blocks com language identifier renderizam com highlighting.

### Tasks

- [ ] Configurar extension `@tiptap/extension-code-block-lowlight`
- [ ] Instalar highlight.js ou Shiki
- [ ] Estilizar com cores compatíveis com theme light/dark

## Story 09: Wikilinks

Links internos estilo Obsidian.

### Tasks

- [ ] Criar TipTap mark/node para wikilinks `[[...]]`
- [ ] Autocomplete de documentos no vault
- [ ] Navegacao ao clicar
