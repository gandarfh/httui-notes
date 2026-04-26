# TUI — Notes Terminal

Status: Spec · Author: product
Escopo: versão terminal (TUI) do Notes, reutilizando o core Rust existente.
Relacionado: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`db-block-redesign.md`](./db-block-redesign.md), [`SPEC.md`](./SPEC.md)

Este doc descreve **tudo** que precisa existir pra um binário `notes-tui` rodar com paridade funcional (dentro do escopo declarado) com o desktop. Sem fases — o que está aqui é o escopo total. O backlog (épicos 17–23) organiza o trabalho por área, mas nenhum épico é "opcional".

---

## 1. Problema

Muito do público-alvo do Notes (devs de backend, DBAs, quem vive no terminal) prefere editar em TTY: menor latência percebida, keyboard-first, roda em servidor remoto via SSH, combina com `tmux`/`zellij`. Hoje o Notes só existe como app desktop Tauri.

Além disso, a migração pra CodeMirror 6 no desktop tem 3 problemas arquiteturais em aberto — todos decorrentes de widgets vivendo dentro do `contentEditable` do CM6:

1. Isolamento de eventos entre widget e editor externo (scroll, focus, vim).
2. Navegação vertical que pula blocos por causa de `atomicRanges` + linhas com `height:0`.
3. Reordenação de blocos sem mecanismo natural de keyboard.

Na TUI **essa classe inteira de bugs não existe**: não há `contentEditable`, não há DOM compartilhado entre host e widget, o event loop é nosso. O modelo mental que vocês quiseram pro CM6 desde o começo (buffer de texto + widgets isolados) é o que a TUI entrega por padrão.

## 2. Objetivo

Entregar um binário `notes-tui` que:

- Abre um vault (mesmo diretório que o desktop usa) e edita `.md` com markdown nativo.
- Renderiza blocos `http`, `db-*` e `e2e` **inline** no editor, com UI equivalente ao desktop (input fields, tabs, output tables, status badges).
- Oferece motor **vim completo** — paridade com o que `@replit/codemirror-vim` dá hoje no CM6, mais extensões específicas do domínio (text object `ir`/`ar` pra `{{refs}}`).
- Executa blocos usando os mesmos executores Rust do desktop (reuso direto de `src-tauri/src/executor/`).
- Compartilha SQLite, keychain, connections, environments e cache com o desktop — os dois podem rodar sobre o mesmo vault.

## 3. Não-objetivos (escopo fora)

- **Chat com Claude Agent SDK.** Tecnicamente possível (sidecar é headless), mas a UX de streaming, permission banners e diff viewer em terminal é trabalho suficiente pra epic próprio. Fica fora desse ciclo.
- **Renderização visual de Mermaid e KaTeX.** Fallback: mostra o código fonte com highlight. Pode virar "abre no desktop" ou export pra arquivo.
- **Preview de respostas binárias (imagens, PDF, vídeo, áudio).** Mostra metadata (content-type, tamanho) + ação "abrir externamente". Terminais com protocolo Kitty/iTerm image podem ganhar suporte depois.
- **Drag-and-drop.** Tudo via teclado e ex commands.
- **Plugin system além dos 3 tipos de bloco.** Mesma regra do desktop: novos tipos adicionam vertical slice no core.
- **Auto-update do binário.** Distribuição via package managers (brew, cargo install, .deb/.rpm) — update é responsabilidade do gerenciador.

## 4. Arquitetura

### 4.1 Layout de crates

Hoje o workspace tem `src-tauri/` (app desktop) e `crates/httui-mcp/` (servidor MCP). A TUI exige extrair o core como crate de biblioteca consumida pelos três binários.

```
crates/
├── httui-core/           ← NOVO: biblioteca compartilhada
│   ├── executor/         (http, db, e2e)
│   ├── db/               (sqlite, migrations, keychain)
│   ├── blocks/           (parser, serializer, fence info)
│   ├── references/       (resolução de {{}})
│   ├── environments/
│   ├── connections/
│   └── session/          (restore, persistence, conflicts)
├── httui-desktop/        ← renomeado de src-tauri, consome httui-core
├── httui-tui/            ← NOVO: binário notes-tui
└── httui-mcp/            ← existente, passa a consumir httui-core
```

