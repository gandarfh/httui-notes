# Epic 10 — Polish & Pending ✅

Consolidacao de todas as tasks pendentes dos epics anteriores (01-09). Organizadas por prioridade e dependencia.

**Depende de:** Epic 05, 06, 07
**Desbloqueia:** nenhum
**Status:** concluido

---

## Story 01: Seguranca — Keychain encryption ✅

Encriptar passwords e variaveis sensiveis via OS keychain. Atualmente tudo e armazenado em plaintext no SQLite.

**Origem:** Epic 06 Story 01, Epic 07 Story 05

### Tasks

- [x] Integrar keyring crate para armazenamento seguro (`src-tauri/src/db/keychain.rs`)
- [x] Encriptar passwords de connections de banco (Epic 06) — create/update armazenam no keychain, sentinel `__KEYCHAIN__` no SQLite
- [x] Encriptar values de environment variables (Epic 07) — campo `is_secret` + toggle lock/unlock no `EnvironmentManager.tsx`
- [x] Manter fallback para plataformas sem keychain disponivel — fallback para plaintext se keychain falhar
- [x] Limpar keychain ao deletar connection

---

## Story 02: Conflitos de arquivo externo ✅

Detectar e resolver conflitos quando arquivo aberto e modificado por fora do app.

**Origem:** Epic 02 Story 04, Story 05

### Tasks

- [x] Quando arquivo aberto no editor for modificado externamente: exibir banner de conflito com opcoes (Reload / Keep Mine)
- [x] Nao fazer auto-save enquanto houver conflito externo pendente

---

## Story 03: Theme sync — CodeMirror e Mermaid ✅

Sincronizar themes dos editores embarcados com o theme do app.

**Origem:** Epic 09 Story 04

### Tasks

- [x] Sincronizar theme do CodeMirror com light/dark do app — ja era feito via `theme={cmTheme}` prop do `@uiw/react-codemirror`
- [x] Sincronizar theme do Mermaid com light/dark do app — `mermaid.initialize()` reativo com `colorMode`

---

## Story 04: Block reference highlights ✅

Highlight visual de `{{...}}` no editor com informacao contextual.

**Origem:** Epic 05 Story 05

### Tasks

- [x] Renderizar `{{alias.response.path}}` com cor diferenciada no editor — `cm-references.ts` (purple highlight)
- [x] Hover sobre referencia mostra tooltip com valor resolvido (ou erro se nao resolvido) — `createReferenceTooltip()` em `cm-references.ts`

---

## Story 05: Prioridade de resolucao e bind parameters ✅

Completar o pipeline de interpolacao: prioridade de resolucao e bind parameters para SQL.

**Origem:** Epic 05 Story 07

### Tasks

- [x] Definir prioridade: block reference > environment variable quando alias colide com env var — `resolveAllReferences()` em `references.ts`
- [x] Implementar interpolacao bind para SQL — `resolveRefsToBindParams()` (DbBlockView.tsx)
- [x] Garantir que SQL queries nunca usam string interpolation (sempre bind params)

---

## Story 06: Autocomplete — SQL schema ✅

Autocomplete contextual de tabelas e colunas em blocos SQL.

**Origem:** Epic 05 Story 08

### Tasks

- [x] Autocomplete de tabelas e colunas da conexao selecionada (via `schema_cache`) — `createSchemaCompletionSource()` (DbBlockView.tsx)
- [x] SQL autocomplete triggered apos keywords: FROM, JOIN, WHERE, SELECT, INSERT INTO, UPDATE, etc.
- [x] Auto-refresh do schema cache ao conectar/reconectar — listener `connection-status` em `DbInput`

---

## Story 07: Lock de dependencias compartilhadas ✅

Evitar execucao duplicada quando blocos concorrentes compartilham dependencia.

**Origem:** Epic 05 Story 06

### Tasks

- [x] Se dois blocos executam simultaneamente e compartilham dependencia: lock por block_id, executar dependencia uma unica vez, ambos aguardam o resultado — `inflightExecutions` Map em `dependencies.ts`

---

## Story 08: Connection status em tempo real ✅

Exibir estado de conexoes de banco no status bar e reagir a mudancas.

**Origem:** Epic 06 Story 02, Epic 09 Story 03

### Tasks

- [x] Manter estado de conexao (connected/disconnected) acessivel ao frontend — `useConnectionStatus` hook
- [x] Emitir Tauri event ao mudar estado de conexao — `PoolManager` emite `connection-status`
- [x] Exibir connection status no status bar: nome e icone (verde/vermelho) — `StatusBar.tsx`

---

## Story 09: Drag and drop de arquivos na file tree ✅

Mover arquivos entre pastas via drag and drop.

**Origem:** Epic 02 Story 03

### Tasks

- [x] Implementar drag and drop de arquivos entre pastas na file tree — `@dnd-kit/core` em `FileTree.tsx` + `FileTreeNode.tsx`
- [x] Validar que move no filesystem e atualiza a arvore — `handleMoveFile` em `useFileOperations.ts`

---

## Story 10: UX polish ✅

Melhorias cosmeticas e de usabilidade.

**Origem:** Epic 05 Story 02, Epic 07 Story 03, Epic 01 Story 05

### Tasks

- [x] Animacao suave de transicao entre display modes dos blocos (input/output/split) — CSS transitions em `ExecutableBlockShell.tsx`
- [x] Botao de maximizar em previews binarios: abre modal fullscreen (imagens, PDFs, etc.) — `BinaryPreview` em `HttpBlockView.tsx`
- [x] Contextual table toolbar (inserir/remover linhas e colunas) — `TableToolbar.tsx` com `@floating-ui` positioning

---

## Ordem sugerida de implementacao

Todas as tasks foram implementadas.
