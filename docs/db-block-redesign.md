# DB Block Redesign — Inline Fenced-Code Model

Status: Spec · Author: product
Escopo: bloco de banco de dados (`db-*`). HTTP e E2E blocks continuam no modelo atual de JSON body.
Relacionado: [`db-block-vision.md`](./db-block-vision.md) — visão de substituição do DBeaver (features, diferenciais, roadmap V2/V3).

Este doc descreve a entrega end-to-end do novo bloco DB (equivalente à V1 da visão). Sem fases de PoC — tudo que está aqui vai junto, em entregas incrementais mergeable mas sem quebrar vaults em nenhum momento.

---

## 1. Problema

O bloco DB atual (`src/components/blocks/db/DbBlockView.tsx`) é um TipTap NodeView com um **CodeMirror aninhado** e a query serializada em JSON no corpo do fenced code:

````
```db-postgres alias=db1
{"query": "SELECT * FROM responses", "connection_id": "...", "limit": 100}
```
````

Consequências ruins:

- **Navegação quebrada** — `atomicRanges` em `cm-block-widgets.tsx:437` faz o bloco inteiro virar atomic. Setas `←↑→↓` pulam por cima dele; não é possível entrar na query pelo teclado.
- **CM6 duplicado** — um CodeMirror externo (o editor do doc) hospeda um CodeMirror interno (o editor da query). Bugs de foco, undo stack separado, themes e extensions repetidos.
- **Leitura crua ilegível** — um usuário abrindo o `.md` no editor de texto vê JSON, não a query.
- **UI densa** — tabs (Query/Settings), picker de conexão, display mode toggle e resultado competem por espaço a cada bloco.
- **Teto baixo para features** — qualquer coisa próxima do que DBeaver oferece (schema browser, multi-statement, transações, cancel, autocomplete de colunas) esbarra no modelo atual.

## 2. Proposta

Reescrever o bloco DB como um **fenced code block nativo** do CM6. A query **é** o corpo do fence. Metadata vai no info string da cerca. UI acessória (settings, connections, delete) vai num **drawer lateral** ancorado no bloco. Um **schema panel** persistente na direita do app serve a todos os blocos.

### 2.1 Formato do arquivo

````
```db-postgres alias=db1 connection=prod limit=100 timeout=30000 display=split
SELECT *
FROM responses
WHERE id > 10
```
````

**Tokens do info string:**

- `db-postgres` / `db-mysql` / `db-sqlite` — dialeto.
- `alias=` — identificador para referências `{{db1.response.0.id}}`.
- `connection=` — identificador da conexão. **Resolução:** primeiro tenta como slug (campo `connections.slug`, único por vault); fallback para UUID exato. Raw fica legível (`connection=prod`); rename de conexão atualiza o slug mas mantém UUID estável via fallback.
- `limit=` — row limit (default 100, backend injeta se ausente).
- `timeout=` — timeout em ms.
- `display=` — `input` | `split` | `output` (default `split`).

**Regras do info string:**
- Tokens separados por espaço, formato `key=value`.
- Values sem espaço/aspas (MVP). Caso precise: suportar aspas duplas depois.
- Ordem não importa na leitura, mas a **forma canônica na escrita** é fixa (`alias → connection → limit → timeout → display`) para roundtrip determinístico e diffs limpos no git.
- Keys desconhecidas ignoradas silenciosamente.

**Corpo:**
- Apenas SQL cru. Múltiplas statements permitidas (`;` como separador).
- Linhas em branco preservadas.
- **Cerca com N+1 backticks** quando o corpo contém N backticks consecutivos (CommonMark). Parser Rust já lida com fecha de N backticks (`parser.rs:47`); serializador frontend passa a escolher N apropriado.

### 2.2 Estados visuais

| Estado | Query | Toolbar | Resultado | Drawer |
|---|---|---|---|---|
| Cursor fora do bloco | Cartão com borda, SQL highlight | Compacta (badge+alias+conn+modo · ▶ ⚡ ▦ ⤓ ⚙) | Widget abaixo | – |
| Cursor dentro do bloco | Texto cru editável (fence revelado) | Some | Visível | – |
| Executando | (qualquer) | ⏹ (cancel) no lugar de ▶, demais itens vivos | Spinner + row counter streamed | – |
| Drawer aberto | (qualquer) | Mantém | Mantém | Aberto à direita |

Status bar no rodapé do bloco em todos os estados: `connection · N rows · Xms · cached? · last run`.

### 2.3 Toolbar (cursor fora)

