# Epic 02 — Vault & Filesystem ✅

Gerenciamento de vaults, arvore de arquivos, file watcher, e operacoes de CRUD no filesystem.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 03 (Multi-pane), Epic 04 (Search)
**Status:** concluido

---

## Story 01: Tauri commands de filesystem

Implementar os commands Rust para operacoes no vault.

### Tasks

- [x] Implementar `list_workspace` — listar arvore de arquivos/pastas recursivamente, retornar como JSON hierarquico
- [x] Implementar `read_note` — ler conteudo de um arquivo .md dado o path relativo ao vault
- [x] Implementar `write_note` — salvar conteudo no arquivo .md
- [x] Implementar `create_note` — criar novo arquivo .md (com validacao de nome/path)
- [x] Implementar `delete_note` — mover arquivo para trash do OS via trash crate
- [x] Implementar `rename_note` — renomear arquivo/mover entre pastas
- [x] Implementar `create_folder` — criar diretorio no vault
- [x] Escrever testes para cada command usando vault temporario (9 testes)

## Story 02: Vault switching

Suporte a multiplos vaults com troca.

### Tasks

- [x] Implementar `switch_vault` — recebe path do novo vault, valida que e um diretorio, persiste no app_config
- [x] Criar UI de vault selector no top bar (dropdown daisyUI)
- [x] Ao trocar vault: parar file watcher anterior, iniciar novo, recarregar file tree, limpar panes
- [x] Permitir adicionar novos vaults (prompt para path)
- [x] Permitir remover vault da lista (via wrappers)
- [x] Carregar vault ativo do app_config no startup

## Story 03: Sidebar com file tree

Arvore de arquivos e pastas do vault na sidebar esquerda.

### Tasks

- [x] Criar componente `<FileTree />` usando dados de `list_workspace`
- [x] Renderizar arvore hierarquica com icones para pastas (abertas/fechadas) e arquivos .md
- [x] Clicar num arquivo abre no editor
- [x] Clicar numa pasta expande/colapsa
- [x] Context menu (right-click) com: New Note, New Folder, Rename, Delete
- [ ] Drag and drop de arquivos entre pastas — adiado para futuro
- [x] Destacar arquivo atualmente aberto no pane ativo
- [x] Ordenar: pastas primeiro, depois arquivos, ambos em ordem alfabetica

## Story 04: File watcher

Detectar mudancas externas no vault e reagir.

### Tasks

- [x] Implementar `watch_vault` no Rust usando notify crate
- [x] Emitir eventos Tauri para o frontend: file_created, file_modified, file_deleted
- [x] No frontend: atualizar file tree automaticamente ao receber eventos
- [ ] Se um arquivo aberto no editor for modificado externamente: dialog de conflito — adiado
- [x] Debounce de eventos (300ms)
- [x] Ignorar eventos causados pelo proprio app (ao salvar)

## Story 05: Auto-save

Salvar documento automaticamente ao editar.

### Tasks

- [x] Implementar auto-save com debounce (salvar 1s apos ultima edicao)
- [x] Mostrar indicador de estado no tab: unsaved (dot amarelo)
- [ ] Nao fazer auto-save se o arquivo tem conflito externo pendente — depende do dialog de conflito
- [x] Salvar imediatamente ao trocar de arquivo
