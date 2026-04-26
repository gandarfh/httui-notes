# Epic 22 — TUI Integrations

Conectar TUI ao ecossistema existente: connections CRUD, environments, keychain, sessão, file conflicts, co-existência com desktop no mesmo vault.

**Depende de:** Epic 17 (TUI Foundation), Epic 20 (Editor Shell)
**Desbloqueia:** —

Referência: [`docs/tui-design.md`](../tui-design.md) §9, §11.

---

## Story 01: Connections CRUD

Gerenciar conexões de banco via overlay, reusando a lógica do core.

### Tasks

- [ ] Overlay com lista de conexões (renderiza via reuso de `httui-core::db::connections::list`)
- [ ] Abertura: `<leader>dc` ou `:connections`
- [ ] Por conexão: name, slug, driver (postgres/mysql/sqlite), host, database, status (health check)
- [ ] Ações na lista: `a` adiciona, `e` edita, `d` deleta, `t` testa conexão
- [ ] Form de adicionar/editar: campos name/slug/driver/host/port/database/user/password
- [ ] Password armazenada via keychain (reusa `httui-core::db::keychain`) — input mascarado no form
- [ ] Test connection: executa `SELECT 1` (ou equivalente) e mostra resultado no status bar
- [ ] Health check background (30s): atualiza ícone na lista (verde/vermelho)
- [ ] `:conn {slug}` seta conexão default pros blocos DB novos
- [ ] Testes: CRUD persiste, keychain integrado, health check funciona

## Story 02: Environments manager

Gerenciar environments e variables via overlay.

### Tasks

- [ ] Overlay com lista de environments no lado esquerdo, key/value tables no direito
- [ ] Abertura: `<leader>em` ou `:environments`
- [ ] Ações na lista de envs: `a` nova, `r` rename, `d` delete (confirm), `D` duplicate
- [ ] Ao selecionar env: tabela de variáveis à direita
- [ ] Ações na tabela: `a` adicionar variable, `e` editar, `d` deletar, `s` toggle secret
- [ ] Secret toggle: muda `is_secret` flag e migra valor pro/do keychain (reusa core)
- [ ] Mostrar secret value mascarado (`****`) por default; `<Space>` em cima revela temporariamente
- [ ] `:env {name}` troca env ativa
- [ ] Indicador de env ativa: `●` ao lado do nome na lista
- [ ] Status bar sempre mostra env ativa
- [ ] Testes: CRUD envs + variables, secrets criptografados, active env persiste

## Story 03: Environment picker (status bar)

Trocar environment ativa via status bar ou keymap.

### Tasks

- [ ] Clique (mouse opcional) ou `<leader>ep` abre picker compacto
- [ ] Lista todas as envs, env ativa destacada
- [ ] `<CR>` seleciona; `<Esc>` cancela
- [ ] Mudança imediata: blocos com `{{KEY}}` re-resolvem na próxima execução
- [ ] Ex command `:env {name}` mesma coisa
- [ ] Testes: troca reflete em resolução de variáveis

## Story 04: Reuso do keychain

Garantir que TUI lê/escreve segredos via mesmo sistema do desktop.

### Tasks

- [ ] Confirmar que `httui-core::db::keychain` usa `keyring` crate (já usa)
- [ ] TUI ao salvar connection password ou env var com `is_secret=true` chama `store_secret`
- [ ] Sentinel `__KEYCHAIN__` em SQLite, real value via `get_secret`
- [ ] Fallback: se keychain indisponível (SSH sem DBus, servidor headless), warning no primeiro uso + plaintext
- [ ] Test unitário: roundtrip store/get, fallback gracioso

## Story 05: Session persistence (tabs, cursor, layout)

Restaurar sessão TUI ao reabrir, separada da sessão desktop.

### Tasks

- [ ] Nova tabela SQLite `tui_session_state` (migration nova):
  - [ ] `pane_layout` (JSON serializado do `PaneNode`)
  - [ ] `tabs_per_pane` (JSON: pane_id → list de `{path, cursor_line, cursor_col, scroll}`)
  - [ ] `sidebar_visible`, `sidebar_width`
  - [ ] `active_environment_id`