Ancorada com `position: absolute; top: 4px; right: 8px` dentro de `.cm-fenced-code-open`. Itens, esquerda → direita:

1. **Badge `DB`** + alias + connection + modo (`RO`/`RW`).
2. **▶ / ⏹** — run quando idle, cancel quando executando.
3. **▦** — EXPLAIN (envolve a query em `EXPLAIN`/`EXPLAIN QUERY PLAN` por dialeto e renderiza plan na tab Plan).
4. **⚙** — abre drawer.

Export do resultado (CSV / JSON / Markdown / INSERT) fica no footer/status bar do bloco, não na toolbar.

Toolbar some quando cursor está dentro do bloco. Atalhos tomam o lugar: `⌘↵` run, `⌘.` cancel, `⌘⇧F` format (quando sql-formatter entrar), `⌘⇧E` EXPLAIN.

### 2.4 Drawer

- Renderização: `Portal` do Chakra (não `Dialog.Root` — preserva foco do CM6), `position: fixed` à direita.
- Conteúdo:
  - **Alias** — text input.
  - **Connection** — select com `listConnections()`. Toggle inline de `read-only` que persiste no record da connection (não é do bloco).
  - **Row limit** — number input.
  - **Timeout (ms)** — number input.
  - **Display mode** — radio (input/split/output).
  - **Resolved bindings** — read-only, mostra o mapeamento `{{ref}} → $N` da última execução (debug).
  - **Delete block** — botão destrutivo.
- Cada mudança dispara `view.dispatch({changes})` reescrevendo **só** o info string na forma canônica. Annotation `widgetTransaction` evita rebuild de decoração.
- Fecha: ESC, clique fora, botão ×.

### 2.5 Widget de resultado

- Inserido como `Decoration.widget({block: true, side: 1})` **depois** da cerca de fechamento.
- React portal renderiza `<ResultPanel>` com **tab-set**: `Result(s) · Messages · Plan · Stats`.
- **Result(s)**: se há múltiplos result sets, sub-tabs numeradas. `ResultTable` existente virtualizado para grandes volumes.
- **Messages**: NOTICE/WARNING/RAISE do backend. Badge com contador quando há itens.
- **Plan**: populado só quando ▦ foi usado. Árvore colapsável do plano.
- **Stats**: elapsed, rows streamed, bytes, cache status.
- Visível sempre — não depende da posição do cursor.
- Display mode: `input` esconde result; `output` colapsa query em uma linha (clique expande); `split` mostra ambos.
- Paginação: botão `[ load N more ]` reenvia a query com `OFFSET`.

### 2.6 Schema panel

