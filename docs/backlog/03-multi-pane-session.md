# Epic 03 — Multi-pane & Session

Layout de panes com splits estilo Neovim, keybindings configuraveis, e persistencia de sessao.

**Depende de:** Epic 01 (Editor), Epic 02 (Vault)
**Desbloqueia:** nenhum (feature independente)

---

## Story 01: Layout de panes

Sistema de splits horizontal e vertical.

### Tasks

- [ ] Criar modelo de dados para layout de panes (arvore binaria: cada node e um split ou um leaf/pane)
- [ ] Criar componente `<PaneContainer />` que renderiza a arvore de panes recursivamente
- [ ] Cada pane leaf renderiza: tab bar + editor TipTap
- [ ] Implementar split horizontal (dividir pane em cima/baixo)
- [ ] Implementar split vertical (dividir pane em esquerda/direita)
- [ ] Redimensionar panes arrastando o divisor entre eles
- [ ] Fechar pane (se e o unico, nao fecha — fica vazio)
- [ ] Ao fechar pane com arquivo nao salvo: confirmar antes

## Story 02: Tab bar por pane

Cada pane tem sua propria lista de arquivos abertos.

### Tasks

- [ ] Criar componente `<TabBar />` com tabs daisyUI (`tabs`, `tab`)
- [ ] Cada tab mostra nome do arquivo, indicador de unsaved, botao de fechar
- [ ] Clicar na tab troca o arquivo ativo no pane
- [ ] Arrastar tab entre panes move o arquivo para outro pane
- [ ] Middle-click na tab fecha o arquivo
- [ ] Context menu na tab: Close, Close Others, Close All, Copy Path

## Story 03: Keybindings

Dois modos de keybinding configuraveis.

### Tasks

- [ ] Criar sistema de keybinding com mapeamento de acao -> atalho
- [ ] Implementar modo VS Code-style com atalhos padrao:
  - [ ] Ctrl+S: salvar
  - [ ] Ctrl+P: busca por nome
  - [ ] Ctrl+Shift+F: busca full-text
  - [ ] Ctrl+\: split vertical
  - [ ] Ctrl+Shift+\: split horizontal
  - [ ] Ctrl+W: fechar tab
  - [ ] Ctrl+Tab: proxima tab
- [ ] Implementar modo vim-like:
  - [ ] Modos normal/insert/visual no editor (via extensao TipTap ou CodeMirror vim)
  - [ ] Ctrl+W seguido de s/v: split horizontal/vertical
  - [ ] Ctrl+W seguido de h/j/k/l: navegar entre panes
  - [ ] Ctrl+W seguido de q: fechar pane
- [ ] Persistir modo selecionado no app_config
- [ ] UI de configuracao de keybinding mode (dropdown nas settings)

## Story 04: Session persistence

Salvar e restaurar estado do app entre sessoes.

### Tasks

- [ ] Ao fechar o app, salvar no app_config:
  - [ ] Vault ativo
  - [ ] Layout dos panes (arvore de splits com tamanhos)
  - [ ] Arquivos abertos em cada pane (com tab ativa)
  - [ ] Environment ativo
  - [ ] Posicao de scroll de cada pane
  - [ ] Keybinding mode
- [ ] Ao abrir o app, restaurar estado completo do app_config
- [ ] Se um arquivo salvo na sessao nao existe mais, remover da lista silenciosamente
- [ ] Se o vault salvo nao existe mais, mostrar vault selector