- [ ] No startup: se `tui_session_state` existe e vault path bate, restaura
- [ ] Save on change: debounce 1s após mudança de estado
- [ ] `restore_session` do core ganha parâmetro `Surface::Tui | Surface::Desktop` e retorna o slice relevante (refator de Epic 17 ou aqui)
- [ ] Cross-surface: desktop e TUI não brigam — cada um tem sua linha
- [ ] Tabs de diff (do chat) não persistem na TUI (transient) — mesmo comportamento do desktop
- [ ] Testes: sessão persiste, restauração correta, não conflita com desktop

## Story 06: File conflicts (watch + banner)

Detectar modificação externa e oferecer reload/keep mine.

### Tasks

- [ ] `notify` watcher por arquivo aberto (reusa `useFileConflicts` logic — extrair pro core se ainda não tá)
- [ ] Evento `FileChanged(path)` no event loop
- [ ] Se tab tem modificações não salvas: abre banner inline no topo do editor da pane
- [ ] Banner: `⚠ File changed on disk. [r]eload / [k]eep mine / [d]iff`
- [ ] `r` re-lê do disco, descarta edições locais (confirm)
- [ ] `k` mantém versão local (auto-save suprimido até salvar manualmente)
- [ ] `d` abre diff viewer (opcional MVP — pode reusar lógica do chat diff)
- [ ] Durante conflito: auto-save suspenso
- [ ] Indicador na file tree: arquivo conflitado ganha `⚠`
- [ ] Testes: detecção, banner aparece/desaparece, ações produzem estado esperado

## Story 07: Cache de resultados compartilhado

Garantir que TUI lê/escreve o mesmo cache de bloco que o desktop.

### Tasks

- [ ] Tabela `block_results` (já existe) consumida pelo TUI via core
- [ ] Hash SHA-256 do conteúdo serializado (mesmo algoritmo do desktop)
- [ ] Na abertura de um doc: para cada bloco, buscar por (file_path, block_hash)
- [ ] Se hit: `cached_result` populado, badge `cached`, display mode `split`
- [ ] Se miss: `Idle`
- [ ] Após execução sucesso: `save_block_result` persiste no mesmo lugar
- [ ] Teste cross-surface: desktop executa bloco, fecha, TUI abre mesmo doc, vê cached

## Story 08: Wikilinks resolution

Resolver `[[target]]` em prose e em campos (pra pulos `gd`).

### Tasks

- [ ] Reuso da lógica do core que já resolve wikilinks (case-insensitive stem match)
- [ ] Render no prose: `[[target]]` com cor destacada (link color)
- [ ] Motion `gd` em cima de um wikilink: abre arquivo alvo na mesma pane (ou nova tab com `<C-t>`)
- [ ] Se target não existe: notification "No matching note" + opção `<leader>na` pra criar
- [ ] Autocomplete ao digitar `[[` em prose: lista de notes do vault
- [ ] Sintaxe `[[target|label]]` suportada (exibe `label`, pula pro `target`)
- [ ] Testes: resolução correta, ambiguidade (mesmo stem em pastas diferentes) mostra picker

## Story 09: SQLite locking e WAL

Garantir co-existência simultânea desktop + TUI no mesmo vault.

### Tasks

- [ ] Confirmar que SQLite tá em WAL mode (já tá — `PRAGMA journal_mode = WAL`)
- [ ] Testar abertura concorrente: desktop + TUI no mesmo vault simultaneamente
- [ ] Pool de conexões da TUI compatível com pool do desktop
- [ ] Writes concorrentes serializados (SQLite cuida) — sem corrupção
- [ ] Teste: script que roda ambos, faz CRUD em envs e connections, valida consistência
- [ ] Documentar limitação: UI de ambos não sincroniza em tempo real (precisa reabrir panel pra ver mudança do outro)

## Story 10: Tracing e logs

Logging estruturado pra debug sem poluir o terminal.

### Tasks

- [ ] `tracing` + `tracing-subscriber` + `tracing-appender`
- [ ] Logs em `$XDG_STATE_HOME/notes-tui/logs/notes-tui.log` (rotating diário)
- [ ] Níveis: `trace`/`debug`/`info`/`warn`/`error`
- [ ] Flag CLI `--log-level` override
- [ ] Spans por operação: `block_execute`, `vault_load`, `session_save`, etc.
- [ ] Não logar valores sensíveis (passwords, secrets — grep de regex pra garantir)
- [ ] Panic hook: logga stack trace antes de restaurar terminal
- [ ] `:logs` ex command abre log file em nova tab
- [ ] Testes: formato correto, rotação funciona, secrets não aparecem