- Painel persistente à direita do app (terceiro zone, ao lado da file tree). Toggle `Cmd+\`.
- Conteúdo: árvore connection → schema → tabela → colunas, com badges de tipo, PK, FK, índice.
- Busca inline (input de filtro no topo do panel).
- Interações:
  - Duplo-clique em tabela → insere `SELECT * FROM <tabela> LIMIT 100` no bloco DB ativo (ou cria um).
- Dados: schema cache compartilhado (ver 3.1). Atualização manual via botão refresh ou automática com TTL configurável.

### 2.7 Status bar do bloco

Linha fina sob o result, fonte mono, cinza. Exemplo:

```
prod · 100 rows · 43ms · cached · ran 2m ago · ⌘↵ to run
```

Campos: connection (+ modo RO/RW tintado), count de rows (ou `N statements` se multi), elapsed, cache hit/miss, last run relativo, hint de atalho contextual (varia entre "run", "cancel", "format").

---

## 3. Arquitetura

### 3.1 Frontend

**Novo parser de info string** (`src/lib/blocks/db-fence.ts`):
```ts
parseDbFenceInfo(info: string): DbBlockMetadata
stringifyDbFenceInfo(meta: DbBlockMetadata): string  // forma canônica
```

**Extensão do `cm-hybrid-rendering.ts`:**
- Dentro do handler de `FencedCode`, detectar `lang.startsWith("db-")` e tratar como fenced code especial:
  - NÃO esconder o conteúdo (diferente de `http`/`e2e` hoje).
  - Aplicar classe `.cm-db-block` na primeira/última linha de conteúdo.
  - Inserir widget `DbToolbarWidget` na posição do contentStart (side: -1).
  - Inserir widget `DbResultWidget` depois da cerca de fechamento (side: +1, block: true).
  - Inserir widget `DbStatusBarWidget` depois do result.

**Remoção de `cm-block-widgets.tsx` para db-\*:**
- Hoje `BLOCK_OPEN_RE` inclui `db(?:-[\w:-]+)?`. Remover o ramo db-\* — passa a ser tratado pelo hybrid-rendering, não pelo PortalWidget.

**Result storage — usa cache SQLite, não Zustand novo:**
- Execução em andamento publica chunks via `tauri::Channel` direto para o `DbResultWidget` inscrito.
- Resultado final persiste no cache SQLite (já existe), com chave = hash(query + connection_id + limit + env_snapshot).
- `DbResultWidget` no mount lê do cache SQLite. Subscrição ao channel só existe durante run ativo.
- `references.ts` resolve `{{alias.response…}}` lendo do cache SQLite pelo hash esperado. Consistente entre reloads.

**Schema cache compartilhado** (`src/stores/schemaCache.ts` — único store global novo):
```ts
type SchemaCache = {
  byConnection: Record<string, { schema: Schema; fetchedAt: number }>;
  get: (connectionId) => Schema | undefined;
  refresh: (connectionId) => Promise<Schema>;
};
```
Consumidores: autocomplete do CM6, schema panel, futuros (FK nav, full-scan warning). Um único lugar para invalidar quando conexão muda.

**Autocomplete schema-aware:**
- `SQLConfig.schema` do `@codemirror/lang-sql` alimentado pelo `SchemaCache.get(connectionId)`.
- Completa tabelas após `FROM`/`JOIN`, colunas após `SELECT`/`WHERE`/`ON`, sugestões de condição JOIN a partir de FKs.

**Execução:**
- Botão ▶ (toolbar) dispara função `runDbBlock(alias, query, metadata)`.
- Função monta um `BlockRequest` com `{ block_type: "db", params: { query, connection_id, limit, timeout_ms } }`.
- Chama `invoke("execute_block", ...)` passando um `Channel` para chunks.
- Recebe chunks `{ kind: "row" | "message" | "stats" | "error" | "complete" }` até `complete`.
- Cache final escrito via `save_block_result`.

**Referências `{{alias.response…}}`:**
- Resolver mantém-se em `src/lib/blocks/references.ts`.
- Multi-result: `{{alias.response.0.rows.0.id}}` (índice do result set → rows → linha → coluna). Refs legadas `{{alias.response.id}}` resolvem para primeiro result set, primeira row, chave `id`, via shim temporário durante migração.

### 3.2 Backend (Rust)

**Parser** (`httui-core/src/parser.rs`):
- `parse_blocks` com ramo dedicado para `db-*`:
  - **Heurística retrocompatível**: se body trim-start começa com `{` e parseia como JSON com chave `query`, é formato legado — extrai campos do JSON.
  - Caso contrário: body **é** a query; `connection_id`/`limit`/`timeout_ms` vêm do info string.
  - Resultado: `ParsedBlock` com `params: JSON { query, connection_id, limit, timeout_ms }`.
- Testes de roundtrip: `parse → stringify → parse` preserva shape exata.

**Response shape novo** (`httui-core/src/executor/db/types.rs`):
```rust
pub struct DbResponse {
    pub results: Vec<DbResult>,       // pode ter múltiplos quando query tem N statements
    pub messages: Vec<DbMessage>,     // NOTICE, WARNING, RAISE
    pub plan: Option<ExplainPlan>,    // só se EXPLAIN foi usado
    pub stats: DbStats,               // elapsed_ms, rows_streamed
}

pub enum DbResult {
    Select { columns: Vec<Column>, rows: Vec<Row> },
    Mutation { rows_affected: u64 },
    Error { message: String, line: Option<u32>, column: Option<u32> },
}
```

**Executor streamed com cancel** (`httui-core/src/executor/db/mod.rs`):
```rust
async fn execute_query(
    &self,
    query: &str,
    binds: &[BindValue],
    fetch_size: Option<usize>,
    cancel: CancellationToken,
    tx: Sender<DbChunk>,
) -> Result<DbStats>;
```
- Retorna progressivamente via `tx`. Frontend recebe por `Channel`.
- `cancel` é `tokio_util::sync::CancellationToken`. Comando Tauri `cancel_block` sinaliza o token por `execution_id`.
- Erros de SQL capturam `position` (Postgres), `line/column` (MySQL). Propagam para o frontend como `DbResult::Error`.

**MCP** (`httui-mcp/src/tools/blocks.rs`):
- `list_blocks` e `execute_block` usam `parser::parse_blocks` compartilhado — pegam a retrocompat de graça.

### 3.3 Cache de resultado

- Chave: `sha256(query_canonical + connection_id + limit + env_snapshot)`.
  - `query_canonical`: query com whitespace normalizado.
  - `env_snapshot`: hash das env vars usadas em `{{...}}` (evita hit cruzado entre envs).
- Migração: invalidar tudo. É só cache.
- Cache **nunca** serve resultado quando a query tem statement de mutação (UPDATE/DELETE/INSERT/DDL). Detecção simples por prefixo dos tokens.

---

## 4. Navegação e interação

### 4.1 Navegação por teclado

- `←↑→↓` navegam dentro da query como texto normal.
- `Home/End` início/fim da linha da query.
- `Cmd+A` seleciona o doc inteiro (padrão CM6).
- Seta ↓ **de fora** entra na primeira linha de conteúdo da query (pula a cerca de abertura).
- Seta ↓ **na última linha** de conteúdo pula a cerca de fechamento e pousa na linha seguinte.
- Implementação: `EditorView.transactionFilter` que detecta movimentos do cursor cruzando linhas de cerca e pula; `atomicRanges` **só nas linhas da cerca**, não no conteúdo.

### 4.2 Edição

- Undo/redo unificado (single undo stack do doc).
- Copy/paste natural.
- Multi-cursor (`Cmd+Click`, `Cmd+D`) funciona.
- Vim mode funciona — é o mesmo CM6. `j/k` do vim já anda por textblocks, precisa ser testado contra a cerca (ver seção 7).

### 4.3 Execução

- `⌘↵` dentro do bloco → executa.
- Clique em ▶ → executa.
- Durante execução: ▶ vira ⏹. `⌘.` cancela. Status bar mostra "running Xs".
- Rows streamed aparecem com contador na aba Result; quando `complete` chega, render final.
- Erros com line/col pintam squiggle na linha/col correta via decoração efêmera.

### 4.4 Slash commands

- `/db-postgres`, `/db-mysql`, `/db-sqlite` em `cm-slash-commands.ts`.
- Template: insere fence nova com query vazia + `alias=db1` placeholder. `connection=` fica omitido — o usuário escolhe via drawer (⚙).

---

## 5. Migração

### 5.1 Estratégia — conversão silenciosa na leitura, **sem feature flag**

Ao abrir um `.md`:
1. Parser detecta body que é JSON válido com chave `query` dentro de fence `db-*`.
2. Extrai `query`, `connection_id`, `limit`, `timeout_ms` do JSON; atributos opcionais ficam como default.
3. Reescreve em memória no novo formato.
4. **Não** salva automaticamente — conversão on-read. Próxima edição gera o save no formato novo (fluxo de auto-save já existente).

**Razão pra não ter flag:** migração é read-only até o usuário editar. Zero risco. Flag adiciona complexidade sem benefício. Em caso de bug do parser novo, reverter = revert do commit, não flag-flip.

### 5.2 Code path

- `httui-core/src/parser.rs`: branch descrita em 3.2 (heurística JSON vs SQL cru).
- Frontend CM6: `findFencedBlocks` + `parseDbFenceInfo` aceitam ambos formatos; `stringifyDbFenceInfo` sempre escreve no novo.
- MCP (`httui-mcp`) herda via `httui-core`.

### 5.3 Pós-migração

Depois de 1-2 releases estáveis (instrumentar contador de reads legados), remover o branch JSON do parser Rust. Pode continuar indefinidamente se preferirmos não mexer.

---

## 6. Dependências externas

| Feature | Pacote | Já instalado? | Tamanho aprox |
|---|---|---|---|
| SQL syntax highlight | `@codemirror/lang-sql` | Sim | – |
| SQL format | `sql-formatter` | Não | ~20kb |
| Drawer portal | `@chakra-ui/react` Portal | Sim | – |
| Language data | `@codemirror/language-data` | Sim | – |
| Cancel token (Rust) | `tokio-util` | Verificar | ~parte do tokio |
| Virtualized grid | `@tanstack/react-virtual` | Verificar | ~8kb |

`sql-formatter` entra em V2 da visão; mesmo sem ele a entrega é funcional.

---

## 7. Edge cases

1. **Bloco sem alias** — toolbar mostra `DB` só. Referências impossíveis. OK.
2. **Connection órfã** (deletada) — toolbar mostra badge vermelho; tentativa de run erro claro.
3. **Query vazia** — ▶ desabilitado.
4. **Query com erro SQL** — backend retorna `DbResult::Error` com line/col; squiggle + tab Messages acende.
5. **Cerca de fechamento ausente** — parser estende até EOF. Toolbar renderiza. Usuário corrige.
6. **Query contém ```` ``` ````** — escritor usa N+1 backticks na cerca. Parser Rust aceita cerca variável (`parser.rs:47` já lida).
7. **Bloco legado JSON** — retrocompat via heurística no parser (3.2).
8. **Cross-device sync** — arquivos no formato antigo vindos de outra máquina funcionam via retrocompat.
9. **Múltiplos blocos com mesmo alias** — primeiro vence (regra já existente). Warning visual no segundo.
10. **Vim mode atravessando cerca** — `j/k` navegam por textblocks; cerca é linha isolada. Testar se o vim pula ou pousa nela. Se pousa, transactionFilter do 4.1 remaneja.
11. **Seleção multilinha que começa dentro do bloco e termina fora** — aceitar (é doc normal); só copia/cola preserva estrutura.
12. **IME (composição de input)** — CM6 trata nativamente quando conteúdo não é atomic. Já não há compose em fence raw.
13. **Execução cancelada com resultados parciais** — `DbResponse.results` com o que chegou antes do cancel + `stats` indicando cancelado. Mostrar badge "cancelled" na status bar.
14. **Statement destrutivo sem WHERE** — detecção via parser simples; confirm dialog antes do run. Desabilitável no settings.

---

## 8. Testes

- **Parser** (`parser_tests.rs`): info string com metadata variada, body multi-linha, cerca N-backticks, roundtrip determinístico, heurística JSON vs SQL cru.
- **CM6 decoração** (vitest): `findFencedBlocks` separa db-\* de http/e2e; toolbar/result/status widgets nas posições certas.
- **Navegação** (playwright): cursor entra/sai com setas; undo/redo; vim `j/k` atravessa cerca; multi-cursor.
- **Drawer** (RTL): abre/fecha, cada campo edita info string na forma canônica, roundtrip sem drift.
- **Execução** (integração): ▶ dispara `execute_block`, chunks chegam, cancel interrompe, erro pinta squiggle.
- **Multi-result** (integração): `BEGIN; UPDATE; SELECT; ROLLBACK;` retorna `results.len() == 4` (ou 2, decidir se `BEGIN`/`ROLLBACK` viram `DbResult::Mutation`).
- **Migração** (unit + E2E): arquivo JSON legado abre correto, salva no novo após edição.
- **Schema cache**: shared entre autocomplete e panel; invalidação e refresh consistente.
- **Cache de resultado**: mutation não serve de cache; env snapshot separa hits.

---

## 9. Plano de entrega

Entrega **ponta-a-ponta**, sem fases de PoC. Em ordem de execução com invariantes preservadas em todo momento (vault nunca quebra, execução sempre funciona).

### Etapa 1 — Retrocompat no parser (zero mudança visível)

- Branch de heurística no `httui-core/src/parser.rs`: JSON-legado vs SQL-cru.
- Ajustes em `parseDbFenceInfo`/`stringifyDbFenceInfo` no frontend.
- Testes de parser dos dois formatos.
- **Invariante:** UI não muda. Vault antigo continua 100%. Novo formato, se escrito manualmente, já é parseado.

### Etapa 2 — Shape novo de response (sem mudar UI)

- Tipo `DbResponse` novo (`results[]`, `messages[]`, `plan?`, `stats`) no Rust e TS.
- Executor `execute_query` passa a popular `results[0]` com o único result set atual.
- `ResultTable` consome `response.results[0]`.
- Refs legadas resolvidas via shim (`{{alias.response.id}}` → `results[0].rows[0].id`).
- **Invariante:** comportamento idêntico ao de hoje, shape preparado para multi.

### Etapa 3 — Executor streamed + cancel token

- `execute_query` vira streamed (`Channel` + `CancellationToken`).
- Comando `cancel_block` por `execution_id`.
- Frontend: hook `useBlockExecution` subscreve ao channel.
- **Invariante:** executa e finaliza igual; ganha cancel mas UI ainda não usa.

### Etapa 4 — CM6 fenced render + navegação

- Extensão `cm-hybrid-rendering` para `db-*`: classes, toolbar stub, result widget stub, status bar stub.
- Remoção do ramo `db-*` do `cm-block-widgets` + `BLOCK_OPEN_RE`.
- `atomicRanges` cirúrgicos só nas linhas de cerca.
- `transactionFilter` para entrar/sair do bloco com setas.
- Testes de navegação (incluindo vim).
- **Invariante:** bloco renderiza, edita, navega. Sem ▶ ainda — roda via hack temporário (atalho debug) até Etapa 5.

### Etapa 5 — Toolbar, drawer, execução

- `DbToolbarWidget` com botões ▶ ▦ ⚙ (run/explain/settings). Export ⤓ vai pro footer/status bar.
- `DbDrawer` (portal) com alias/connection/limit/timeout/display + resolved bindings + readonly toggle.
- ▶ conecta ao executor streamed da Etapa 3. Cancel via ⏹ ou `⌘.`.
- Status bar ao vivo.
- **Invariante:** bloco totalmente usável como substituto do atual.

### Etapa 6 — Result panel com tabs

- `ResultPanel` com `Result(s) · Messages · Plan · Stats`.
- Suporte a múltiplos result sets (sub-tabs numeradas).
- Paginação "load N more" reenvia com `OFFSET` + `fetch_size`.
- `ResultTable` virtualizado.
- **Invariante:** multi-statement começa a funcionar (query `BEGIN; UPDATE; SELECT; ROLLBACK;` retorna os N result sets).

### Etapa 7 — Schema panel + autocomplete schema-aware

- `SchemaCache` Zustand.
- Painel direito com tree, busca, double-click insere SELECT.
- `SQLConfig.schema` do `lang-sql` alimentado pelo cache.
- Completion pós-FROM/WHERE/JOIN.
- **Invariante:** ambiente começa a sentir substituição de DBeaver.

### Etapa 8 — Read-only mode + erros com line/col + export

- Flag `is_readonly` em `connections` + confirm dialog para mutation.
- Parse de `position`/`line`/`column` dos erros Postgres/MySQL; squiggle no CM6.
- Menu ⤓ com CSV/JSON/Markdown/INSERT/clipboard/save file.
- **Invariante:** feature set da V1 da visão completo.

### Etapa 9 — Limpeza

- Remover `src/components/blocks/db/DbBlockView.tsx`.
- Remover código ≠ db-\* do `cm-block-widgets` se não houver mais uso.
- Atualizar `SPEC.md` e `ARCHITECTURE.md`.
- Depois de observar produção estável: remover branch JSON legado do parser (opcional).

Cada etapa é mergeable. Nenhuma deixa o app num estado quebrado para vaults existentes.

---

## 10. Não-objetivos

- HTTP e E2E blocks **não** mudam.
- Design system do drawer **não** é finalizado aqui — podemos iterar.
- Integração com formatter SQL automático **não** é requisito (entra em V2 da visão).
- Schema diff, ERD mermaid, data editor inline, FK navigation, AI rewrite — todos ficam para V2/V3 (ver `db-block-vision.md`).
- Dialetos além de Postgres/MySQL/SQLite — não neste escopo.
- Backup/restore, import wizard, server admin — nunca.
- **Sessão transacional compartilhada entre blocos** — `BEGIN` num bloco + `COMMIT` em outro não é suportado. Cada execução abre/fecha sua própria conexão do pool. Transações multi-statement dentro de **um** bloco continuam OK (via suporte multi-result da Etapa 6).

---

## 11. Riscos

- **Navegação customizada** com atomic ranges seletivos tem cantos obscuros (vim mode, seleções multilinha, IME). Mitigação: testes de navegação prioritários na Etapa 4; plano B é `atomicRanges` completo e navegação custom via keymap.
- **Performance** — decoração a cada keystroke em docs grandes. Mitigação: cache de blocos (pattern em `cm-block-widgets`) invalidado só em `docChanged` com block count mudado.
- **Shape de response mudando** — se o multi-result não for planejado direito, refs `{{alias.response...}}` quebram. Mitigação: shim na Etapa 2 preserva refs legadas via mapeamento `response → results[0].rows[0]`.
- **Schema cache desatualizado** — usuário renomeia coluna fora do app e autocomplete engana. Mitigação: botão refresh + TTL curto por default + invalidação quando executor reporta `undefined_column`.
- **Info string crescendo** — se precisar de muita metadata, fica ilegível. Mitigação: reservar chave `extra=base64(json)` como escape hatch documentado.
- **Chakra Drawer focus trap** — pode brigar com ProseMirror/CM6. Usar Portal + Box como em search panels (não `Dialog.Root`).
- **Cancel não respeitado pelo driver** — `sqlx` com Postgres aceita cancel bem; MySQL/SQLite podem ter casos de query que ignora sinal. Mitigação: timeout como fallback; documentar limitação.
