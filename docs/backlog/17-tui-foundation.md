# Epic 17 — TUI Foundation

Fundação do binário `notes-tui`: extrair `httui-core` como crate de biblioteca, montar o scaffold do binário com ratatui/crossterm, event loop, config loading e terminal lifecycle.

**Depende de:** Epic 00 (Project Setup), Epic 06 (DB Blocks), Epic 07 (HTTP Client), Epic 08 (E2E Runner)
**Desbloqueia:** Epic 18 (Buffer & Rendering), Epic 19 (Vim Engine), Epic 22 (Integrations)

Referência: [`docs/tui-design.md`](../tui-design.md) §4 (arquitetura), §11 (config), §13 (distribuição).

---

## Story 01: Extrair `httui-core` como crate de biblioteca

Mover toda a lógica de domínio do `src-tauri/src/` para uma crate compartilhada `crates/httui-core/`, consumida pelos três binários (desktop, TUI, MCP).

### Tasks

- [ ] Criar `crates/httui-core/` com `Cargo.toml` de library crate
- [ ] Mover `src-tauri/src/executor/` → `crates/httui-core/src/executor/`
- [ ] Mover `src-tauri/src/db/` → `crates/httui-core/src/db/` (SQLite, migrations, keychain, connections, environments, schema_cache)
- [ ] Mover `src-tauri/src/blocks/` → `crates/httui-core/src/blocks/` (parser, serializer, fence info)
- [ ] Mover módulos de references, environments, session → `crates/httui-core/src/`
- [ ] Atualizar `src-tauri/Cargo.toml` pra consumir `httui-core` como dependency
- [ ] Atualizar `crates/httui-mcp/Cargo.toml` pra consumir `httui-core` (elimina duplicação)
- [ ] Renomear `src-tauri/` → `crates/httui-desktop/` pra alinhar com o workspace
- [ ] Ajustar `Cargo.toml` root (workspace members)
- [ ] Ajustar `tauri.conf.json`, `Makefile`, scripts de build pros novos paths
- [ ] Rodar `cargo build` + `cargo test` no workspace inteiro — zero regressão no desktop
- [ ] Rodar app desktop em dev mode pra validar que tudo continua funcionando

## Story 02: Scaffold do binário `httui-tui`

Criar a crate binária com dependências TUI e estrutura de módulos.

### Tasks

- [ ] Criar `crates/httui-tui/` com `Cargo.toml` (binary crate, nome `notes-tui`)
- [ ] Adicionar deps: `ratatui`, `crossterm`, `tokio`, `ropey`, `tree-sitter`, `tree-sitter-markdown`, `syntect`, `arboard`, `directories-next`, `notify`, `anyhow`, `thiserror`
- [ ] Consumir `httui-core` como dependency
- [ ] Estrutura de módulos inicial:
  - [ ] `src/main.rs` — entry point, CLI args (`clap`)
  - [ ] `src/app.rs` — `App` struct com state global
  - [ ] `src/event.rs` — `AppEvent` enum + dispatcher
  - [ ] `src/terminal.rs` — setup/teardown (raw mode, alt screen)
  - [ ] `src/config.rs` — load/save TOML
  - [ ] `src/ui/` — módulos de render (placeholder)
  - [ ] `src/buffer/` — módulos de buffer (placeholder)
  - [ ] `src/vim/` — módulos de vim (placeholder)
- [ ] Main loop mínimo: abrir terminal, desenhar "Hello, Notes TUI", esperar `q` pra sair
- [ ] Rodar `cargo run -p httui-tui` e validar que terminal entra/sai limpo

## Story 03: Terminal lifecycle + event loop

Gerenciar entrada/saída do terminal, raw mode, alt screen, resize e dispatch de eventos.

### Tasks

- [ ] `terminal::setup()`: entra raw mode, enable mouse (opcional por config), entra alt screen, limpa tela
- [ ] `terminal::teardown()`: inverso. Tratar panics via `panic_hook` — restaurar terminal sempre
- [ ] `event::AppEvent` enum: `Key(KeyEvent)`, `Resize(u16, u16)`, `Tick`, `BlockEvent { block_id, event }`, `FileChanged(PathBuf)`, `Quit`
- [ ] `event::Dispatcher` — thread dedicada escutando `crossterm::event::read()` + `tokio::mpsc` pra eventos async
- [ ] Main loop: drain de eventos, roteamento por modo/foco, redraw quando necessário
- [ ] Tick interval configurável (default 33ms pra 30fps, throttled se idle)
- [ ] Suporte a resize: recalcula layout, re-renderiza
- [ ] Escrita defensiva de logs pra arquivo (não pro stderr) — crate `tracing` + `tracing-appender`

## Story 04: Config loading (TOML + XDG)

Carregar config de `~/.config/notes-tui/*.toml` com defaults sensatos, hot reload e validação.

### Tasks

- [ ] Usar `directories-next::ProjectDirs` pra resolver paths XDG
- [ ] Struct `Config` serializável com `serde` (todos os campos do §11.2 do design doc)
- [ ] Defaults implementados via `#[serde(default)]`
- [ ] Primeira execução: se arquivo não existe, criar com defaults
- [ ] `Config::load()` / `Config::save()` / `Config::reload()`
- [ ] Integração com `notify` crate pra detectar mudança no arquivo e recarregar
- [ ] Ex command `:config edit` abre o arquivo no próprio editor
- [ ] Ex command `:config reload` força reload
- [ ] Validação: paths existem, valores numéricos em range, etc. Erros mostrados no status bar
- [ ] Testes: load/save roundtrip, defaults preenchidos, valores inválidos rejeitados

## Story 05: CLI e entry point

Interface de linha de comando pra abrir vaults/arquivos, flags de debug, versão.

### Tasks

- [ ] `clap` com subcommands/flags:
  - [ ] `notes-tui [path]` — abre vault ou arquivo
  - [ ] `notes-tui --version`
  - [ ] `notes-tui --config [path]` — override do config path
  - [ ] `notes-tui --log-level [debug|info|warn|error]`
- [ ] Se `path` é diretório: abre como vault
- [ ] Se `path` é arquivo: abre arquivo único (vault = dir pai do arquivo)
- [ ] Se `path` ausente: usa `vault_path` do config
- [ ] Se nenhum vault configurado: prompt inicial pra escolher
- [ ] Help text com exemplos claros
- [ ] Exit code: 0 sucesso, 1 erro inicialização, 2 erro fatal em runtime