Extrair `httui-core` é a primeira tarefa. Desktop continua funcionando idêntico (thin wrapper). MCP passa a consumir o core em vez de duplicar lógica.

### 4.2 Stack TUI

- **ratatui** — render loop, widgets primitivos (Block, Paragraph, Table, List, Tabs).
- **crossterm** — input, cores 24-bit, raw mode, alt screen, resize events.
- **ropey** — rope do buffer (mesmo que Helix/Zed usam).
- **tree-sitter** + **tree-sitter-markdown** — highlight do prose no documento.
- **syntect** — highlight de SQL/JSON dentro dos campos de bloco.
- **arboard** — clipboard do sistema (registros `"*` e `"+` do vim).
- **tokio** — já usado pelo core pra async.
- **directories-next** — paths XDG pro config.
- **tui-tree-widget** — árvore de arquivos.
- **insta** — snapshot testing do render.

## 5. Buffer model

### 5.1 Estrutura

Buffer **não é rope único**. É uma sequência tipada de segmentos. Isso é a decisão que evita os 3 bugs do CM6.

```rust
pub enum Segment {
    Prose(Rope),
    Block(BlockNode),
}

pub struct BlockNode {
    pub id: BlockId,              // estável enquanto o bloco existir em memória
    pub block_type: BlockType,    // Http / DbPostgres / DbMysql / DbSqlite / E2e
    pub fence_info: String,       // raw info string pra roundtrip determinístico
    pub fields: IndexMap<FieldId, Rope>,
    pub state: ExecutionState,
    pub cached_result: Option<BlockResult>,
}

pub enum ExecutionState {
    Idle, Cached, Running, Success, Error(String),
}

pub struct Document {
    pub segments: Vec<Segment>,
    pub cursor: Cursor,
    pub undo: Vec<Edit>,
    pub redo: Vec<Edit>,
    pub marks: HashMap<char, Position>,
    pub dirty: bool,
}

pub enum Cursor {
    InProse { segment_idx: usize, offset: usize },
    BlockSelected { segment_idx: usize },
    InBlock { segment_idx: usize, field_id: FieldId, offset: usize },
}
```

### 5.2 Parse / serialize

- **Load:** lê `.md` → tokeniza → cada fence `http|db-*|e2e` vira `BlockNode`, o resto vira `Prose(Rope)`.
- **Save:** walk `segments`, emite prose bruto e re-emite a fence canônica de cada bloco (formato já definido em [`db-block-redesign.md`](./db-block-redesign.md) pro DB; HTTP e E2E seguem o mesmo espírito: info string com `key=value`, corpo é o conteúdo relevante).
- Parser vive em `httui-core::blocks` e é usado pelo desktop também. Refator conjunto com a migração CM6.

### 5.3 IDs estáveis

- `BlockId` (u64 incremental) gerado no load, persiste enquanto o bloco existir em memória.
- Não persiste em disco — o bloco se identifica pelo hash do conteúdo pra cache, que já funciona assim hoje.
- Usado pra routing de eventos streaming (`ExecutionEvent { block_id, ... }`) e pra pontuar cursores e marks estáveis durante edição.

## 6. Motor vim

### 6.1 Escopo

Alvo: paridade com `@replit/codemirror-vim` + extensões de domínio.

**Modos**
- `Normal`, `Insert`, `Visual` (char, line, block), `Command-line` (`:`), `Search` (`/`, `?`), `Replace` (`R`).
- `Operator-pending` após `d`/`c`/`y`/`>`/`<`/`=`/`gu`/`gU`/`~`.

**Motions**
- Horizontais: `h l`, `0 $ ^ g_`, `w W b B e E ge gE`.
- Find/till: `f F t T ; ,`.
- Verticais: `j k gj gk`, `gg G {n}G`, `H M L`, `<C-u> <C-d> <C-f> <C-b>`.
- Parágrafo/bloco: `( ) { }`.
- Matching: `%`.
- Search: `/pat`, `?pat`, `n N`, `* #`, `g* g#`.

**Operadores**
- Simples: `d c y > < = ! gu gU ~`.
- Linewise: `dd cc yy >> << ==`.
- Shortcuts: `D C Y S s X`.

