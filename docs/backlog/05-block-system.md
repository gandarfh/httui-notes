# Epic 05 — Block System Core ✅

Sistema central de blocos executaveis: display modes, cache, referencias entre blocos, resolucao de dependencias, e autocomplete.

**Depende de:** Epic 00 (SQLite), Epic 01 (Editor)
**Desbloqueia:** Epic 06 (DB Blocks), Epic 07 (HTTP Client), Epic 08 (E2E Runner)
**Status:** concluido

---

## Story 01: Node base para blocos executaveis

Criar a base TipTap para todos os blocos executaveis.

### Tasks

- [x] Criar `ExecutableBlock` — TipTap node abstrato com nodeView React que serve de base para http, db, e2e
- [x] Atributos comuns: alias (string), display_mode (input | output | split), state (idle | cached | running | success | error)
- [x] Renderizar header do bloco com: icone do tipo, campo alias editavel, toggle de display mode (3 botoes), botao Run
- [x] Renderizar area de input (slot para cada tipo de bloco)
- [x] Renderizar area de output (slot para cada tipo de bloco)
- [x] Controlar visibilidade de input/output baseado no display_mode
- [x] Estilizar com Chakra UI: `Box` como container, `Badge` para status, `IconButton` para acoes

## Story 02: Display modes

Tres modos de visualizacao por bloco.

### Tasks

- [x] Implementar modo **input**: mostra apenas formulario de edicao, output oculto
- [x] Implementar modo **output**: mostra apenas resultado, input oculto
- [x] Implementar modo **split**: divide bloco verticalmente — input esquerda, output direita
- [x] Toggle entre modos via botoes no header do bloco (icones Lucide)
- [x] Default: input quando idle, split quando tem resultado
- [x] Persistir display_mode no atributo do node (salvo no markdown)
- [x] Animacao suave de transicao entre modos — CSS transitions em `ExecutableBlockShell.tsx`

## Story 03: Estados e ciclo de execucao

Gerenciar estados do bloco durante execucao.

### Tasks

- [x] Implementar maquina de estados: idle -> running -> success/error
- [x] Estado **idle**: output area mostra placeholder ("Run to see results")
- [x] Estado **running**: output area mostra Spinner, botao Run vira Cancel
- [x] Estado **success**: output area mostra resultado, badge verde com status
- [x] Estado **error**: output area mostra mensagem de erro
- [x] Estado **cached**: ao abrir documento, carregar resultado do block_results se hash bate

## Story 04: Cache de resultados

Persistir resultados de execucao no SQLite.

### Tasks

- [x] Calcular `block_hash` a partir do conteudo serializado do bloco (SHA-256 via Web Crypto API)
- [x] Apos execucao com sucesso: salvar em `block_results` (file_path, block_hash, status, response JSON, total_rows, elapsed_ms)
- [x] Ao abrir documento: para cada bloco executavel, buscar resultado em block_results por file_path + block_hash
- [x] Se hash bate: carregar resultado, setar estado como cached, entrar em split view
- [x] Se hash nao bate (conteudo mudou): descartar cache, setar idle
- [x] Implementar Tauri commands: `get_block_result`, `save_block_result`
- [x] Implementar execucao HTTP real via reqwest (substituiu mock)
- [x] Implementar Tauri command generico `execute_block` com ExecutorRegistry

## Story 05: Sistema de referencias entre blocos

Resolucao de `{{alias.response.path}}`.

### Tasks

- [x] Implementar parser de referencias: extrair todas as `{{...}}` de um bloco
- [x] Classificar cada referencia: block reference com path via dot notation
- [x] Para block references: resolver alias -> bloco no documento (buscar apenas acima do bloco atual)
- [x] Navegar o JSON do resultado cacheado via dot notation (ex: `response.body.items.0.id`)
- [x] Retornar erro claro se: alias nao encontrado, bloco esta abaixo, resultado nao cacheado, path invalido no JSON
- [x] Resolver referencias em URL, headers e body antes de executar HTTP block
- [x] Highlight visual de referencias no editor (cor diferente, hover mostra valor resolvido) — `cm-references.ts` com `createReferenceTooltip()`
- [x] Classificar environment variables vs block references — `extractReferencedAliases()` em `dependencies.ts` exclui env vars (sem dots)

## Story 06: Resolucao de dependencias

Execucao recursiva de dependencias ao rodar um bloco.

### Tasks

- [x] Ao clicar Run: escanear referencias do bloco
- [x] Para cada referencia de bloco: verificar se tem cache valido
- [x] Se nao tem cache: executar o bloco dependencia primeiro (recursivo)
- [x] Construir DAG de execucao e executar em ordem topologica
- [x] Resolver referencias dentro dos blocos dependentes antes de executar
- [x] Se dois blocos executam simultaneamente e compartilham dependencia: lock por block_id, executar uma vez, ambos esperam — `inflightExecutions` Map em `dependencies.ts`
- [x] Mostrar indicador visual no bloco: "Executing alias..." durante resolucao
- [x] Timeout global para resolucao de dependencias (10s, previne loops infinitos)
- [x] Deteccao de ciclos com erro claro

## Story 07: Pipeline de interpolacao

Dois modos de interpolacao: string (HTTP) e bind parameters (SQL).

### Tasks

- [x] Implementar interpolacao string: substituir `{{...}}` pelo valor resolvido como texto
- [x] Usar interpolacao string para: HTTP url, headers, body
- [x] Implementar interpolacao bind: converter `{{...}}` para placeholder do driver ($1, ?, etc.) e coletar valores — `resolveRefsToBindParams()` em `DbBlockView.tsx`
- [x] Usar interpolacao bind para: SQL queries (nunca string interpolation)
- [x] Resolver environment variables: buscar no environment ativo (tabela env_variables) — `resolveAllReferences()` em `references.ts`
- [x] Resolver block references: buscar no cache de resultados (block_results)
- [x] Prioridade: block reference > environment variable (se alias colide com env var, bloco ganha) — `resolveAllReferences()` tenta block ref primeiro

## Story 08: Autocomplete no CodeMirror

Provider de autocomplete para campos dos blocos.

### Tasks

- [x] Criar CodeMirror extension de autocomplete customizada
- [x] Trigger ao digitar `{{`: listar environment variables do environment ativo — `cm-autocomplete.ts`
- [x] Trigger ao digitar `{{`: listar blocos anteriores no documento que tem alias (mostrar alias + tipo do bloco)
- [x] Apos selecionar um alias: navegar a arvore JSON do resultado cacheado com dot notation (mostrar keys disponiveis a cada `.`)
- [x] Para SQL blocks: autocomplete de tabelas e colunas da conexao selecionada (via schema_cache) — `createSchemaCompletionSource()` em `DbBlockView.tsx`
- [x] SQL autocomplete triggered apos keywords: FROM, JOIN, WHERE, SELECT, INSERT INTO, UPDATE, etc.
- [x] Estilizar popup de autocomplete com tema consistente (z-index, shadow, cores, fonte mono)
