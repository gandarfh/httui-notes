# Epic 04 — Search

Busca por nome de arquivo (quick-open) e busca full-text no conteudo dos documentos.

**Depende de:** Epic 00 (SQLite), Epic 02 (Vault, File Watcher)
**Desbloqueia:** nenhum (feature independente)

---

## Story 01: Busca por nome (Ctrl+P)

Quick-open estilo VS Code com busca fuzzy.

### Tasks

- [ ] Implementar `search_files` no Rust — busca fuzzy por nome de arquivo no vault ativo (usar algoritmo tipo fzf: subsequence matching com scoring)
- [ ] Criar componente `<QuickOpen />` — modal/dialog daisyUI com input de busca
- [ ] Abrir com Ctrl+P (ou Cmd+P no macOS)
- [ ] Listar resultados em tempo real conforme o usuario digita (debounce 100ms)
- [ ] Mostrar path relativo ao vault, com highlight nos caracteres que matcharam
- [ ] Navegar resultados com setas, abrir com Enter
- [ ] Enter abre no pane ativo, Ctrl+Enter abre em novo pane
- [ ] Fechar com Escape
- [ ] Mostrar arquivos recentes quando o input esta vazio

## Story 02: Indice full-text (FTS5)

Manter indice de busca atualizado no SQLite.

### Tasks

- [ ] Criar tabela `search_index` com FTS5: file_path, title, content
- [ ] Implementar `rebuild_search_index` no Rust — reindexar todos os .md do vault
- [ ] Atualizar indice incrementalmente:
  - [ ] Ao salvar um arquivo: atualizar entrada no indice
  - [ ] Ao receber evento do file watcher (create/modify): atualizar entrada
  - [ ] Ao receber evento de delete: remover entrada
- [ ] Rodar rebuild_search_index ao trocar de vault
- [ ] Rodar rebuild_search_index no primeiro startup (se indice esta vazio)

## Story 03: Busca full-text (Ctrl+Shift+F)

Interface de busca de conteudo.

### Tasks

- [ ] Implementar `search_content` no Rust — busca via FTS5 com snippet() para trechos com match
- [ ] Criar componente `<SearchPanel />` — painel lateral ou modal daisyUI
- [ ] Abrir com Ctrl+Shift+F
- [ ] Input de busca com resultados agrupados por arquivo
- [ ] Cada resultado mostra: nome do arquivo, trecho com match highlighted, numero da linha
- [ ] Clicar num resultado: abrir arquivo no pane ativo e scroll ate a posicao do match
- [ ] Mostrar contagem total de resultados
- [ ] Suportar busca case-insensitive por default, com toggle para case-sensitive