**Text objects**
- Palavra: `iw aw iW aW`.
- String: `i" a" i' a' i\` a\``.
- Brackets: `i( a( ib ab i[ a[ i{ a{ iB aB i< a<`.
- Tag: `it at`.
- Parágrafo: `ip ap`. Sentence: `is as`.
- **Domínio — referências:** `ir` (inside ref) / `ar` (around ref) operam em `{{...}}`.
- **Domínio — campo de bloco:** `if` / `af` operam no campo focado atual (só válido em `InBlock`).

**Ações diretas**
- Entrar em insert: `i a I A o O s S C`.
- Deletar: `x X D`.
- Substituir: `r R`.
- Paste: `p P gp gP`.
- Juntar: `J gJ`.
- Undo/redo: `u <C-r>`.
- Repeat: `.`.

**Registros**
- Nomeados: `"a`–`"z`, `"A`–`"Z`.
- Numéricos: `"0`–`"9`.
- Unnamed: `""`, black hole: `"_`.
- Clipboard do sistema: `"*` e `"+` via `arboard`.
- Expression: `"=` (básico — aritmética e concatenação de strings).
- Search: `"/`.

**Marks**
- Locais: `m{a-z}`, acessados com `'{mark}` e ``{mark}``.
- Globais: `m{A-Z}`, persistidos em SQLite (tabela nova `marks`).
- Jump list: `<C-o> <C-i>`.

**Ex commands**
- Arquivo: `:w`, `:q`, `:wq`, `:x`, `:q!`, `:w!`, `:e {path}`, `:e`.
- Opções: `:set nu`, `:set rnu`, `:set ic`, `:set smartcase`, `:set incsearch`, `:set hlsearch`, `:noh`, `:set wrap`.
- Panes/tabs: `:split`, `:vsplit`, `:close`, `:only`, `:tabnew`, `:tabclose`, `:tabn`, `:tabp`.
- Search/replace: `:s/pat/rep/flags`, `:%s/...`, `:{range}s/...`.
- Introspection: `:reg`, `:marks`, `:jumps`, `:set?`, `:map`.
- Mapeamento: `:nmap`, `:imap`, `:vmap`, `:nnoremap` etc. Persistem em `~/.config/notes-tui/vim.toml`.
- Domínio: `:run` (executa bloco selecionado), `:env {name}` (troca env ativa), `:conn {name}` (troca conexão default), `:help {topic}` (overlay de ajuda).

**Macros**
- `q{reg} ... q` grava; `@{reg}` executa; `@@` repete último. Com contador (`5@a`).

**Contadores**
- `{n}` prefixo em quase tudo: `5j`, `3dw`, `2ci"`, `10p`.

**Search avançado**
- `incsearch` (preview conforme digita), `hlsearch` (highlight persistente até `:noh`).
- Regex via crate `regex`.
- Flags: `i c g` em `:s`.

### 6.2 Fronteira bloco / prose

Onde vim encontra o modelo de segmentos. Regras explícitas:

| Situação                                             | Comportamento                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `j` em `InProse` na última linha de um prose run     | → `BlockSelected(next_block)` ou próximo prose run                            |
| `k` em `InProse` na primeira linha                   | → `BlockSelected(prev_block)` ou prose acima                                  |
| `j` em `BlockSelected`                               | → `InProse(next_prose)` no offset 0, ou `BlockSelected(next_block)`           |
| `<CR>` / `i` em `BlockSelected`                      | → `InBlock` no primeiro campo, modo `Insert` no fim do campo                  |
| `<Tab>` em `InBlock`                                 | cicla pro próximo campo do bloco                                              |
| `<Esc>` em `InBlock::Insert`                         | vai pra `InBlock::Normal` (vim do campo)                                      |
| `<Esc>` em `InBlock::Normal`                         | volta a `BlockSelected`                                                       |
| `dd` em `BlockSelected`                              | remove o `Segment::Block` inteiro (yank no registro linewise)                 |
| `yy` em `BlockSelected`                              | copia o bloco serializado (fence completo) pro registro                       |
| `p` com registro contendo bloco serializado          | insere novo `Segment::Block` parsado do conteúdo                              |
| `p` com registro contendo texto em `BlockSelected`   | insere prose run abaixo do bloco                                              |
| `w` / `b` em prose atravessando posição de bloco     | trata bloco como uma única "palavra"                                          |
| `}` em prose                                         | pula pro próximo parágrafo ou bloco                                           |
| `/{pat}` encontra match dentro de campo de bloco     | muda cursor pra `InBlock { field, offset }` do match                          |
| `Alt-j` / `Alt-k` em `BlockSelected`                 | move o bloco pra baixo/cima na sequência de segmentos (reordenação)           |
| `gd` em `{{ref}}` no prose ou campo                  | pula pro bloco de origem da ref (ou erro se não encontrar)                    |

