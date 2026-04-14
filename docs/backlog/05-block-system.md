# Epic 05 — Block System Core

Sistema central de blocos executaveis: display modes, cache, referencias entre blocos, resolucao de dependencias, e autocomplete.

**Depende de:** Epic 00 (SQLite), Epic 01 (Editor)
**Desbloqueia:** Epic 06 (DB Blocks), Epic 07 (HTTP Client), Epic 08 (E2E Runner)

---

## Story 01: Node base para blocos executaveis

Criar a base TipTap para todos os blocos executaveis.

### Tasks

- [ ] Criar `ExecutableBlock` — TipTap node abstrato com nodeView React que serve de base para http, db, e2e
- [ ] Atributos comuns: alias (string), display_mode (input | output | split), state (idle | cached | running | success | error)
- [ ] Renderizar header do bloco com: icone do tipo, campo alias editavel, toggle de display mode (3 botoes), botao Run
- [ ] Renderizar area de input (slot para cada tipo de bloco)
- [ ] Renderizar area de output (slot para cada tipo de bloco)
- [ ] Controlar visibilidade de input/output baseado no display_mode
- [ ] Estilizar com daisyUI: `card` como container, `badge` para status, `btn` para acoes

## Story 02: Display modes

Tres modos de visualizacao por bloco.

### Tasks

- [ ] Implementar modo **input**: mostra apenas formulario de edicao, output oculto
- [ ] Implementar modo **output**: mostra apenas resultado, input oculto
- [ ] Implementar modo **split**: divide bloco verticalmente — input esquerda, output direita
- [ ] Toggle entre modos via botoes no header do bloco (icones daisyUI)
- [ ] Default: input quando idle, split quando tem resultado cacheado
- [ ] Persistir display_mode no atributo do node (salvo no markdown)
- [ ] Animacao suave de transicao entre modos

## Story 03: Estados e ciclo de execucao

Gerenciar estados do bloco durante execucao.

### Tasks

- [ ] Implementar maquina de estados: idle -> running -> success/error
- [ ] Estado **idle**: output area mostra placeholder ("Run to see results")
- [ ] Estado **running**: output area mostra loading (daisyUI `loading loading-spinner`), botao Run vira Cancel
- [ ] Estado **success**: output area mostra resultado, badge verde com status
- [ ] Estado **error**: output area mostra mensagem de erro estilizada (daisyUI `alert alert-error`)
- [ ] Estado **cached**: ao abrir documento, carregar resultado do block_results se hash bate

## Story 04: Cache de resultados

Persistir resultados de execucao no SQLite.

### Tasks

- [ ] Calcular `block_hash` a partir do conteudo serializado do bloco (SHA-256 ou similar)
- [ ] Apos execucao com sucesso: salvar em `block_results` (file_path, block_hash, status, response JSON, total_rows, elapsed_ms)
- [ ] Ao abrir documento: para cada bloco executavel, buscar resultado em block_results por file_path + block_hash
- [ ] Se hash bate: carregar resultado, setar estado como cached, entrar em split view
- [ ] Se hash nao bate (conteudo mudou): descartar cache, setar idle
- [ ] Implementar Tauri commands: `get_block_result`, `save_block_result`

## Story 05: Sistema de referencias entre blocos

Resolucao de `{{alias.response.path}}`.

### Tasks

- [ ] Implementar parser de referencias: extrair todas as `{{...}}` de um bloco
- [ ] Classificar cada referencia: environment variable (sem `.response`) vs block reference (com `.response` ou `.status`)
- [ ] Para block references: resolver alias -> bloco no documento (buscar apenas acima do bloco atual)
- [ ] Navegar o JSON do resultado cacheado via dot notation (ex: `response.data.items.0.id`)
- [ ] Retornar erro claro se: alias nao encontrado, bloco esta abaixo, resultado nao cacheado, path invalido no JSON
- [ ] Highlight visual de referencias no editor (cor diferente, hover mostra valor resolvido)

## Story 06: Resolucao de dependencias

Execucao recursiva de dependencias ao rodar um bloco.

### Tasks

- [ ] Ao clicar Run: escanear referencias do bloco
- [ ] Para cada referencia de bloco: verificar se tem cache valido
- [ ] Se nao tem cache: executar o bloco dependencia primeiro (recursivo)
- [ ] Construir DAG de execucao e executar em ordem topologica
- [ ] Se dois blocos executam simultaneamente e compartilham dependencia: lock por block_id, executar uma vez, ambos esperam
- [ ] Mostrar indicador visual no bloco: "Resolving dependencies..." com lista dos blocos sendo executados
- [ ] Timeout global para resolucao de dependencias (prevenir loops infinitos em caso de bug)

## Story 07: Pipeline de interpolacao

Dois modos de interpolacao: string (HTTP) e bind parameters (SQL).

### Tasks

- [ ] Implementar interpolacao string: substituir `{{...}}` pelo valor resolvido como texto
- [ ] Usar interpolacao string para: HTTP url, headers, body
- [ ] Implementar interpolacao bind: converter `{{...}}` para placeholder do driver ($1, ?, etc.) e coletar valores
- [ ] Usar interpolacao bind para: SQL queries (nunca string interpolation)
- [ ] Resolver environment variables: buscar no environment ativo (tabela env_variables)
- [ ] Resolver block references: buscar no cache de resultados (block_results)
- [ ] Prioridade: block reference > environment variable (se alias colide com env var, bloco ganha)

## Story 08: Autocomplete no CodeMirror

Provider de autocomplete para campos dos blocos.

### Tasks

- [ ] Criar CodeMirror extension de autocomplete customizada
- [ ] Trigger ao digitar `{{`: listar environment variables do environment ativo
- [ ] Trigger ao digitar `{{`: listar blocos anteriores no documento que tem alias (mostrar alias + tipo do bloco)
- [ ] Apos selecionar um alias: navegar a arvore JSON do resultado cacheado com dot notation (mostrar keys disponiveis a cada `.`)
- [ ] Para SQL blocks: autocomplete de tabelas e colunas da conexao selecionada (via schema_cache)
- [ ] SQL autocomplete triggered apos keywords: FROM, JOIN, WHERE, SELECT, INSERT INTO, UPDATE, etc.
- [ ] Estilizar popup de autocomplete consistente com theme daisyUI
