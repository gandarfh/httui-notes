# Epic 19 — TUI Vim Engine

Motor vim completo: modos, motions, operadores, text objects, registros, marks, search, ex commands, macros, e as regras de fronteira bloco/prose específicas do domínio.

**Depende de:** Epic 18 (Buffer & Rendering)
**Desbloqueia:** Epic 20 (Editor Shell), Epic 21 (Block Widgets)

Referência: [`docs/tui-design.md`](../tui-design.md) §6.

---

## Story 01: State machine de modos

Máquina de estados com todos os modos vim e operator-pending.

### Tasks

- [ ] `enum Mode { Normal, Insert, Visual(VisualKind), Replace, CommandLine, Search(SearchDir), OperatorPending(Operator) }`
- [ ] `enum VisualKind { Char, Line, Block }`
- [ ] `enum SearchDir { Forward, Backward }`
- [ ] Transições: `normal → insert` (i/a/...), `insert → normal` (Esc), `normal → visual` (v/V/^V), `normal → command` (:), etc.
- [ ] Historia de modo: `Mode::previous()` pra ações tipo `gv` (re-selecionar visual anterior)
- [ ] Cursor style + status bar label por modo
- [ ] Testes: cada transição produz estado correto, side effects esperados (cursor, status)

## Story 02: Parser de comandos

Interpretador que consome key events e identifica motion / operator / command completo.

### Tasks

- [ ] Buffer de input pendente (multi-key sequences: `gg`, `dd`, `ciw`)
- [ ] `parse_pending(buf: &[Key]) -> ParseResult`: `Complete(Action)`, `Incomplete`, `Invalid`
- [ ] Suporte a prefixo numérico: `5j`, `3dw`, `2ci"` (count stack)
- [ ] Suporte a seletor de registro: `"a`, `"A`, `"+`, `"_`
- [ ] Acumulação: `{count1}{op}{count2}{motion}` — count1 × count2 é o total
- [ ] Timeout configurável pra sequências (default: sem timeout, usuário decide)
- [ ] Cancel: `<Esc>` limpa buffer pendente
- [ ] Testes: cada combinação `count + op + count + motion` parsa corretamente

## Story 03: Motions horizontais e verticais

Implementar todas as motions básicas com e sem count.

### Tasks

- [ ] Horizontais: `h l`, `0 $ ^ g_`, `|` (goto column)
- [ ] Palavra: `w W b B e E ge gE` (respeitando word vs WORD — ASCII + unicode)
- [ ] Find/till: `f{ch} F{ch} t{ch} T{ch} ; ,`
- [ ] Verticais: `j k gj gk` (visual vs logical line)
- [ ] File-wide: `gg`, `G`, `{n}G`, `{n}gg`
- [ ] Scroll motions: `<C-u> <C-d> <C-f> <C-b> <C-e> <C-y>`
- [ ] Viewport: `H M L`, `zz zt zb`
- [ ] Parágrafo: `( ) { }` (sentence / paragraph)
- [ ] Matching bracket: `%` (pares `()`, `[]`, `{}`, `<>`)
- [ ] Cada motion funciona em prose E em campos de bloco (mesmo código, rope diferente)
- [ ] Testes: motion correto com count, em linha vazia, em fim de buffer, em unicode

## Story 04: Operadores

Operadores aplicados sobre motion ou text object.

### Tasks

- [ ] `d` (delete), `c` (change), `y` (yank), `>` (indent right), `<` (indent left), `=` (format — opcional MVP)
- [ ] `gu` (lowercase), `gU` (uppercase), `~` (toggle case), `g~` (toggle motion)
- [ ] `!` (filter — opcional MVP)
- [ ] Linewise shortcuts: `dd`, `cc`, `yy`, `>>`, `<<`, `==`, `guu`, `gUU`
- [ ] Position shortcuts: `D` (`d$`), `C` (`c$`), `Y` (yy por default, ou `y$` se configurado), `S` (`cc`), `s` (xi)
- [ ] Ao completar operação: atualiza registro unnamed + numbered (se delete/change) + último yank
- [ ] `.` grava a última ação completa pra repeat
- [ ] Testes: cada operador com cada motion básica (w, e, $, 0, etc.)

