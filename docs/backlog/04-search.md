# Epic 04 — Search

Busca por nome de arquivo (quick-open) e busca full-text no conteudo dos documentos.

**Depende de:** Epic 00 (SQLite), Epic 02 (Vault, File Watcher)
**Desbloqueia:** nenhum (feature independente)

---

## Story 01: Busca por nome (Ctrl+P)

Quick-open estilo VS Code com busca fuzzy.

### Tasks

- [x] Implementar `search_files` no Rust — busca fuzzy por nome de arquivo no vault ativo (usar algoritmo tipo fzf: subsequence matching com scoring)
- [x] Criar componente `<QuickOpen />` — modal/dialog daisyUI com input de busca
- [x] Abrir com Ctrl+P (ou Cmd+P no macOS)
- [x] Listar resultados em tempo real conforme o usuario digita (debounce 100ms)
- [x] Mostrar path relativo ao vault, com highlight nos caracteres que matcharam
- [x] Navegar resultados com setas, abrir com Enter
- [x] Enter abre no pane ativo, Ctrl+Enter abre em novo pane
- [x] Fechar com Escape
- [x] Mostrar arquivos recentes quando o input esta vazio

## Story 02: Indice full-text (FTS5)

Manter indice de busca atualizado no SQLite.

### Tasks

- [x] Criar tabela `search_index` com FTS5: file_path, title, content
- [x] Implementar `rebuild_search_index` no Rust — reindexar todos os .md do vault
- [x] Atualizar indice incrementalmente:
  - [x] Ao salvar um arquivo: atualizar entrada no indice
  - [x] Ao receber evento do file watcher (create/modify): atualizar entrada
  - [x] Ao receber evento de delete: remover entrada
- [x] Rodar rebuild_search_index ao trocar de vault
- [x] Rodar rebuild_search_index no primeiro startup (se indice esta vazio)

## Story 03: Busca full-text (Ctrl+Shift+F)

Interface de busca de conteudo.

### Tasks

- [x] Implementar `search_content` no Rust — busca via FTS5 com snippet() para trechos com match
- [x] Criar componente `<SearchPanel />` — painel lateral ou modal daisyUI
- [x] Abrir com Ctrl+Shift+F
- [x] Input de busca com resultados agrupados por arquivo
- [x] Cada resultado mostra: nome do arquivo, trecho com match highlighted, numero da linha
- [x] Clicar num resultado: abrir arquivo no pane ativo e scroll ate a posicao do match
- [x] Mostrar contagem total de resultados
- [x] Suportar busca case-insensitive por default, com toggle para case-sensitive
