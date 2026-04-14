# Epic 03 — Multi-pane & Session

Layout de panes com splits estilo Neovim, keybindings configuraveis, e persistencia de sessao.

**Depende de:** Epic 01 (Editor), Epic 02 (Vault)
**Desbloqueia:** nenhum (feature independente)

---

## Story 01: Layout de panes

Sistema de splits horizontal e vertical.

### Tasks

- [x] Criar modelo de dados para layout de panes (arvore binaria: cada node e um split ou um leaf/pane)
- [x] Criar componente `<PaneContainer />` que renderiza a arvore de panes recursivamente
- [x] Cada pane leaf renderiza: tab bar + editor TipTap
- [x] Implementar split horizontal (dividir pane em cima/baixo)
- [x] Implementar split vertical (dividir pane em esquerda/direita)
- [x] Redimensionar panes arrastando o divisor entre eles
- [x] Fechar pane (se e o unico, nao fecha — fica vazio)
- [x] Ao fechar pane com arquivo nao salvo: confirmar antes

## Story 02: Tab bar por pane

Cada pane tem sua propria lista de arquivos abertos.

### Tasks

- [x] Criar componente `<TabBar />` com tabs daisyUI (`tabs`, `tab`)
- [x] Cada tab mostra nome do arquivo, indicador de unsaved, botao de fechar
- [x] Clicar na tab troca o arquivo ativo no pane
- [x] Arrastar tab entre panes move o arquivo para outro pane
- [x] Middle-click na tab fecha o arquivo
- [x] Context menu na tab: Close, Close Others, Close All, Copy Path

## Story 03: Keybindings

Dois modos de keybinding configuraveis.

### Tasks

- [x] Criar sistema de keybinding com mapeamento de acao -> atalho
- [x] Implementar modo VS Code-style com atalhos padrao:
  - [x] Ctrl+S: salvar
  - [x] Ctrl+P: busca por nome
  - [x] Ctrl+Shift+F: busca full-text
  - [x] Ctrl+\: split vertical
  - [x] Ctrl+Shift+\: split horizontal
  - [x] Ctrl+W: fechar tab
  - [x] Ctrl+Tab: proxima tab
- [x] Implementar modo vim-like:
  - [x] Modos normal/insert/visual no editor (via extensao TipTap ou CodeMirror vim)
  - [x] Ctrl+W seguido de s/v: split horizontal/vertical
  - [x] Ctrl+W seguido de h/j/k/l: navegar entre panes
  - [x] Ctrl+W seguido de q: fechar pane
- [x] Persistir modo selecionado no app_config
- [x] UI de configuracao de keybinding mode (dropdown nas settings)

## Story 04: Session persistence

Salvar e restaurar estado do app entre sessoes.

### Tasks

- [x] Ao fechar o app, salvar no app_config:
  - [x] Vault ativo
  - [x] Layout dos panes (arvore de splits com tamanhos)
  - [x] Arquivos abertos em cada pane (com tab ativa)
  - [x] Environment ativo
  - [x] Posicao de scroll de cada pane
  - [x] Keybinding mode
- [x] Ao abrir o app, restaurar estado completo do app_config
- [x] Se um arquivo salvo na sessao nao existe mais, remover da lista silenciosamente
- [x] Se o vault salvo nao existe mais, mostrar vault selector