Todas essas regras vivem num módulo `vim::boundary` testável isoladamente.

### 6.3 Vim dentro dos campos

Mesma máquina de estados, mesmo parser de comandos — só o buffer muda (rope do campo em vez da prose run). Saídas do campo são capturadas pelo roteador:

- Motion que sairia do campo (tipo `j` na última linha) aciona `on_field_exit` que decide: cicla campo, volta pro prose, ou no-op (campo single-line como URL).
- Ex commands rodam no contexto global (`:w` salva o arquivo, não o campo).
- Macros gravadas em campo podem tocar prose — estado de cursor registrado permite replay cruzando fronteiras.

### 6.4 Configuração

Arquivo TOML em `$XDG_CONFIG_HOME/notes-tui/vim.toml`:

```toml
[options]
number = true
relativenumber = false
ignorecase = true
smartcase = true
incsearch = true
hlsearch = true
wrap = false
scrolloff = 3

[keymaps.normal]
"<space>ff" = ":e "
"<space>fg" = "/"
"<leader>bd" = ":close"
"<leader>r"  = ":run"

[keymaps.insert]
"jk" = "<Esc>"

[keymaps.visual]
"<"  = "<gv"
">"  = ">gv"
```

`:set` e `:map` em runtime persistem no arquivo (opcionalmente, via `:w` explícito — defaults são imutáveis durante sessão).

## 7. Render

### 7.1 Layout raiz

```
┌─────────────┬──────────────────────────────────────────────────────┐
│ FILES   +   │ teste   api-usage-stats ✕   README                   │
│             ├──────────────────────────────────────────────────────┤
│ ▾ analytics │                                                      │
│  ● api...   │  # API Usage Stats                                   │
│ ▸ books     │                                                      │
│ ▾ docs      │  Relatório dos últimos 30 dias.                      │
│  ...        │                                                      │
│             │  ┌─ DB  db1  [split] cached [▶] [✕] ────────────┐    │
│             │  │ SELECT * FROM responses                      │    │
│             │  │ ──────────────                               │    │
│             │  │ id  created_at          status      sync     │    │
│             │  │ 1   2025-09-10 11:37   405 Method   0        │    │
│             │  │ 2   2025-09-10 11:37   400 Bad Req  0        │    │
│             │  │ 80 rows                        [Load more]  │    │
│             │  └────────────────────────────────────────────┘    │
│             │                                                      │
│ CONNS   +   │                                                      │
│  ◉ Notes    │                                                      │
├─────────────┴──────────────────────────────────────────────────────┤
│ NOR  local  main ·●  Ln 12 Col 1  UTF-8  md   :split  ^P buscar     │
└────────────────────────────────────────────────────────────────────┘
```

### 7.2 Render pipeline

A cada frame (throttled em 60 fps ou evento):

1. Compute layout: sidebar width, tab bar height, status bar height → área do editor.
2. Walk `Document.segments`, para cada:
   - `Prose`: renderiza rope linha a linha com highlight tree-sitter-markdown. Wrap configurável.
   - `Block`: aloca altura baseada em `display_mode` + conteúdo; renderiza border + corpo.
3. Mapeia `Cursor` → posição absoluta na tela (linha, coluna).
4. Desenha cursor (block cursor em normal, bar em insert, underline em replace).
5. Desenha overlays (quick open, command palette, confirm dialogs) por último.

Reflow é natural: se bloco cresce (ex: adicionou header), altura é recalculada e tudo abaixo desce. Scroll do viewport acompanha o cursor via `scrolloff`.

### 7.3 Widget: HTTP block

