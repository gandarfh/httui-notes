# Epic 23 — TUI Polish & Distribution

Temas, help overlay, customização de keybindings, compatibilidade cross-platform, testes, packaging e documentação.

**Depende de:** Epic 17–22 (todos os outros do ciclo TUI)
**Desbloqueia:** —

Referência: [`docs/tui-design.md`](../tui-design.md) §13, §14.

---

## Story 01: Sistema de temas

Temas dark/light/auto + custom via TOML, respeitando truecolor vs 256 color.

### Tasks

- [ ] Struct `Theme` com paleta semântica: `bg`, `fg`, `muted`, `border`, `accent`, `success`, `warning`, `error`, `info`
- [ ] Paletas específicas: `method_get`, `method_post`, ..., `status_2xx`, `status_4xx`, etc.
- [ ] Tema `dark` default (paleta já em uso no desktop — reusar)
- [ ] Tema `light` default
- [ ] `auto`: detecta via `COLORFGBG` ou preferência do terminal
- [ ] Tema custom via `~/.config/notes-tui/theme.toml` (override parcial do default)
- [ ] Truecolor vs 256 color: auto-fallback via capabilities detection
- [ ] `:theme {name}` troca em runtime
- [ ] Testes: carrega tema default, override parcial funciona, fallback 256 color não quebra

## Story 02: Help overlay completo

Sistema de ajuda abrangente acessível por `:help` ou `?`.

### Tasks

- [ ] Conteúdo em arquivos markdown embeddados (`include_str!` ou `rust-embed`)
- [ ] Tópicos: `motions`, `operators`, `text-objects`, `registers`, `marks`, `ex-commands`, `blocks`, `http`, `db`, `e2e`, `environments`, `connections`, `search`, `config`, `keymaps`, `about`
- [ ] Overlay full-screen com header + content + footer de navegação
- [ ] `:help` sem argumento abre index
- [ ] `:help {topic}` abre tópico
- [ ] Links internos `:help foo` renderizados como underline + `<CR>` em cima navega
- [ ] `/` dentro do help faz busca (reusa engine)
- [ ] `<C-o>` / `<C-i>` jump list dentro do help
- [ ] `q` / `<Esc>` fecha
- [ ] Conteúdo auto-gerado (keymaps atuais, comandos registrados) via macros ou reflection
- [ ] Testes: navegação funciona, links resolvem, busca acha conteúdo

## Story 03: Customização de keybindings

Usuário pode remapear qualquer keybinding via config.

### Tasks

- [ ] `~/.config/notes-tui/keybindings.toml` com seções por modo
- [ ] Sintaxe vim-like: `"<leader>ff" = ":e "`
- [ ] Support a chains (ex: `<leader>f` seguido de `f`)
- [ ] `:nmap` / `:imap` / `:vmap` em runtime (persiste opcional)
- [ ] Conflict detection: se mapping duplica default importante, warning
- [ ] `:map` lista todos os mappings ativos
- [ ] `:unmap {lhs}` remove
- [ ] `:mapclear` reseta pros defaults
- [ ] Hot reload ao editar o arquivo
- [ ] Testes: mapping override funciona, chains resolvem, conflicts detectados

## Story 04: Compatibilidade cross-platform

Testar e polir pra terminais principais.

### Tasks

- [ ] Matrix de testes manual documentada:
  - [ ] Linux: Alacritty, Kitty, Wezterm, Gnome Terminal, Konsole, tmux host
  - [ ] macOS: iTerm2, Terminal.app, Alacritty, Kitty, Ghostty, Wezterm
  - [ ] Windows: Windows Terminal, Alacritty
  - [ ] SSH: rodando em VM/container via SSH local
- [ ] Por ambiente: checklist de funcionalidades (cursor shape, true color, mouse, resize, unicode)
- [ ] Issues conhecidos documentados em `docs/tui-compat.md`
- [ ] Feature detection no startup: emite warnings no log pra features não suportadas
- [ ] Fallbacks: cursor shape com escape codes padrão, cores 256 se truecolor não detectado
- [ ] Testes automatizados no CI em containers Linux (subset que dá pra automatizar)

## Story 05: Mouse support opt-in

Suporte básico a mouse pra quem quiser, desabilitado por default.

### Tasks

- [ ] Config `mouse_enabled = false` (default)
- [ ] Quando habilitado:
  - [ ] Click em tab → ativa tab
  - [ ] Click em file tree → seleciona/expande
  - [ ] Scroll wheel → scroll viewport
  - [ ] Click em block header → seleciona bloco
  - [ ] Drag em border entre sidebar e editor → resize (se viável)
- [ ] Documentar conflito com seleção nativa do terminal
- [ ] Shortcut pra toggle runtime: `<leader>tm` ou `:set mouse!`
- [ ] Testes manuais por terminal

## Story 06: Testes E2E automatizados

Harness que simula user input e valida estado/render.

### Tasks

