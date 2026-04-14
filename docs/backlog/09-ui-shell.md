# Epic 09 — UI Shell & Theme ✅

Layout geral do app: top bar, sidebar, status bar, e sistema de theming.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** todos os epics de UI (prove o container)
**Status:** concluido

---

## Story 01: Layout shell

Estrutura base do app.

### Tasks

- [x] Criar componente `<AppShell />` com layout flex:
  - [x] Top bar (fixo no topo)
  - [x] Sidebar esquerda (colapsavel, largura redimensionavel)
  - [x] Area central (ocupa espaco restante — renderiza placeholder)
  - [x] Status bar (fixo no fundo)
- [x] Sidebar colapsavel com toggle (hotkey Ctrl+B)
- [x] Divider arrastavel entre sidebar e area central

## Story 02: Top bar

Barra superior com controles globais.

### Tasks

- [x] Nome do app (esquerda)
- [x] Vault selector: dropdown daisyUI `select` com vaults disponiveis (placeholder)
- [x] Environment selector: dropdown daisyUI `select` com environments (placeholder)
- [x] Busca: botao que abre QuickOpen (Ctrl+P), com hint de hotkey
- [x] Estilizar com daisyUI `navbar`

## Story 03: Status bar

Barra inferior com informacoes de contexto.

### Tasks

- [x] Criar componente `<StatusBar />` com daisyUI
- [x] Exibir: keybinding mode (VS Code), environment ativo, contagem de panes abertos
- [x] Posicao do cursor no editor (linha:coluna) — placeholder
- [x] Indicador de encoding do arquivo (UTF-8)
- [ ] Connection status: nome e icone (verde=conectado, vermelho=desconectado) — depende do Epic 06

## Story 04: Theme system

Light/dark mode com daisyUI.

### Tasks

- [x] Detectar preferencia do OS via `prefers-color-scheme` media query
- [x] Permitir override manual: toggle light/dark no top bar
- [x] Persistir override no localStorage (migrar para app_config quando integrado)
- [x] Transicao suave ao trocar theme
- [ ] Sincronizar theme do CodeMirror com o theme do app — depende do Epic 05
- [ ] Sincronizar theme do Mermaid com o theme do app — depende do Epic 01