```
┌─ HTTP  req1  [split] 200 OK 312ms 4.2kB [▶] [✕] ───────────────┐
│ [GET ▾] https://api.example.com/v1/{{user_id}}/responses        │
│                                                                 │
│ Params  Headers  Body  Settings                                 │
│ ──────                                                          │
│ key           value                                             │
│ limit         100                                               │
│ offset        {{offset.response.next}}                          │
│ +                                                               │
├─────────────────────────────────────────────────────────────────┤
│ Request                   │ Response                            │
│ GET /v1/abc/responses     │ {                                   │
│ Authorization: Bearer *** │   "results": [...],                 │
│                           │   "next": "cursor_xyz"              │
│                           │ }                                   │
│                           │                                     │
│                           │ ▸ Headers (8)                       │
└─────────────────────────────────────────────────────────────────┘
```

- Method badge colorido (GET verde, POST azul, PUT laranja, PATCH amarelo, DELETE vermelho, HEAD roxo, OPTIONS cinza).
- URL é um campo single-line com highlight de `{{ref}}` em magenta. Hover (cursor em cima) → status bar mostra valor resolvido.
- Tabs: `<C-Tab>` / `<C-S-Tab>` cicla; clique direto via mouse (opcional).
- Response body com syntect por content-type (JSON, HTML/XML, plain).
- Status badge com cor granular (2xx verde, 3xx azul, 4xx amarelo, 5xx vermelho).
- Binary: mostra metadata + ação `o` (open external) ou `s` (save to disk).

### 7.4 Widget: DB block

```
┌─ DB  db1  [prod] [split] cached [▶] [✕] ───────────────────────┐
│ SELECT *                                                        │
│ FROM responses                                                  │
│ WHERE id > {{offset.response.last_id}}                          │
├─────────────────────────────────────────────────────────────────┤
│ id  created_at              status            sync              │
│ 1   2025-09-10 11:37:36     405 Method Not    0                 │
│ 2   2025-09-10 11:37:50     400 Bad Request   0                 │
│ ...                                                             │
│                                                                 │
│ 80 rows fetched                              [Load more]        │
└─────────────────────────────────────────────────────────────────┘
```

- SQL editor multi-linha com syntect SQL highlight + autocomplete de schema (reuso de `schema_cache`).
- Connection slug na header (`[prod]`) — clique / `<leader>dp` abre picker.
- Tabela de resultado: `ratatui::Table` com scroll horizontal (`zh`/`zl` como em vim), seleção de linha com `<CR>` expande linha em drawer lateral pra valores longos (JSON, texto grande).
- Streaming: pré-stage 3 já entrega eventos incrementais — cada `Row` chega pelo channel, tabela cresce; `Stats` finaliza "N rows fetched".
- Cancel: `<C-c>` em running cancela no backend.

### 7.5 Widget: E2E block

```
┌─ E2E  smoke  [split] 2/3 ✓ [▶] [✕] ─────────────────────────────┐
│ base: https://api.example.com                                   │
│                                                                 │
│ ▾ 1. Login         POST /auth/login        ✓ 142ms              │
│     ✓ status 200                                                │
│     extract token → $.data.token                                │
│ ▸ 2. Fetch user    GET  /users/me          ✓  78ms              │
│ ▾ 3. Delete user   DELETE /users/me        ✕ 401                │
│     ✕ status 204 (got 401)                                      │
│     response: { "error": "invalid token" }                      │
│ [+ step]                                                        │
└─────────────────────────────────────────────────────────────────┘
```

- Fold/unfold por step: `za` (toggle), `zR` (abrir todos), `zM` (fechar todos) — keybindings vim padrão.
- Reordenar step: `Alt-j` / `Alt-k` quando step card tá selecionado.
- Output por step compartilha o renderer do HTTP response.

### 7.6 Streaming

Backend emite `ExecutionEvent` via `tokio::sync::mpsc::UnboundedSender`. Loop do TUI consome no `tick`:

```rust
enum AppEvent {
    Input(KeyEvent),
    Resize(u16, u16),
    Tick,
    BlockEvent { block_id: BlockId, event: ExecutionEvent },
    FileChanged(PathBuf),
}
```

Cada `BlockEvent` atualiza o `BlockNode` correspondente e dispara redraw. Sem `await` no loop principal — tudo async roda em background e reporta via channel.

## 8. Editor shell

