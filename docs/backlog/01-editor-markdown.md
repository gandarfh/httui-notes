# Epic 01 — Editor Markdown

Implementar o editor TipTap com suporte completo a markdown, slash commands, e rendering de blocos especiais.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 05 (Block System), Epic 06 (Database Blocks), Epic 07 (HTTP Client)

---

## Story 01: TipTap core setup

Montar o editor TipTap basico com extensions padrao.

### Tasks

- [ ] Criar componente `<Editor />` com TipTap + StarterKit (paragraph, heading, bold, italic, code, lists, blockquote, divider)
- [ ] Configurar extension de placeholder ("Type / for commands...")
- [ ] Configurar extension de Typography (smart quotes, dashes)
- [ ] Configurar extension de dropcursor e gapcursor
- [ ] Implementar toolbar basica com daisyUI (bold, italic, headings, lists) para modo VS Code-style
- [ ] Validar que o editor renderiza e permite edicao de texto basico

## Story 02: Serializacao markdown

Converter entre conteudo TipTap (ProseMirror JSON) e markdown no filesystem.

### Tasks

- [ ] Implementar serializer TipTap -> markdown (GFM-compatible)
- [ ] Implementar parser markdown -> TipTap (carregar `.md` no editor)
- [ ] Suportar: headings, paragraphs, bold, italic, strikethrough, code inline, code blocks, lists (ordered, unordered, task lists), blockquotes, horizontal rules, links, images
- [ ] Suportar tabelas GFM (pipe tables)
- [ ] Preservar fenced code blocks customizados (```http, ```db-*, ```e2e) como nodes opacos durante parse/serialize
- [ ] Escrever testes: roundtrip markdown -> editor -> markdown deve preservar conteudo

## Story 03: Slash commands

Menu de comandos ao digitar `/`.

### Tasks

- [ ] Implementar extension de suggestion do TipTap para trigger `/`
- [ ] Criar componente de menu dropdown com daisyUI (`menu` component) com filtro por texto digitado
- [ ] Registrar comandos basicos: /h1, /h2, /h3, /todo, /quote, /divider, /code, /table
- [ ] Registrar comandos de blocos executaveis: /http, /sql, /db, /e2e
- [ ] Registrar comandos de blocos especiais: /mermaid, /math
- [ ] Cada comando insere o node correspondente na posicao do cursor
- [ ] Suporte a navegacao por teclado no menu (setas + Enter + Escape)

## Story 04: Drag and drop de blocos

Permitir reordenacao de blocos via drag.

### Tasks

- [ ] Configurar drag handle nos blocos do TipTap (aparece ao hover na lateral esquerda do bloco)
- [ ] Implementar drag and drop nativo do ProseMirror com visual feedback (linha indicadora de drop position)
- [ ] Para blocos executaveis: ao mover, validar se referencias `{{...}}` continuam apontando para blocos acima
- [ ] Se referencia fica invalida apos drag (bloco movido acima da dependencia), mostrar warning visual no bloco

## Story 05: GFM tables

Suporte completo a tabelas estilo GitHub.

### Tasks

- [ ] Instalar e configurar `@tiptap/extension-table`, `table-row`, `table-cell`, `table-header`
- [ ] Estilizar tabelas com classes daisyUI (`table`, `table-zebra`)
- [ ] Implementar toolbar contextual de tabela: adicionar/remover rows e colunas, merge cells
- [ ] Serializar tabelas como pipe tables no markdown (GFM format)

## Story 06: Mermaid diagrams

Renderizar blocos ```mermaid como diagramas inline.

### Tasks

- [ ] Criar TipTap node customizado `MermaidBlock` com nodeView React
- [ ] Integrar mermaid.js para renderizar o conteudo do bloco como SVG
- [ ] Mostrar code editor (CodeMirror) ao clicar no diagrama para editar
- [ ] Re-renderizar diagrama em tempo real ao editar (debounce 500ms)
- [ ] Tratar erros de syntax mermaid com mensagem visual no bloco

## Story 07: KaTeX math

Renderizar expressoes matematicas inline e display.

### Tasks

- [ ] Instalar KaTeX
- [ ] Criar TipTap mark customizado para math inline (`$...$`)
- [ ] Criar TipTap node customizado para math display (`$$...$$`)
- [ ] Renderizar expressoes via KaTeX com fallback para source em caso de erro
- [ ] Estilizar com classes compatíveis com o theme daisyUI

## Story 08: Syntax highlighting em code blocks

Code blocks com language identifier renderizam com highlighting.

### Tasks

- [ ] Configurar extension `@tiptap/extension-code-block-lowlight`
- [ ] Instalar highlight.js ou Shiki como engine de highlighting
- [ ] Suportar languages: javascript, typescript, python, rust, go, json, yaml, sql, bash, html, css
- [ ] Estilizar code blocks com cores compatíveis com theme light/dark

## Story 09: Wikilinks

Links internos estilo Obsidian.

### Tasks

- [ ] Criar TipTap mark ou node customizado para wikilinks `[[...]]`
- [ ] Implementar input rule que detecta `[[` e abre autocomplete
- [ ] Autocomplete lista documentos existentes no vault (busca fuzzy por nome)
- [ ] Renderizar wikilinks como links clicaveis estilizados (diferente de links externos)
- [ ] Ao clicar: abrir documento no pane atual
- [ ] Ao clicar com modifier key (Cmd/Ctrl): abrir em novo pane
- [ ] Tratar links quebrados (documento referenciado nao existe) com estilo visual diferente