## Story 05: Text objects

Implementar os text objects padrão + custom do domínio.

### Tasks

- [ ] Palavra: `iw aw iW aW`
- [ ] String: `i" a" i' a' i\` a\``
- [ ] Brackets: `i( a( ib ab i[ a[ i{ a{ iB aB i< a<`
- [ ] Tag: `it at` (markdown: delimitadores inline)
- [ ] Parágrafo: `ip ap`; Sentence: `is as`
- [ ] **Custom domínio — ref:** `ir` (inside `{{...}}`) / `ar` (around, incluindo as chaves)
  - [ ] Funciona em prose e em campos de bloco
  - [ ] Detecção via regex `\{\{([^}]+)\}\}` contendo cursor
- [ ] **Custom domínio — campo:** `if` / `af` só válido em `InBlock`
  - [ ] `if` seleciona conteúdo inteiro do campo atual
  - [ ] `af` seleciona campo incluindo borda (útil com operator `d` pra limpar)
- [ ] Aninhamento: `ci"` dentro de string dentro de parens funciona
- [ ] Testes: cada text object com/sem whitespace, em strings aninhadas, em casos degenerados

## Story 06: Visual mode

Seleção visual nos 3 modos (char, line, block) com operações e motions.

### Tasks

- [ ] `v` entra char visual; `V` line visual; `<C-v>` block visual
- [ ] Motion em visual expande a seleção
- [ ] `o` / `O` em visual: troca extremos da seleção
- [ ] `gv` reentra no visual anterior
- [ ] Operadores em visual: `d c y > < = gu gU ~` aplicam sobre seleção
- [ ] `r{ch}` em visual: substitui cada char da seleção por `{ch}`
- [ ] `J` em visual: junta as linhas selecionadas
- [ ] Block visual: insert em todas as linhas com `I` (start) e `A` (end), ações específicas (`I{text}<Esc>`)
- [ ] Highlight visual renderizado com `bg` invertido
- [ ] Testes: seleção atravessando prose/bloco, operações em cada kind

## Story 07: Registros e clipboard

Todos os registros vim + integração com clipboard do sistema.

### Tasks

- [ ] Estrutura `Registers` com HashMap de registros nomeados
- [ ] Registros: `"`, `"a`–`"z`, `"A`–`"Z` (append), `"0`–`"9`, `"_`, `"*`, `"+`, `"/`, `"=`, `".`, `":`
- [ ] Yank atualiza `""`, `"0`, e destino se especificado
- [ ] Delete atualiza `""`, `"1` (com shift de `"1`→`"2`→...→`"9`)
- [ ] `p` / `P` leem do unnamed; `"{reg}p` do registro especificado
- [ ] Clipboard: `"*` e `"+` via `arboard` (read/write sincronos)
- [ ] Modo linewise vs characterwise preservado por registro
- [ ] Paste com modo correto: linewise paste abre nova linha; characterwise insere inline
- [ ] `:reg` lista todos os registros com preview
- [ ] `"=` expression: aritmética básica + string literal + concatenação (mínimo viável)
- [ ] Testes: yank + paste preserva tipo, registros numbered rotacionam corretamente

## Story 08: Marks e jump list

Marks locais/globais + pilha de jumps pra navegação.

### Tasks

- [ ] `m{a-z}` salva posição local no arquivo atual
- [ ] `m{A-Z}` salva posição global (arquivo + posição) — persistir em SQLite tabela `marks`
- [ ] `'{mark}` vai pra linha da mark; ``{mark}`` vai pra posição exata (linha + coluna)
- [ ] Marks especiais: `` ' ``/```` ` ```` (last jump), `` ^ `` (last insert), `` . `` (last change), `` [ ``/`` ] `` (last yank/change range)
- [ ] `:marks` lista todas
- [ ] Jump list: `<C-o>` back, `<C-i>` forward
- [ ] Eventos que geram jump: `gg G {n}G / ? n N % '{mark}`
- [ ] `:jumps` lista jumps recentes
- [ ] Jumps globais (cross-file) — abrem arquivo se necessário
- [ ] Testes: marks sobrevivem edição (ajuste de posição), globais persistem restart

