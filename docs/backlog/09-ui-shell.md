# Epic 09 — UI Shell & Theme

Layout geral do app: top bar, sidebar, status bar, e sistema de theming.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** todos os epics de UI (provê o container)

---

## Story 01: Layout shell

Estrutura base do app.

### Tasks

- [ ] Criar componente `<AppShell />` com layout flex:
  - [ ] Top bar (fixo no topo)
  - [ ] Sidebar esquerda (colapsavel, largura redimensionavel)
  - [ ] Area central (ocupa espaco restante — renderiza `<PaneContainer />`)
  - [ ] Status bar (fixo no fundo)
- [ ] Sidebar colapsavel com toggle (hotkey Ctrl+B)
- [ ] Divider arrastavel entre sidebar e area central

## Story 02: Top bar

Barra superior com controles globais.

### Tasks

- [ ] Nome do app (esquerda)
- [ ] Vault selector: dropdown daisyUI `select` com vaults disponiveis
- [ ] Environment selector: dropdown daisyUI `select` com environments
- [ ] Busca: botao que abre QuickOpen (Ctrl+P), com hint de hotkey
- [ ] Estilizar com daisyUI `navbar`

## Story 03: Status bar

Barra inferior com informacoes de contexto.

### Tasks

- [ ] Criar componente `<StatusBar />` com daisyUI
- [ ] Exibir: keybinding mode (VIM / VS Code), environment ativo, contagem de panes abertos
- [ ] Connection status: nome e icone (verde=conectado, vermelho=desconectado) para a conexao usada pelo bloco ativo
- [ ] Posicao do cursor no editor (linha:coluna)
- [ ] Indicador de encoding do arquivo (UTF-8)

## Story 04: Theme system

Light/dark mode com daisyUI.

### Tasks

- [ ] Configurar daisyUI themes: um light (ex: `light` ou `corporate`) e um dark (ex: `dark` ou `business`)
- [ ] Detectar preferencia do OS via `prefers-color-scheme` media query
- [ ] Permitir override manual: toggle light/dark nas settings
- [ ] Persistir override no app_config
- [ ] Sincronizar theme do CodeMirror com o theme do app
- [ ] Sincronizar theme do Mermaid com o theme do app
- [ ] Transicao suave ao trocar theme