### 8.1 File tree
- Pane esquerda com `tui-tree-widget`.
- `<C-b>` toggle sidebar.
- Motions: `j k` navegar, `h` colapsa, `l` expande, `o`/`<CR>` abre.
- Criar: `a` arquivo, `A` pasta (prompt inline).
- Rename: `r`; Delete: `d` com confirmação.

### 8.2 Tabs
- Bar no topo, cada tab com path relativo e indicador de dirty.
- `<C-Tab>` / `<C-S-Tab>` cicla. `gt` / `gT` também.
- `:tabnew {path}`, `:tabclose`.

### 8.3 Splits
- `:split` / `:vsplit` como vim. `<C-w>v`, `<C-w>s`.
- Navegação: `<C-w>h/j/k/l`.
- Resize: `<C-w>>` `<C-w><`.
- Zoom: `<C-w>_` `<C-w>|`.

### 8.4 Quick open / FTS
- `<C-p>`: fuzzy search por nome de arquivo (reusa `search_files` do core).
- `<leader>fg` ou `<C-S-f>`: FTS conteúdo (reusa `search_content`).
- Overlay centralizado com input + lista + preview inline (10 linhas do arquivo com highlight no match).

### 8.5 Status bar
Da esquerda pra direita:
- Modo vim (`NOR` / `INS` / `VIS` / `VLINE` / `VBLOCK` / `REPLACE` / `CMD`).
- Environment ativa (`local`, `prod`).
- Conexão DB default (se houver).
- Indicador dirty (`·●`).
- Posição cursor (`Ln Col`).
- Encoding, file type.
- Hints contextuais (last command ou which-key preview).

## 9. Integrações

### 9.1 Connections
- Pane lateral dedicada (abaixo da file tree ou como tab no sidebar).
- CRUD via overlay: `<leader>dc` cria, `<leader>de` edita, `<leader>dd` deleta (confirma).
- Passwords via keychain (core reusado, zero trabalho).
- Health check: ícone verde/vermelho por conexão.

### 9.2 Environments
- Picker no status bar — clique (ou `<leader>ep`) abre lista.
- Gerenciador: `<leader>em` abre overlay com lista de envs + key-value table.
- Secret toggle: `<leader>ek` em cima da linha mostra/esconde valor, clique em ícone de cadeado alterna `is_secret`.
- `:env {name}` via ex command.

### 9.3 Keychain
Reuso integral de `core::db::keychain`. Sem mudanças.

### 9.4 Cache de blocos
- Hash SHA-256 do conteúdo serializado (mesmo algoritmo do desktop → cross-compatível).
- Hit/miss idêntico: core já expõe `get_block_result` / `save_block_result`.

### 9.5 Sessão
- Persistência TUI-específica: tabs abertas, cursor por tab, sidebar visible, env ativa, layout de splits.
- Tabela `tui_session_state` (nova, não conflita com `session_state` do desktop).
- `restore_session` do core recebe flag `Surface::Tui | Surface::Desktop` e retorna o slice relevante.

### 9.6 Conflitos de arquivo
- Watcher em background (`notify` crate) detecta modificação externa (desktop editando o mesmo `.md`, `git checkout`, etc.).
- Notifica via `FileChanged` no event loop.
- Banner inline: "File changed on disk. [r]eload / [k]eep mine".
- Durante conflito, auto-save suspenso (mesma semântica do desktop).

### 9.7 Co-existência com desktop
- Ambos operam sobre o mesmo vault e a mesma `notes.db`.
- SQLite em WAL mode (já configurado) permite leitura/escrita concorrente.
- Cache de bloco compartilhado: TUI roda um bloco → desktop vê cached na próxima vez (e vice-versa).

## 10. Execução de blocos

- `<leader>r` ou `:run` em `BlockSelected` dispara execução.
- `<leader>R` ou `:run!` ignora cache.
- Core resolve dependências (reuso direto de `resolve_dependencies`).
- Durante execução: badge `running`, ações limitadas (`<C-c>` cancela, motion de navegação ok).
- Resultado: atualiza estado + cache + redraw.

## 11. Config

### 11.1 Arquivos
- `$XDG_CONFIG_HOME/notes-tui/config.toml` — opções gerais.
- `$XDG_CONFIG_HOME/notes-tui/vim.toml` — opções vim + keymaps.
- `$XDG_CONFIG_HOME/notes-tui/theme.toml` — cores custom (opcional).

### 11.2 Esquema

