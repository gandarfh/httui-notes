# Epic 02 — Vault & Filesystem

Gerenciamento de vaults, arvore de arquivos, file watcher, e operacoes de CRUD no filesystem.

**Depende de:** Epic 00 (Project Setup)
**Desbloqueia:** Epic 03 (Multi-pane), Epic 04 (Search)

---

## Story 01: Tauri commands de filesystem

Implementar os commands Rust para operacoes no vault.

### Tasks

- [ ] Implementar `list_workspace` — listar arvore de arquivos/pastas recursivamente, retornar como JSON hierarquico
- [ ] Implementar `read_note` — ler conteudo de um arquivo .md dado o path relativo ao vault
- [ ] Implementar `write_note` — salvar conteudo no arquivo .md
- [ ] Implementar `create_note` — criar novo arquivo .md (com validacao de nome/path)
- [ ] Implementar `delete_note` — mover arquivo para trash do OS (nao deletar permanentemente)
- [ ] Implementar `rename_note` — renomear arquivo/mover entre pastas
- [ ] Implementar `create_folder` — criar diretorio no vault
- [ ] Escrever testes para cada command usando vault temporario

## Story 02: Vault switching

Suporte a multiplos vaults com troca.

### Tasks

- [ ] Implementar `switch_vault` — recebe path do novo vault, valida que e um diretorio, persiste no app_config
- [ ] Criar UI de vault selector no top bar (dropdown daisyUI com `select` component)
- [ ] Ao trocar vault: parar file watcher anterior, iniciar novo, recarregar file tree, limpar panes
- [ ] Permitir adicionar novos vaults (dialog nativo de selecao de pasta via Tauri)
- [ ] Permitir remover vault da lista (nao deleta o diretorio, so remove do app)
- [ ] Carregar vault ativo do app_config no startup

## Story 03: Sidebar com file tree

Arvore de arquivos e pastas do vault na sidebar esquerda.

### Tasks

- [ ] Criar componente `<FileTree />` usando dados de `list_workspace`
- [ ] Renderizar arvore hierarquica com icones daisyUI para pastas (abertas/fechadas) e arquivos .md
- [ ] Clicar num arquivo abre no pane ativo
- [ ] Clicar numa pasta expande/colapsa
- [ ] Context menu (right-click) com: New Note, New Folder, Rename, Delete
- [ ] Drag and drop de arquivos entre pastas
- [ ] Destacar arquivo atualmente aberto no pane ativo
- [ ] Ordenar: pastas primeiro, depois arquivos, ambos em ordem alfabetica

## Story 04: File watcher

Detectar mudancas externas no vault e reagir.

### Tasks

- [ ] Implementar `watch_vault` no Rust usando notify/watcher crate
- [ ] Emitir eventos Tauri para o frontend: file_created, file_modified, file_deleted, file_renamed
- [ ] No frontend: atualizar file tree automaticamente ao receber eventos
- [ ] Se um arquivo aberto no editor for modificado externamente:
  - [ ] Se nao tem mudancas nao salvas: recarregar silenciosamente
  - [ ] Se tem mudancas nao salvas: mostrar dialog de conflito com opcoes (manter local, recarregar, diff)
- [ ] Debounce de eventos (agrupar mudancas rapidas em batch)
- [ ] Ignorar eventos causados pelo proprio app (ao salvar)

## Story 05: Auto-save

Salvar documento automaticamente ao editar.

### Tasks

- [ ] Implementar auto-save com debounce (salvar 1s apos ultima edicao)
- [ ] Mostrar indicador de estado no tab: unsaved (dot), saving (spinner), saved (nenhum)
- [ ] Nao fazer auto-save se o arquivo tem conflito externo pendente
- [ ] Salvar imediatamente ao trocar de tab/pane ou fechar pane
