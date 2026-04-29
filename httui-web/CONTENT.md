# httui — Content da Landing Page

Conteudo completo para cada secao da landing page, pronto para implementar.

---

## Hero Section

**Headline:**
Your API docs, alive.

**Subheadline:**
httui is a desktop editor where markdown meets execution. Write docs, run HTTP requests, query databases, and test APIs — all in the same file.

**CTA primario:** Download for Mac / Windows / Linux
**CTA secundario:** View on GitHub

> **[HERO MEDIA]** GIF ou video (8-12s) mostrando:
> 1. Digitar markdown normalmente
> 2. Inserir um bloco HTTP via `/http`
> 3. Clicar Run e ver o response aparecer inline
> 4. Referenciar o resultado em outro bloco com `{{...}}`
>
> **Specs:** 1200x750px, loop, fundo escuro (dark mode), sem audio

---

## Problem Statement

**Headline:** Your workflow is fragmented

**Body:**
You write API docs in one tool, test requests in another, query the database in a third, and manage environment variables in a fourth. Context switches kill your flow.

**Cards (3 colunas):**

| Before | Tool | Pain |
|--------|------|------|
| Document APIs | Notion / Confluence | Static, can't verify examples |
| Test endpoints | Postman / Insomnia | Separate app, collections divorced from docs |
| Query databases | DBeaver / pgAdmin | Zero connection to your API documentation |

**Transition:** What if one tool did all three — inside your documents?

---

## Core Features

### Feature 1: HTTP Blocks

**Headline:** Execute HTTP requests inline

**Body:**
Write a request, hit Run, see the response — right in your document. Color-coded methods, environment variables, headers, body editor. Results cached and referenceable.

**Bullet points:**
- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- `{{variable}}` interpolation from environments
- Response syntax highlighting (JSON, HTML, XML)
- Binary response rendering (images, PDFs)
- Cached results with content-hash invalidation

> **[SCREENSHOT: http-block]** Print mostrando:
> - Um bloco HTTP com method selector (POST, cor verde)
> - URL com variavel `{{base_url}}/api/users`
> - Tabs: Params | Headers | Body (Body selecionado com JSON)
> - Response: status 201 Created, elapsed time, JSON formatado
>
> **Specs:** 900x500px, dark mode, dados realistas (nao lorem ipsum)

---

### Feature 2: Database Blocks

**Headline:** Query any database, see results inline

**Body:**
Connect to PostgreSQL, MySQL, or SQLite. Write SQL with schema-aware autocomplete, see paginated results in a table — all inside your markdown document.

**Bullet points:**
- PostgreSQL, MySQL, SQLite support
- Schema introspection with table/column autocomplete
- Paginated result tables (DBeaver-style)
- Connection pooling with configurable TTL
- Credentials encrypted via OS keychain

> **[SCREENSHOT: db-block]** Print mostrando:
> - Connection selector dropdown
> - SQL editor com syntax highlighting
> - Tabela de resultados paginada (tipo DBeaver)
> - Schema sidebar com tabelas expandidas
>
> **Specs:** 900x500px, dark mode, query realista (SELECT com JOIN)

---

### Feature 3: E2E Test Blocks

**Headline:** API test suites in your docs

**Body:**
Define multi-step HTTP flows with assertions and variable extraction between steps. Run the full sequence and see pass/fail results per step.

**Bullet points:**
- Sequential steps with variable extraction
- Assertions: status code, JSON path matching, body contains
- Results summary bar with pass/fail count
- Variables extracted from one step used in the next
- Full response details per step

> **[GIF: e2e-block]** GIF mostrando:
> 1. Um bloco E2E com 3 steps (Create User -> Get User -> Delete User)
> 2. Clicar Run
> 3. Steps executando sequencialmente (loading -> pass/fail)
> 4. Summary bar: "3/3 passed"
>
> **Specs:** 900x500px, dark mode, 6-8s loop

---

### Feature 4: Block References

**Headline:** Blocks talk to each other

**Body:**
Reference any block's result in another using `{{alias.response.path}}`. Create a user via HTTP, then query the database using the returned ID — all connected.

**Bullet points:**
- `{{alias.response.id}}` syntax for cross-block references
- Auto-execution of dependencies
- DAG structure prevents circular references
- Priority: block reference > environment variable
- SQL uses parameterized binding (never string interpolation)

> **[GIF: block-references]** GIF mostrando:
> 1. Bloco HTTP "create-user" retornando `{ "id": 42 }`
> 2. Bloco DB abaixo com `SELECT * FROM users WHERE id = {{create-user.response.id}}`
> 3. Executar o bloco DB — ele auto-executa o HTTP primeiro
> 4. Resultado mostra o user com id 42
>
> **Specs:** 900x500px, dark mode, 8-10s loop

---

## Editor Features

**Headline:** A real editor, not a form builder

**Cards (grid 2x3):**