```toml
# config.toml
vault_path = "~/notes"
theme = "auto"              # dark | light | auto
sidebar_default_visible = true
sidebar_width = 28
auto_save_debounce_ms = 1000
mouse_enabled = false

[ui]
show_line_numbers = true
show_relative_numbers = false
font_features = true        # ligatures se o terminal suportar

[blocks]
default_display_mode = "split"  # input | output | split
auto_run_on_cached_miss = false

[chat]
enabled = false              # reservado pro futuro
```

### 11.3 Edição
- `:config edit` abre o arquivo no próprio editor (tab nova).
- `:config reload` força re-leitura sem restart.

## 12. Testes

- **Unit:** buffer model (inserts, deletes atravessando fronteira, undo/redo), motion semantics (cada motion em isolation), parser/serializer roundtrip.
- **Vim conformance:** suíte de casos "input sequence → final state" inspirada em `@replit/codemirror-vim`. Cobre cada modo, operador, text object.
- **Integration:** harness que inicia o app com mock de vault temporário, envia sequência de keys via channel, valida state.
- **Snapshot:** render capturado via buffer virtual do ratatui, comparado via `insta` — detecta regressões visuais.
- **Cross-surface:** teste que abre o mesmo vault no core como se fosse desktop + TUI simultaneamente, escreve em um, valida detecção no outro.
- **Executor reuse:** existente (desktop já tem), continua valendo pra TUI.

## 13. Distribuição

- Binário único `notes-tui`, cross-compile Linux / macOS (x86_64, aarch64) / Windows.
- Cargo install: `cargo install httui-tui`.
- Homebrew tap: formula `notes-tui`.
- Debian/RPM: packaging via `cargo-deb` / `cargo-generate-rpm`.
- CI: GitHub Actions com matrix de targets.
- Versionamento: **mesmo ciclo do desktop** (v0.x.y). Lock de protocolo entre TUI e desktop pra mesma major garante compat de cache/sessão.

## 14. Documentação

- `README.md` ganha seção "Terminal version" com install + primeiros passos.
- `docs/tui-getting-started.md` — tutorial guiado (abrir vault, criar bloco, executar, configurar).
- `docs/tui-keybindings.md` — referência completa (auto-gerada do código onde possível).
- `docs/tui-vim-cheatsheet.md` — só o que a TUI suporta, pra não prometer demais.
- Help overlay in-app (`:help` ou `?`) serve conteúdo dessas páginas renderizado em tela.

## 15. Riscos e decisões em aberto

- **Performance com documentos grandes (>1MB):** tree-sitter + rope deve aguentar, mas precisa benchmark. Mitigação: parse incremental + virtualização de viewport (já é natural no terminal — só renderiza linhas visíveis).
- **Terminais antigos sem truecolor:** fallback pra 256 colors via `crossterm`. Testar em Windows Terminal, iTerm2, Alacritty, Kitty, Wezterm, tmux dentro de cada um.
- **Mouse:** desabilitado por default. Habilitado opt-in via config. Conflita com seleção nativa do terminal — documentar.
- **SSH + tmux latency:** acceitável se backend (core) roda remoto junto. Documentar cenário.
- **Reuso de schema_cache:** quando executor DB roda via TUI e popula schema, desktop ganha o cache de graça. Isso é a feature, mas vale um teste explícito.
- **Help overlay sobreposto:** decisão de design — modal full-screen ou side panel? Ambos funcionam; MVP opta por modal (mais simples).

## 16. Resumo do escopo total

1. **Foundation** — extrair `httui-core`, scaffold do binário, event loop, config.
2. **Buffer & Rendering** — block tree, parser reuso, prose highlight, widget reflow.
3. **Vim Engine** — modos, motions, operadores, text objects, registros, marks, ex, macros, fronteiras bloco/prose.
4. **Editor Shell** — file tree, tabs, splits, quick open, FTS, status bar.
5. **Block Widgets** — HTTP, DB, E2E com input/output/split, streaming, cancel, autocomplete.
6. **Integrations** — connections, environments, keychain, cache, sessão, conflitos.
7. **Polish & Distribution** — temas, help overlay, customização, cross-platform, CI, packaging, docs.

Detalhamento por épico no backlog (`docs/backlog/17-*.md` a `23-*.md`).