## Story 09: Search (`/ ? n N * #`)

Busca forward/backward com incsearch, hlsearch e regex.

### Tasks

- [ ] `/pat` busca forward; `?pat` backward (abre minibuffer no status bar)
- [ ] `n` repete última busca na direção original; `N` direção reversa
- [ ] `*` busca word under cursor forward; `#` backward; `g*` / `g#` match parcial
- [ ] Regex via crate `regex` (sintaxe vim approximada — doc explicita subset)
- [ ] Flags: `\c` case-insensitive inline, `\C` case-sensitive inline
- [ ] `:set ignorecase` / `:set smartcase` aplicados
- [ ] `:set incsearch`: preview enquanto digita (highlight current match)
- [ ] `:set hlsearch`: todos os matches destacados até `:noh`
- [ ] Match em prose e em campos de bloco — cursor transiciona pra `InBlock` se match é em campo
- [ ] Wrap around (do fim volta pro início) com aviso no status bar
- [ ] Histórico de buscas (`/` seguido de `<Up>` cicla)
- [ ] Registro `"/` contém última busca
- [ ] Testes: busca simples, com regex, com unicode, atravessando blocos

## Story 10: Substituição (`:s`)

Ex command de substituição com flags e range.

### Tasks

- [ ] `:s/pat/rep/flags` na linha atual
- [ ] `:%s/pat/rep/flags` global
- [ ] `:{range}s/pat/rep/flags` com range (`'<,'>`, `1,5`, `.,+10`, etc.)
- [ ] Flags: `g` (todos na linha), `i` (case insensitive), `c` (confirm cada), `n` (só conta, não substitui)
- [ ] Substituição com backreferences: `\1`, `\2`, ...
- [ ] `&` em replacement = match inteiro
- [ ] Preview de substituição com `c` flag: mostra match, pede `y/n/a/q/l`
- [ ] `~` repete última replacement string
- [ ] Testes: com cada flag, com range, com backreferences

## Story 11: Ex command line

Parser e dispatch de comandos `:`.

### Tasks

- [ ] Minibuffer no status bar quando em modo `CommandLine`
- [ ] `<Tab>` autocomplete de comandos + argumentos (paths)
- [ ] `<Up>` / `<Down>` histórico de comandos
- [ ] `<C-c>` / `<Esc>` cancela; `<CR>` executa
- [ ] Comandos implementados:
  - [ ] `:w`, `:w!`, `:w {path}`
  - [ ] `:q`, `:q!`, `:wq`, `:x`
  - [ ] `:e {path}`, `:e`, `:e!`
  - [ ] `:split`, `:vsplit`, `:close`, `:only`
  - [ ] `:tabnew`, `:tabclose`, `:tabn`, `:tabp`
  - [ ] `:s/...`, `:%s/...`
  - [ ] `:noh`, `:set ...`, `:set?`
  - [ ] `:map`, `:nmap`, `:imap`, `:vmap`, `:nnoremap`, `:unmap`
  - [ ] `:reg`, `:marks`, `:jumps`
  - [ ] `:help {topic}`
  - [ ] Domínio: `:run`, `:run!`, `:env {name}`, `:conn {name}`, `:config edit`, `:config reload`
- [ ] Error handling: comando desconhecido → mensagem no status bar (vermelho)
- [ ] Testes: cada comando produz efeito esperado, histórico persiste

## Story 12: Macros (`q`, `@`)

Gravar e reproduzir sequências de comandos.

### Tasks

- [ ] `q{reg}` inicia gravação; `q` finaliza
- [ ] Sequência gravada como `Vec<KeyEvent>` no registro `{reg}`
- [ ] `@{reg}` reproduz; `@@` repete último
- [ ] `{n}@{reg}` repete `n` vezes
- [ ] Gravação atravessa fronteiras bloco/prose
- [ ] Feedback visual durante gravação: status bar mostra `recording @a`
- [ ] Testes: macro simples (deletar linha X vezes), macro com movimento vertical, macro com ex command