### Multi-pane editing
Split your workspace into multiple panes, each with its own tabs and files. Vim-style splits.
> **[SCREENSHOT: multi-pane]** 2-3 panes lado a lado com arquivos diferentes. 800x400px.

### Vim keybindings
Full Vim mode with motions, operators, and visual mode. Toggle from the status bar.
> **[SCREENSHOT: vim-mode]** Status bar mostrando "NORMAL" mode badge. 400x60px.

### Environments
Switch between Local, Staging, Production. Variables auto-complete in all blocks.
> **[SCREENSHOT: environments]** Dropdown de environments no TopBar + drawer com key-value editor. 600x400px.

### Full-text search
FTS5-powered search across all your documents. Instant results with snippet highlighting.
> **[SCREENSHOT: search]** Search panel com resultados e snippets. 600x400px.

### Mermaid diagrams
Flowcharts, sequence diagrams, ERDs — rendered inline in your markdown.
> **[SCREENSHOT: mermaid]** Diagrama mermaid renderizado (flowchart ou sequence). 500x300px.

### Slash commands
Type `/http`, `/sql`, `/e2e`, or `/table` to insert blocks instantly.
> **[GIF: slash-commands]** Digitar `/` e ver o menu, selecionar `/http`. 500x300px, 3s loop.

---

## AI Integration

**Headline:** Claude, built in

**Body:**
An integrated AI assistant that understands your workspace. Ask questions about your APIs, generate requests, debug responses — with full tool access and explicit permission control.

**Bullet points:**
- Claude chat panel with streaming responses
- Tool access: read files, search, edit notes
- Explicit permission system (Once / Session / Always)
- Side-by-side diff viewer for AI-proposed changes
- Image attachments (drag-drop, clipboard, file picker)
- Session persistence with resume support
- Wikilink context: mention `[[note]]` to include note content

> **[GIF: ai-chat]** GIF mostrando:
> 1. Abrir chat panel
> 2. Perguntar "create an HTTP block that fetches users from the API"
> 3. Claude responder com tool use (update_note)
> 4. Diff viewer aparecer com as mudancas
> 5. Clicar Allow
>
> **Specs:** 1000x600px, dark mode, 10-12s

---

## Storage & Philosophy

**Headline:** Plain markdown. Local first. Your data.

**Cards (3 colunas):**

### Plain .md files
Your notes are standard markdown files on disk. Read them in VS Code, GitHub, Obsidian — anywhere.
> **[SCREENSHOT: md-file]** O mesmo arquivo aberto no httui e num editor de texto simples lado a lado. 800x300px.

### Git-friendly
Diff, branch, merge your API documentation like code. No proprietary formats, no vendor lock-in.

### No cloud required
Everything runs locally. No account, no subscription, no data leaving your machine. Open source.

---

## Comparison Table

**Headline:** How httui compares

| Feature | httui | Postman | Insomnia | Bruno | Obsidian |
|---------|-------|---------|----------|-------|----------|
| HTTP requests | Yes | Yes | Yes | Yes | No |
| Database queries | Yes | No | No | No | No |
| E2E test blocks | Yes | Partial | No | No | No |
| Block references | Yes | No | No | No | No |
| Markdown editor | Yes | No | No | No | Yes |
| Multi-pane editing | Yes | No | No | No | No |
| Vim keybindings | Yes | No | No | No | Yes (plugin) |
| AI assistant | Yes | Yes (paid) | No | No | Yes (plugin) |
| Local-first | Yes | No | Yes | Yes | Yes |
| Plain file storage | Yes | No | No | Yes | Yes |
| Open source | Yes | No | Partial | Yes | No |
| Free | Yes | Freemium | Freemium | Yes | Freemium |

---

## Technical Highlights

**Headline:** Built for developers, by developers

**Cards (2x2):**

### Tauri v2 + Rust
Native performance, tiny binary (~15MB), low memory footprint. No Electron bloat.

### Plugin architecture
Open/Closed principle — add new block types without modifying existing code. Each block is a self-contained vertical slice.

### Secure by design
OS keychain encryption for credentials, parameterized SQL (no injection), sandboxed AI tools with explicit permissions.

### Extensible
Trait-based executor system in Rust, TipTap node extensions in TypeScript. Built to grow.

---

## Getting Started

**Headline:** Up and running in 60 seconds

**Steps:**

1. **Download** — Grab the latest release for your platform
2. **Open a vault** — Point to any folder with markdown files (or create a new one)
3. **Start writing** — Type `/http` to create your first executable block
4. **Run it** — Hit the play button and see the response inline

> **[GIF: getting-started]** GIF mostrando os 4 passos acima, fluxo completo.
> **Specs:** 1000x600px, dark mode, 12-15s

---

## Footer

**Links:**
- GitHub (source code)
- Releases (downloads)
- Documentation
- License (MIT)

**Badge area:**
- Stars count
- Latest release version
- License badge
- Platform badges (macOS, Windows, Linux)

**Tagline:** Built with Tauri, React, and Rust. Open source. Forever free.