- [ ] `tests/e2e/` com harness usando terminal virtual (via `ratatui::backend::TestBackend`)
- [ ] API: `Harness::new() -> Harness`, `.send_keys(seq)`, `.wait_for(predicate)`, `.snapshot()`, `.assert_cursor_at(line, col)`
- [ ] Cenários MVP:
  - [ ] Abrir arquivo vazio, digitar texto, salvar, reabrir, validar conteúdo
  - [ ] Criar bloco HTTP via slash command (se implementado), editar URL, executar (mock backend), validar output
  - [ ] Criar bloco DB, executar, validar tabela com rows mockadas
  - [ ] Vim motions complexos (5j, daw, ci"), validar cursor e conteúdo finais
  - [ ] Quick open abre arquivo, FTS encontra match, abre no local correto
  - [ ] Split pane, navegação entre panes, fechar pane
  - [ ] Reordenar bloco com Alt-j
  - [ ] Yank bloco inteiro e paste em outra posição
- [ ] Snapshot testing com `insta` pra UI states estáveis
- [ ] CI: rodar no GitHub Actions em Linux/macOS

## Story 07: Benchmarks e performance

Validar performance em casos reais.

### Tasks

- [ ] Benchmarks com `criterion`:
  - [ ] Parse de doc com 100, 1k, 10k linhas + 10 blocos
  - [ ] Render frame em viewport 200x60
  - [ ] Vim motion `G` em doc de 10k linhas
  - [ ] Edição inline (inserir char em meio de prose longo)
- [ ] Target: frame render < 16ms (60fps), motion < 5ms
- [ ] Profiling com `cargo flamegraph` se algum benchmark falha target
- [ ] Otimizações comuns: reutilizar buffers, cache de layout, incremental tree-sitter
- [ ] Documentar resultados em `docs/tui-performance.md`

## Story 08: Packaging — cargo install

Publicar no crates.io pra `cargo install notes-tui`.

### Tasks

- [ ] Metadata completa em `crates/httui-tui/Cargo.toml`: `description`, `repository`, `license`, `keywords`, `categories`, `readme`
- [ ] README específico da crate (curto, aponta pra docs principal)
- [ ] `cargo publish --dry-run` passa
- [ ] Publicar após primeira versão estável
- [ ] GitHub Actions workflow pra release: tag vX.Y.Z → build → publish crates.io

## Story 09: Packaging — Homebrew

Formula pra `brew install notes-tui`.

### Tasks

- [ ] Tap próprio: `github.com/gandarfh/homebrew-tap` (se ainda não existe)
- [ ] `Formula/notes-tui.rb` com build from source
- [ ] Binários pré-compilados pra macOS ARM + x86_64 publicados nas releases do GitHub
- [ ] Formula aponta pros binários (faster install) com fallback pra source
- [ ] CI: ao criar release, sobe binários e atualiza formula automaticamente
- [ ] Documentar no README principal

## Story 10: Packaging — Linux (deb/rpm + AUR)

Pacotes nativos pra distros Linux.

### Tasks

- [ ] `cargo-deb` pra Debian/Ubuntu — config em `Cargo.toml`
- [ ] `cargo-generate-rpm` pra Fedora/RHEL/SUSE
- [ ] GitHub Actions builda em matrix, anexa à release
- [ ] AUR: PKGBUILD em `aur/notes-tui-git/` e `aur/notes-tui/`
- [ ] Testes manuais em VMs das distros principais
- [ ] Documentar no README

## Story 11: Packaging — Windows

MSI ou portable zip pra Windows.

### Tasks

- [ ] Cross-compile `x86_64-pc-windows-msvc` no CI
- [ ] Portable zip com binário + README + licença
- [ ] Scoop manifest (opcional)
- [ ] Chocolatey package (opcional)
- [ ] Docs específicas de Windows (paths XDG via `dirs-next`, shell setup)

## Story 12: Documentação de usuário

Docs acessíveis pra quem vai usar a TUI.

### Tasks

- [ ] `docs/tui-getting-started.md`: instalação → abrir vault → criar primeiro bloco → executar
- [ ] `docs/tui-keybindings.md`: referência completa, auto-gerada do código quando possível
- [ ] `docs/tui-vim-cheatsheet.md`: subset de vim suportado, com exemplos
- [ ] `docs/tui-compat.md`: matrix de terminais + issues conhecidos
- [ ] `docs/tui-performance.md`: resultados de benchmarks + dicas
- [ ] README principal ganha seção "Terminal version" com highlights + install commands
- [ ] Landing do projeto: screenshot/asciinema da TUI em ação
- [ ] Migration guide: desktop ↔ TUI (mesmos vault, mesmos atalhos principais)

## Story 13: CI/CD completo

GitHub Actions pra testes, builds, releases.

### Tasks

- [ ] Workflow `test.yml`: em cada PR rodar `cargo test`, `cargo clippy`, `cargo fmt --check`
- [ ] Matrix OS: ubuntu-latest, macos-latest, windows-latest
- [ ] Cache de deps (`actions/cache` com `~/.cargo`, `target/`)
- [ ] Workflow `release.yml`: trigger em tag `v*`
  - [ ] Build matrix de targets
  - [ ] Upload artifacts (binários por plataforma)
  - [ ] Publicar GitHub Release com assets
  - [ ] Publicar crates.io
  - [ ] Atualizar Homebrew tap
- [ ] Coverage report (opcional — `cargo-tarpaulin` no Linux)
- [ ] Badges no README: tests passing, version, license, platform

## Story 14: Error handling e recovery

Robustez contra falhas inesperadas.

### Tasks

- [ ] Panic hook global: restaura terminal + logga stack + mostra mensagem amigável
- [ ] Recovery automático de falha em operação de IO (read/write file): notification + estado consistente
- [ ] Corrupção de config: detecta, renomeia `.bak`, cria novo com defaults, notification
- [ ] Corrupção de sessão: ignora + startup limpo com warning
- [ ] SQLite lock timeout: retry com backoff, error claro se falha persiste
- [ ] Network errors (HTTP block): classificados como no desktop (`timeout`, `connection_failed`, etc.)
- [ ] Testes: injeção de falhas simulada em cada camada, validar recovery