## Story 13: Dot repeat (`.`)

Repetir última ação modificadora.

### Tasks

- [ ] Stack da última ação completa (operator + motion + count + inserted text)
- [ ] `.` aplica novamente no cursor atual
- [ ] Conta sobrescreve: `5.` repete 5 vezes
- [ ] Funciona pra: `x`, `p`, `d{motion}`, `c{motion}`, `>`, `<`, `r`, inserts (`i`/`a`/`o`/`O` + texto + Esc)
- [ ] Não funciona pra: motions puros, search, visual selection
- [ ] Testes: `daw.` apaga 2 palavras, `ciw foo <Esc>.` troca palavras por "foo"

## Story 14: Fronteira bloco/prose

Lógica de transições entre prose e blocos durante motions e operações.

### Tasks

- [ ] Módulo `vim::boundary` com regras explícitas (ver §6.2 do design doc)
- [ ] `j` em fim de prose run → `BlockSelected` ou próximo prose
- [ ] `k` em início de prose run → `BlockSelected` ou prose acima
- [ ] `w` em prose antes de bloco → `BlockSelected`
- [ ] `}` / `{` tratam bloco como parágrafo
- [ ] `dd` em `BlockSelected` → remove `Segment::Block` inteiro
- [ ] `yy` em `BlockSelected` → serializa fence completa no registro linewise
- [ ] `p` com registro contendo fence → parseia e insere `Segment::Block` novo
- [ ] `p` com registro contendo texto puro em `BlockSelected` → insere prose abaixo
- [ ] `<CR>` / `i` / `a` em `BlockSelected` → `InBlock(primeiro campo)` + `Insert`
- [ ] `<Tab>` em `InBlock` → próximo campo
- [ ] `<S-Tab>` em `InBlock` → campo anterior
- [ ] `<Esc><Esc>` em `InBlock` → `BlockSelected`
- [ ] `Alt-j` / `Alt-k` em `BlockSelected` → reordena segmento
- [ ] `gd` em `{{ref}}` → pula pro bloco de origem (via alias lookup)
- [ ] Testes exaustivos por transição

## Story 15: Vim config (`~/.config/notes-tui/vim.toml`)

Load e persistência de opções e keymaps do vim.

### Tasks

- [ ] Struct `VimConfig` com `options` + `keymaps` por modo
- [ ] Opções suportadas: `number`, `relativenumber`, `ignorecase`, `smartcase`, `incsearch`, `hlsearch`, `wrap`, `scrolloff`, `tabstop`, `expandtab`
- [ ] `:set {opt}` / `:set no{opt}` / `:set {opt}={value}` em runtime
- [ ] `:set?` mostra todos os valores atuais
- [ ] `:map` / `:nmap` etc. registram mapping
- [ ] `:nunmap {lhs}` remove
- [ ] Persistência opcional via `:map!` (exclamação = salvar) ou `:w config`
- [ ] Keymaps resolvidos via lookup table com precedência (mapping > default)
- [ ] Testes: config carrega, muta, persiste corretamente

## Story 16: Help overlay (`:help`)

Sistema de ajuda acessível por `:help {topic}` ou `?` global.

### Tasks

- [ ] Conteúdo em markdown (arquivos de `docs/tui-help/`)
- [ ] Tópicos: `motions`, `operators`, `text-objects`, `registers`, `marks`, `ex-commands`, `blocks`, `environments`, `connections`, `config`, `keymaps`
- [ ] Overlay renderizado com `Paragraph` + scroll; fecha com `q` ou `<Esc>`
- [ ] `:help {topic}` abre tópico específico; `:help` abre index
- [ ] `?` global = `:help`
- [ ] Busca dentro do help via `/` (reusa a engine de busca)
- [ ] Links internos entre tópicos (ex: `:help motions` tem link pra `:help text-objects`)
- [ ] Auto-generated: parte do conteúdo (lista de comandos, keymaps) gerada do código pra garantir sincronia
- [ ] Testes: overlay abre, fecha, busca funciona, links navegam
