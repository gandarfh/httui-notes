# Notes — Arquitetura

## Principio central

**Open/Closed** — cada novo bloco e uma pasta nova, sem tocar no codigo existente.

> **Estado atual:** o frontend migrou TipTap → CodeMirror 6 progressivamente.
> **DB blocks** (epic do redesign do DB) e **HTTP blocks** (epic 24) são **100%
> nativos CM6** — extensão `cm-{db,http}-block.tsx` + painel React
> (`DbFencedPanel` / `HttpFencedPanel`) montado em portais widget. **E2E** ainda
> é o último bloco TipTap NodeView, encapsulado pelo `cm-block-widgets.tsx` +
> `BlockAdapter`. As seções abaixo descrevem o pattern TipTap original (vale para
> E2E hoje); ver `## 6. DB block — caminho nativo CM6` para o pattern novo, que é
> o template para futuros blocos.

---

## Visao geral das camadas

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│                                                  │
│  BlockRegistry ← registra blocos dynamicamente   │
│       │                                          │
│  ExecutableBlockShell (shared UI)                │
│  ┌──────────┬──────────┬──────────┐             │
│  │ HttpBlock│ DbBlock  │ E2eBlock │  ...novos   │
│  └──────────┴──────────┴──────────┘             │
│       │                                          │
│  invoke('execute_block', { block_type, params }) │
└──────────────────┬──────────────────────────────┘
                   │ Tauri IPC (um comando generico)
┌──────────────────┴──────────────────────────────┐
│                   Backend (Rust)                  │
│                                                  │
│  ExecutorRegistry ← dispatch por block_type      │
│  ┌──────────┬──────────┬──────────┐             │
│  │HttpExec  │ DbExec   │ E2eExec  │  ...novos   │
│  └──────────┴──────────┴──────────┘             │
│       │                                          │
│  trait Executor { fn execute(), fn validate() }  │
└─────────────────────────────────────────────────┘
```

---

## 1. TipTap — Base node + `.extend()`

Um node base `ExecutableBlock` define tudo que e compartilhado. Cada tipo de bloco estende com `.extend()`:

```typescript
// Base — escrito uma vez, nunca mais tocado
const ExecutableBlock = Node.create({
  name: 'executableBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      blockType: { default: 'unknown' },
      displayMode: { default: 'split' },      // input | output | split
      executionState: { default: 'idle' },     // idle | running | success | error
      alias: { default: null },
      cachedResult: { default: null },
    }
  },
  addCommands() {
    return {
      executeBlock: (pos) => ({ tr, dispatch }) => { /* shared */ },
      setDisplayMode: (pos, mode) => ({ tr }) => { /* shared */ },
    }
  },
})

