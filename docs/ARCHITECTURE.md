# Notes — Arquitetura

## Principio central

**Open/Closed** — cada novo bloco e uma pasta nova, sem tocar no codigo existente.

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

// Novo bloco = novo .extend(), zero mudancas no base
const HttpBlock = ExecutableBlock.extend({
  name: 'httpBlock',
  addAttributes() {
    return {
      ...this.parent?.(),  // herda displayMode, state, alias...
      method: { default: 'GET' },
      url: { default: '' },
      headers: { default: {} },
      body: { default: '' },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(HttpBlockView)
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
├── registry.ts                 # BlockRegistry (shared)
├── executable-block-shell.tsx  # Shell UI (shared)
├── http/
│   ├── index.ts                # registry.register(...)
│   ├── node.ts                 # ExecutableBlock.extend(...)
│   └── view.tsx                # HttpBlockView (input + output panels)
├── db/
│   ├── index.ts
│   ├── node.ts
│   └── view.tsx
├── e2e/
│   ├── index.ts
│   ├── node.ts
│   └── view.tsx
└── [futuro-bloco]/             # adicionar pasta = adicionar feature
    ├── index.ts
    ├── node.ts
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
│   ├── block_results.rs     # cache de resultados
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

## Referencia

Pattern inspirado no **BlockNote** (editor open-source baseado em TipTap que usa registry + specs para blocos extensiveis).