// Novo bloco TipTap = novo .extend(), zero mudancas no base
// (Hoje só E2e usa esse pattern; HTTP/DB são fenced-native CM6 — ver §6.)
const E2eBlock = ExecutableBlock.extend({
  name: 'e2eBlock',
  addAttributes() {
    return {
      ...this.parent?.(),  // herda displayMode, state, alias...
      baseUrl: { default: '' },
      headers: { default: [] },
      steps: { default: [] },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(E2eBlockView)
  },
})
```

---

## 2. React — Registry + Shell wrapper

Um `BlockRegistry` onde cada bloco se auto-registra. Um `ExecutableBlockShell` renderiza a UI compartilhada (header com alias, toggle de display mode, botao Run, estados).

```typescript
// registry — escrito uma vez
class BlockRegistry {
  private blocks = new Map<string, BlockRegistration>()

  register(reg: BlockRegistration) {
    this.blocks.set(reg.type, reg)
  }

  getExtensions(): Node[] {
    return [...this.blocks.values()].map(b => b.node)
  }

  getComponent(type: string) {
    return this.blocks.get(type)?.component
  }
}

// Shell — UI compartilhada por TODOS os blocos
function ExecutableBlockShell({ children, node }) {
  // Renderiza: header (alias, display toggle, run button)
  //            + input/output areas conforme displayMode
  //            + loading/error states
  // children = componente especifico do bloco
}
```

### Estrutura de pastas dos blocos

```
src/components/blocks/
├── registry.ts                 # BlockRegistry (shared, hoje só e2e)
├── executable-block-shell.tsx  # Shell UI (shared, hoje só e2e)
├── http/
│   └── fenced/
│       └── HttpFencedPanel.tsx # CM6 fenced-native panel (epic 24)
├── db/
│   └── fenced/
│       └── DbFencedPanel.tsx   # CM6 fenced-native panel
├── e2e/
│   ├── index.ts                # registry.register(...)
│   ├── node.ts                 # ExecutableBlock.extend(...)
│   └── view.tsx                # E2eBlockView (input + output panels)
└── [futuro-bloco]/             # use o pattern fenced-native (§6)
    └── fenced/
        └── ...Panel.tsx
    └── view.tsx
```

O editor consome o registry na inicializacao:

```typescript
const editor = useEditor({
  extensions: [
    StarterKit,
    ...registry.getExtensions(),
  ],
})
```

---

## 3. Rust — Trait `Executor` + Registry

```rust
#[async_trait]
pub trait Executor: Send + Sync {
    fn block_type(&self) -> &str;
    async fn execute(&self, params: serde_json::Value) -> Result<BlockResult, ExecutorError>;
    async fn validate(&self, params: &serde_json::Value) -> Result<(), String> {
        Ok(()) // default: sem validacao extra
    }
}

pub struct ExecutorRegistry {
    executors: HashMap<String, Box<dyn Executor>>,
}

impl ExecutorRegistry {
    pub fn register(&mut self, executor: Box<dyn Executor>) {
        self.executors.insert(executor.block_type().to_string(), executor);
    }

    pub async fn execute(&self, req: BlockRequest) -> Result<BlockResult, ExecutorError> {
        let executor = self.executors.get(&req.block_type)
            .ok_or(ExecutorError::UnknownType(req.block_type.clone()))?;
        executor.validate(&req.params).await?;
        executor.execute(req.params).await
    }
}
```

### Estrutura de pastas do backend

```
src-tauri/src/
├── main.rs                  # registra executors e Tauri commands
├── executor/
│   ├── mod.rs               # trait Executor + ExecutorRegistry + BlockRequest/BlockResult
│   ├── http.rs              # impl Executor for HttpExecutor
│   ├── db.rs                # impl Executor for DbExecutor
│   └── e2e.rs               # impl Executor for E2eExecutor
├── db/
│   ├── mod.rs               # setup SQLite, migrations
│   ├── connections.rs       # CRUD connections + pool management
│   ├── environments.rs      # CRUD environments + variables
│   ├── block_results.rs     # cache de resultados (invalidado por hash)
│   ├── block_settings.rs    # flags por bloco (follow_redirects, verify_ssl, …)
│   ├── block_examples.rs    # respostas pinadas pelo usuário
│   ├── block_history.rs     # histórico de execução (metadata only, last N)
│   ├── schema_cache.rs      # metadata de tabelas/colunas
│   └── search_index.rs      # FTS5
├── fs/
│   ├── mod.rs               # operacoes de filesystem
│   └── watcher.rs           # file watcher
└── config.rs                # app_config key-value store
```

---

## 4. IPC — Um comando generico com Channel

Em vez de um Tauri command por tipo de bloco, um unico `execute_block` que usa o `block_type` para rotear:

```rust
#[tauri::command]
async fn execute_block(
    request: BlockRequest,           // { block_type: "httpBlock", params: {...} }
    progress: tauri::ipc::Channel<ExecutionEvent>,
    registry: tauri::State<'_, ExecutorRegistry>,
) -> Result<BlockResult, String> {
    progress.send(ExecutionEvent::Started).ok();
    let result = registry.execute(request).await.map_err(|e| e.to_string())?;
    progress.send(ExecutionEvent::Completed).ok();
    Ok(result)
}

#[derive(Serialize, Clone)]
#[serde(tag = "type")]
enum ExecutionEvent {
    Started,
    Progress { percent: u8, message: String },
    StreamChunk { data: serde_json::Value },
    Completed,
}
```

Frontend side:

```typescript
import { invoke, Channel } from '@tauri-apps/api/core'

async function executeBlock(blockType: string, params: unknown) {
  const channel = new Channel<ExecutionEvent>()
  channel.onmessage = (event) => {
    // update execution state in TipTap node attributes
  }

  return invoke('execute_block', {
    request: { block_type: blockType, params },
    progress: channel,
  })
}
```

O `Channel` permite streaming em tempo real (progresso de queries longas, chunks de response HTTP, etc.).

---

## 5. Checklist — Adicionar um novo bloco

| Camada         | O que criar              | O que modificar                              |
| -------------- | ------------------------ | -------------------------------------------- |
| TipTap node    | `blocks/novo/node.ts`    | nada                                         |
| React UI       | `blocks/novo/view.tsx`   | nada                                         |
| Self-register  | `blocks/novo/index.ts`   | nada                                         |
| Rust executor  | `executor/novo.rs`       | `main.rs` — uma linha: `registry.register()` |
| Slash command  | —                        | `slash-commands.ts` — uma entrada no array   |

---

## 6. DB block — caminho nativo CM6

O DB block foge do pattern TipTap + registry e vive inteiramente no CodeMirror 6.
Razoes: (a) o body do bloco e SQL puro, e faz mais sentido deixa-lo no mesmo
buffer CM6 que o resto do markdown — vim mode, undo/redo, search, autocomplete
de `{{refs}}` e schema cache tudo compartilham o mesmo state; (b) o painel de
resultado e grande e dinamico (tabela virtualizada, multi-result, export), o que
fica desajeitado dentro de um NodeView TipTap.

```
┌───────────────── CM6 MarkdownEditor ─────────────────────┐
│                                                          │
│  ```db-postgres alias=db1 connection=prod  ← fence-open  │
│    ↳ substituido por DbToolbarPortalWidget               │
│                                                          │
│  SELECT * FROM t WHERE id = {{ref.response.id}}          │
│    ↳ linha regular do doc com `.cm-db-body-line` +       │
│      SQL highlighter + autocomplete de tabelas/envs      │
│                                                          │
│  ```                                        ← fence-close│
│    ↳ substituido por DbClosePanelWidget                  │
│      (result tabs + status bar)                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
                          │
         registrySlot(blockId, slot, dom) — React portals
                          │
                          ▼
            DbFencedPanel monta no widget DOM
            (Chakra UI v3, ResultTable virtualizada)
```

**Extensao CM6 (`src/lib/codemirror/cm-db-block.tsx`):**

- `findDbBlocks(doc)` escaneia o doc por fences `db`, `db-postgres`, `db-mysql`,
  `db-sqlite` e retorna ranges + metadata (alias, connection, limit, timeout,
  display) via `parseDbFenceInfo`.
- StateField de decoracoes: em reading mode, substitui as linhas de fence por
  `DbToolbarPortalWidget` (header) e `DbClosePanelWidget` (result + statusbar);
  em editing mode (cursor dentro do bloco), mostra as fence lines com styling
  sutil e mantem o close panel como widget `side: 1` depois do close fence.
- `createDbBlockCompletionSource` + `createDbSchemaCompletionSource` alimentam
  o autocomplete global do editor (`{{refs}}` de blocos acima + env vars; tabelas
  e colunas do schema cache pos-FROM/JOIN).

**Painel React (`src/components/blocks/db/fenced/DbFencedPanel.tsx`):**

- Mount via portal no slot registrado pela extensao; um componente por bloco, re-
  renderiza quando `entry.block` muda (via `syncRegistryBlocks`).
- Lifecycle de execucao: resolve refs via `resolveRefsToBindParams` (converte
  `{{ref}}` em bind params `?`/`$N` para evitar SQL injection), streaming via
  Tauri `Channel`, cache local pelo hash.

**Hash de cache (`src/lib/blocks/hash.ts#computeDbCacheHash`):**

Compartilhado entre o writer (`DbFencedPanel`) e o reader (`document.ts#
populateCachedResults`). Formula: `hashBlockContent(body + env_snapshot,
connectionId)`, onde `env_snapshot` junta so as env vars que aparecem como
`{{KEY}}` no body. Isso isola o cache por environment ativo e mantem hash
estavel para queries sem ref a env.

**Por que widgets separados (toolbar + close panel), nao 1 so?**

Motion vertical do CM6 se confunde quando ha cadeia de widgets `block: true`
adjacentes — o probe Y atravessa varios e o cursor teleporta. Com **um** widget
substituindo **um** range doc, `moveVertically` comporta-se. Por isso o close
panel consolida fence-close + result + statusbar num unico widget ao inves de
tres em sequencia.

---

## 7. HTTP block — caminho nativo CM6 com streaming

Mesmo pattern do DB block (fenced-native, painel React via portais), mas com
particularidades de HTTP. Body do fence e formato HTTP-message
(`METHOD URL\n<headers>\n\n<body>`), parser em `src/lib/blocks/http-fence.ts`.
Detalhes completos em `docs/http-block-redesign.md`.

**Executor streamed (`httui-core/src/executor/http/mod.rs`):**

```rust
pub async fn execute_streamed<F>(
    &self,
    params: serde_json::Value,
    cancel: CancellationToken,
    on_chunk: F,
) -> Result<HttpResponse, ExecutorError>
where F: Fn(HttpChunk) + Send,
```

Consome `Response::bytes_stream()` em loop, emitindo:

1. `HttpChunk::Headers { status_code, status_text, headers, ttfb_ms }` — assim
   que `req.send().await` retorna headers. `ttfb_ms` cronometra do dispatch
   ate esse ponto (= "Time to First Byte" no Postman).
2. `HttpChunk::BodyChunk { offset, bytes }` — por chunk yieldado pelo stream.
3. `HttpChunk::Complete(HttpResponse)` — body consolidado + timing total +
   cookies. Frontend grava no cache SQLite a partir desse chunk.

`execute_with_cancel` legacy virou wrapper com callback no-op — todos os
30+ testes legacy continuam validos sem mudanca.

**Memory cap:** body cap absoluto de **100 MB** (`MAX_BODY_BYTES`). Acima
disso o executor retorna `[body_too_large]` antes de copiar mais bytes,
evitando OOM em downloads acidentais (defesa em profundidade — o stream ja
mantem memoria ~constante por chunk de ~16 KB).

**Cancel mid-body:** o `tokio::select!` no loop observa o `CancellationToken`
a cada chunk. Cancel mid-flight retorna `Err("Request cancelled")` e descarta
os bytes parciais (mesmo pattern do DB block). O `executions.rs` Tauri command
converte em `HttpChunk::Cancelled` no wire.

**Timing breakdown (V1):** `total_ms` + `ttfb_ms`. Sub-fields
`dns_ms`/`connect_ms`/`tls_ms` ficam `None` — preenche-los exige trocar
`reqwest` por `isahc`/libcurl. Decisao registrada em
`docs/http-timing-isahc-future.md` com criterios de reabertura. `connection_reused`
fica `false` no V1 pelo mesmo motivo.

**Body viewer (`HttpBodyCM6Viewer` em `HttpFencedPanel.tsx`):** CodeMirror 6
read-only com `oneDarkHighlightStyle` e linguagem selecionada por
`Content-Type` (`json`/`xml`/`html`/`svg`, com fallback heuristico). Substitui
um `<pre dangerouslySetInnerHTML>` + `lowlight` que travava o webview em
respostas de MB.

**Status bar streaming UX:** durante o stream, o `onProgress` callback no
`executeHttpStreamed` notifica os bytes cumulativos recebidos; status bar
mostra `· downloading 1.2 MB…` em vez do indicador de tempo idle.

---

## Referencia

Pattern inspirado no **BlockNote** (editor open-source baseado em TipTap que usa registry + specs para blocos extensiveis).
