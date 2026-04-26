# HTTP Block Redesign — Inline HTTP-Message Format

Status: Spec · Author: product
Escopo: bloco HTTP (`http`). DB block já migrou (ver [`db-block-redesign.md`](./db-block-redesign.md)); E2E block fica para um doc próprio depois.
Objetivo: ser **alternativa viável ao Postman** dentro do fluxo de notas, sem perder a ergonomia do power user.

---

## 1. Problema

O bloco HTTP atual armazena tudo como JSON dentro do fenced code:

````
```http alias=req1
{"method":"POST","url":"...","params":[...],"headers":[...],"body":"..."}
```
````

A renderização passa por `cm-block-widgets.tsx` (esconde a cerca, atomic range) → `BlockAdapter` (cria props falsas de TipTap NodeView) → `HttpBlockView.tsx` (~1k linhas, NodeView legado com N CodeMirrors aninhados em tabs Params/Headers/Body/Settings).

Consequências:

- **Raw .md ilegível** — JSON gigante competindo com prosa do usuário.
- **CM6-in-CM6** — cada InlineCM é uma instância CodeMirror dentro do widget CM6 raiz; bug-prone.
- **Atomic total** — cursor não entra no bloco; sem vim, sem multi-cursor, sem undo unificado.
- **Diff sujo** — qualquer header trocado vira reformat de JSON inteiro.
- **Adapter feio** — `BlockAdapter` sintetiza props TipTap só pra `HttpBlockView` continuar achando que é um NodeView.
- **UI esconde ergonomia** — tabs forçam clicar pra ver headers/params; Postman power user quer tudo à vista.

## 2. Proposta

Reescrever o bloco HTTP como **fenced code nativo** do CM6, no formato HTTP message (RFC-style, compatível com `.http`/`.rest` da REST Client e JetBrains HTTP Client). Body cru = mensagem HTTP. Metadata vai no info string. UI orbita o texto, não o substitui.

Dois modos coexistem no mesmo bloco — **raw** (texto cru, vim-friendly) e **form** (tabular Postman-style). Toggle explícito na toolbar. Fonte de verdade no doc é sempre o raw.

### 2.1 Formato do arquivo

````
```http alias=getUsers timeout=30000 display=split
GET https://api.example.com/users?page=1&limit=10
Authorization: Bearer {{TOKEN}}
Accept: application/json
```
````

POST/PUT/PATCH com body:

````
```http alias=createUser
POST https://api.example.com/users
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "name": "alice",
  "email": "{{user.email}}"
}
```
````

**Tokens do info string:**

- `http` — o lang token único (sem variantes por método; método mora na primeira linha do body).
- `alias=` — identificador de referência (`{{getUsers.response.users.0.id}}`).
- `timeout=` — timeout em ms.
- `display=` — `input` | `split` | `output`.
- `mode=` — `raw` | `form`. Default `raw` quando omitido. Persistido aqui pra sobreviver reloads e ficar diff-friendly por bloco.
- Forma canônica na escrita: `alias → timeout → display → mode`.
- Chaves desconhecidas ignoradas silenciosamente.

**Regras do body (parser):**

1. Primeira linha não-vazia: `METHOD URL`. URL pode incluir query string inline.
2. Linhas seguintes começando com `?`/`&` são **continuação** da query string (quebra por legibilidade — mesma sintaxe do JetBrains). Merge canônico: a URL efetiva é `URL_base + normalized_query`, onde a primeira ocorrência de query vira `?` e todas as demais viram `&`, independente do que o usuário digitou. Parser reformata sempre.
3. Demais linhas até a primeira linha em branco: headers no formato `Key: Value`.
4. Linhas começando com `#` são ignoradas pelo executor. Duas subconvenções:
   - **Exatamente** `# desc:` + espaço inicial = metadata de description **pra linha abaixo** (renderizada como coluna description no form view). Case-sensitive, um espaço entre `#` e `desc:`.
   - Qualquer outro `#` (incluindo `# Key: Value` de header comentado) = disabled/comment livre. Headers comentados aparecem como linhas desabilitadas (checkbox off) no form view. Comments livres não aparecem no form view.
5. Após a primeira linha em branco vem o body cru (até o fim do fence).
6. Cerca com N+1 backticks quando o body tem N backticks consecutivos (CommonMark).

**Regras de emissão canônica (stringifier):**

- Form add de param: **inline** na URL line até ~80 caracteres; a partir daí quebra em continuation lines automaticamente. Idempotente porque reformatta sempre.
- Header adicionado via form: inserido ao final do bloco de headers, antes da primeira linha em branco.
- Descriptions: emitidas como linha `# desc: <text>` acima da linha alvo.
- Disabled rows: emitidas como `# Key: Value` (mesma linha, só com prefixo `#`).
- Body mode pill = **view read-only** derivada do header `Content-Type`. Trocar o pill faz edição cirúrgica **só** no valor do Content-Type; não mexe no body. Trocar entre tipos textuais (`json`/`xml`/`text`) preserva o body. Trocar pra `form`/`multipart`/`binary` com body textual existente dispara **warning toast** e mantém o body até usuário limpar.

### 2.2 Estados visuais

#### Cursor FORA do bloco (reading mode)

```
┌─ HTTP req1 ································  raw│form  ●  ▶  ⤓  ⚙ ─┐
│                                                                     │
│  POST  https://api.example.com/users?page=1                ┌────┐   │
│                                                            │json│▼  │
│                                                            └────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Params (2)  Headers (3)  Body  Tests (4)         [bulk] ✎       ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ☑  page           │ 1                  │ pagination idx  │ ✕    ││
│  │ ☑  limit          │ {{LIMIT}}          │ rows per page   │ ✕    ││
│  │ ☐  cursor         │ {{prev.next}}      │ disabled        │ ✕    ││
│  │ +  add param                                                    ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│  Body  Headers  Cookies (1)  Timing  Tests (4✓)  Raw                │
│  ─────                                                              │
│  [ pretty │ raw │ preview ]                  [ ⊞ visualize ▼ ]      │
│                                                                     │
│  201 Created                                                        │
│  {                                                                  │
│    "id": 42,                                                        │
│    "name": "alice",         ⟵ click direito → "save as variable"    │
│    "tags": ["pro", "alpha"]                                         │
│  }                                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ● 201 · api.example.com · 127ms · 402 B · ran 2m ago · ⌘↵ to run   │
└─────────────────────────────────────────────────────────────────────┘
```

Quando flipa pra **raw**, o mesmo bloco mostra:

```
┌─ HTTP req1 ································  raw│form  ●  ▶  ⤓  ⚙ ─┐
│                                                                     │
│  POST https://api.example.com/users                                 │
│  ?page=1                                                            │
│  &limit={{LIMIT}}                                                   │
│  # &cursor={{prev.next}}    ⟵ # comenta a linha (disabled)          │
│                                                                     │
│  Authorization: Bearer {{TOKEN}}                                    │
│  Content-Type: application/json                                     │
│  # X-Request-Id: {{$uuid}}                                          │
│                                                                     │
│  {                                                                  │
│    "name": "alice"                                                  │
│  }                                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  result panel idêntico                                              │
└─────────────────────────────────────────────────────────────────────┘
```

#### Cursor DENTRO do bloco (editing mode)

```
```http alias=req1
POST https://api.example.com/users
Authorization: Bearer {{TOKEN}}
Content-Type: application/json

{
  "name": "alice",
  "email": "{{user.email}}"
}
```

[ Body  Headers  Cookies  Timing  Tests  Raw ]
201 Created
{ "id": 42, "name": "alice", "created_at": "2026-04-24T22:47:12Z" }

● 201 · api.example.com · 127ms · 402 B · ran 2m ago · ⌘↵ to run
```

- Cercas reveladas, header da toolbar collapsa (igual DB).
- Edição é texto puro: vim, undo unificado, multi-cursor, copy/paste de curl literal.
- Sub-language do body se ativa pelo Content-Type — JSON highlight automático quando `application/json`.
- Result/statusbar continuam visíveis. ⌘↵ executa, ⌘. cancela.

### 2.3 Toolbar (cursor fora)

Ordem da esquerda pra direita:

1. **Identity:** badge `HTTP` · alias · host (derivado da URL, encolhe se necessário).
2. **Mode toggle:** `raw│form` segmented control — visível, não escondido em menu.
3. **Body mode dropdown:** `none / json / xml / text / form-urlencoded / multipart / binary / graphql`. Pill explícito que dirige a UI da tab Body em modo form e adiciona/atualiza `Content-Type` em raw.
4. **Status indicator:** dot pequeno (running/idle/error).
5. **▶ / ⏹** — run quando idle, cancel quando executando.
6. **⤓ Send-as menu** — Copy as cURL · fetch · Python requests · HTTPie · save as `.http` file.
7. **⚙** — abre drawer.

Toolbar some quando cursor está dentro do bloco. Atalhos tomam o lugar: `⌘↵` run, `⌘.` cancel, `⌘⇧C` copy as cURL, `⌘⇧F` format body (quando formatter entrar).

### 2.4 Editing area — abas inteligentes (modo form)

`Params · Headers · Body`. Cada aba é uma view tabular sobre o body cru — toda edição re-emite o texto. Assertions/tests NÃO ficam aqui — use o E2E block pra isso (ver §10).

**Por linha:**
- ☑ enable/disable (checkbox) — disabled prefixa `#` na linha equivalente do raw.
- chave / valor com `{{ref}}` highlight + autocomplete.
- coluna **descrição** (Postman-style; armazenada como `# desc:` na linha acima no raw).
- × delete.

**Bulk edit** (botão `[bulk]` na barra da tab):
- Drop do form → textarea de `key: value` por linha. Cola direta de log/headers HTTP. Postman secret weapon.

**Body tab** (modo form):
- Pill body-mode dirige a UI:
  - `json` / `xml` / `text` → CodeMirror sublanguage com pretty/format.
  - `form-urlencoded` / `multipart` → tabela key/value (multipart aceita `< /path/to/file` pra arquivo).
  - `binary` → file picker.
  - `graphql` → editor GraphQL + Variables panel side-by-side (V2, ver §11).
  - `none` → vazio.

### 2.5 Result panel — paridade Postman

Tabs `Body · Headers · Cookies · Timing · Raw`:

- **Body** — sub-toggle `pretty / raw / preview`.
  - `pretty`: JSON formatado, XML indentado, HTML highlighted.
  - `raw`: texto cru.
  - `preview`: imagem inline, PDF embed, HTML em iframe sandbox (V2 pra HTML).
  - Botão `[ ⊞ visualize ]` quando JSON com tree/tabela.
- **Headers** — tabela request + response (pinning no que importa).
- **Cookies** — tabela domain · name · value · path · expires. Cookie jar persistente por env (V2, ver §11).
- **Timing** — V1: TTFB · Download · Total (DNS/Connect/TLS adiados, ver [`http-timing-isahc-future.md`](./http-timing-isahc-future.md)).
- **Raw** — request + response como texto chapado (debug, copy-paste em ticket).

Assertions/tests estão **fora do HTTP block** — use o E2E block quando precisar validar response (ver §10).

**Responses grandes via streaming:**
- Executor emite chunks via `tauri::Channel<HttpResponseChunk>` (mesmo pattern do DB).
- Shape: `{ kind: "headers", ... } → { kind: "body_chunk", bytes, offset } * → { kind: "done", stats } | { kind: "error", ... }`.
- Viewer é CodeMirror read-only virtualizado — body de qualquer tamanho renderiza sem travar.
- Cache recebe o snapshot final só no `done`; chunks intermediários não persistem.

**Inline magic no Body:**
- Click direito em qualquer valor JSON → `Save as variable` (cria var na env ativa) · `Copy path` · `Copy value`.
- "Save as example" no toolbar do panel — pinpa a resposta atual no drawer pra reuso/docs.

### 2.6 Status bar do bloco

Linha fina sob o result, fonte mono. Exemplo:

```
● 201 · api.example.com · 127ms · 402 B · ran 2m ago · ⌘↵ to run
```

Campos: dot colorido por status class (2xx green / 3xx blue / 4xx orange / 5xx red), host, elapsed, size, "ran X ago" relativo, hint de atalho contextual. Mesmo molde do statusbar do DB.

### 2.7 Drawer (⚙)

```
┌─ Block settings ─────────── × ─┐
│                                │
│  ── Identity ──────────────────│
│  Alias    [req1______________] │
│  Display  [input│split│output] │
│                                │
│  ── Settings ──────────────────│
│  Timeout            [30000 ms] │
│  Follow redirects   [✓]        │
│  Verify SSL         [✓]        │
│  Encode URL auto    [✓]        │
│  Send cookies       [✓]        │
│  Trim whitespace    [✓]        │
│                                │
│  ── Examples ──────────────────│
│  • 201 happy path · pinned     │
│  • 422 invalid email           │
│  • 401 expired token           │
│  + Pin current response        │
│                                │
│  ── History (last 10) ─────────│
│  ✓ 201 · 127ms · 2m ago        │
│  ✗ 401 · 89ms · 3h ago         │
│  ✓ 201 · 145ms · yesterday     │
│  …                             │
│                                │
│  [ Delete block ]              │
└────────────────────────────────┘
```

**History — persistência e privacidade:**

Backing store é SQLite, tabela `block_run_history` com cap default de 10 runs por (file_path + alias). Metadados apenas: método, URL canônica, status, elapsed, tamanhos, timestamp. **Corpo de request/response não persiste** — se quiser re-inspecionar um response, use "Save as example". Toggle opt-out por bloco nas settings do drawer. Purga automática ao deletar o bloco ou a nota. Retention configurável em settings globais.

### 2.8 Features Postman cobertas

| Feature Postman | Onde mora aqui |
|---|---|
| Form-driven edit | Editing area, modo `form` |
| Bulk edit | Botão `[bulk]` em cada tab do form |
| Disable per row | Checkbox no form / `# prefix` no raw |
| Description per row | Coluna no form / `# desc:` linha acima no raw |
| Body modes (json/form/multipart/binary/graphql) | Pill na toolbar dirige UI |
| Variables / environments | `{{ENV}}` e `{{ref}}` (já temos) |
| Pre-request "scripts" | Refs a outro bloco acima ({{login.response.token}}) |
| Tests / assertions | **Fora do HTTP block — use E2E block** |
| Cookies | Tab `Cookies` + jar persistente por env |
| Timing | Tab `Timing` com waterfall |
| Visualize response | Sub-toggle `preview` no Body |
| Save response as example | Botão na toolbar do result + drawer |
| JSON path → variable | Click direito no Body |
| History | Drawer "History" |
| Code generation | Menu ⤓ Send-as |
| Settings (redirects, SSL, etc.) | Drawer Settings |
| Documentation | Markdown ao redor do fence (vantagem nativa do Notes) |
| Collections / sharing | Pasta de notes + git (vantagem nativa) |

---

## 3. Arquitetura

### 3.1 Frontend

**Novo parser de info string + body** (`src/lib/blocks/http-fence.ts`):
```ts
parseHttpFenceInfo(info: string): HttpBlockMetadata
stringifyHttpFenceInfo(meta: HttpBlockMetadata): string

parseHttpMessageBody(body: string): {
  method: HttpMethod;
  url: string;
  params: Array<{ key: string; value: string; enabled: boolean; description?: string }>;
  headers: Array<{ key: string; value: string; enabled: boolean; description?: string }>;
  body: string;
  bodyMode: HttpBodyMode;
}
stringifyHttpMessageBody(parsed): string  // canonical reformat
```

**Extensão CM6** (`src/lib/codemirror/cm-http-block.tsx`):
- Mirror estrutural do `cm-db-block.tsx`.
- `findHttpBlocks(doc)` scanner.
- Decorations: open-fence vira card header; body line classes; close-fence + result widget abaixo.
- `atomicRanges` só nas linhas de cerca (igual DB).
- `transactionFilter` pra navegação entrar/sair com setas.
- Keymap: `Mod-Enter` run, `Mod-.` cancel, `Mod-Shift-c` copy as cURL.
- Sub-language no body: detecta `Content-Type: application/json` e injeta `lang-json` highlighting via `LanguageDescription` na linha de body.
- Highlight do método HTTP (GET=green, POST=blue, PUT=orange, PATCH=yellow, DELETE=red, HEAD=purple, OPTIONS=gray) na primeira linha do body.

**Remoção de `cm-block-widgets.tsx` para `http`:**
- `BLOCK_OPEN_RE` perde o ramo `http`. Fica `(e2e)` até E2E ser refeito.
- `BlockAdapter` perde o ramo `http`.

**React panel** (`src/components/blocks/http/fenced/HttpFencedPanel.tsx`):
- Mirror de `DbFencedPanel.tsx`.
- Estado: `executionState`, `response`, `mode (raw|form)`, `bodyMode`, `tests`.
- Renderiza via `createPortal` em três slots CM6: toolbar, editing-overlay (form mode), result+statusbar.
- Drawer Chakra Portal (não Dialog — preserva foco CM6).

**Form-mode overlay:**
- Quando `mode === "form"`, render do form aparece **sobre** o body cru via portal posicionado.
- Toda edição no form re-emite a body cru via `view.dispatch`.
- Quando `mode === "raw"`, form some, texto cru fica visível direto.

**Result storage — usa cache SQLite (mesmo padrão do DB):**
- Hash `sha256(method + url_canonical + headers + body + env_snapshot)`.
- Cache invalidado quando body muda.
- Mutações HTTP (POST/PUT/PATCH/DELETE) **nunca** servem do cache — sempre re-executam.

**Referências `{{alias.response.path}}`:**
- Resolver atual já cobre. Multi-result não se aplica (HTTP é single response).

### 3.2 Backend (Rust)

**Parser** (`httui-core/src/blocks/parser.rs`):
- `parse_blocks` ramo `http`:
  - Heurística retrocompat: body trim-start começa com `{` e parseia como JSON com `method`/`url` → legado, extrai campos.
  - Caso contrário: parseia HTTP message format (primeira linha = `METHOD URL`, headers, body).
  - Resultado: `ParsedBlock` com `params: JSON { method, url, headers, body, query_params, timeout_ms }`.
- Testes de roundtrip: `parse → stringify → parse` preserva shape.

**Executor** (`httui-core/src/executor/http.rs`):
- Mantém shape de input atual (frontend resolve refs antes de mandar).
- Streaming via `tauri::Channel<HttpResponseChunk>` (igual DB): emite `headers` → `body_chunk*` → `done | error | cancelled`.
- Adiciona `timing: TimingBreakdown { total_ms, ttfb_ms }` no evento `done`. Sub-fields `dns_ms`/`connect_ms`/`tls_ms` ficam `None` no V1 — exigem trocar `reqwest` por `isahc`/libcurl, ver [`http-timing-isahc-future.md`](./http-timing-isahc-future.md).
- Cookies: opt-in por `send_cookies: bool` no request; quando ativo, lê do jar SQLite (V2) e envia no header.

**Shape dos chunks** (`httui-core/src/executor/http/types.rs`):
```rust
pub enum HttpResponseChunk {
    Headers {
        status: u16,
        status_text: String,
        headers: Vec<(String, String)>,
    },
    BodyChunk {
        offset: u64,
        bytes: Vec<u8>,                 // frontend acumula no viewer
    },
    Done {
        timing: TimingBreakdown,
        cookies: Vec<Cookie>,           // Set-Cookie capturado
        size_bytes: u64,
        elapsed_ms: u64,
    },
    Error { message: String, kind: ErrorKind },
    Cancelled,
}
```

**Shape final (pro cache)** quando o `done` chega, frontend monta:
```rust
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: HttpBody,                // text | binary { encoding, data }
    pub timing: TimingBreakdown,
    pub cookies: Vec<Cookie>,
    pub size_bytes: u64,
    pub elapsed_ms: u64,
}
```

**History store** (`httui-core/migrations/00X_block_run_history.sql`):
```sql
CREATE TABLE block_run_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  block_alias TEXT NOT NULL,
  method TEXT NOT NULL,
  url_canonical TEXT NOT NULL,      -- URL + query normalizados
  status INTEGER,                    -- NULL se errored
  request_size INTEGER,
  response_size INTEGER,
  elapsed_ms INTEGER,
  outcome TEXT NOT NULL,             -- success | error | cancelled
  ran_at TEXT NOT NULL               -- ISO-8601 UTC
);
CREATE INDEX idx_brh_block ON block_run_history(file_path, block_alias, ran_at DESC);
```
- Cap default 10 runs por (file_path, alias) — trim no insert.
- **Não** armazena request body nem response body (privacidade). Metadados apenas.
- Purga em cascata quando o bloco é deletado (parser detecta ausência no save).
- Opt-out por bloco via flag `history_disabled` no drawer settings (persiste em settings store, não no info string — não polui o fence).

### 3.3 Cache de resultado

- Chave: `sha256(method + url_canonical + headers_canonical + body_canonical + env_snapshot)`.
- `*_canonical`: trim, ordenação determinística de headers/params (case-insensitive nos keys de header).
- Mutações (POST/PUT/PATCH/DELETE): **sempre** re-executam, nunca servem do cache. Detecção por método.
- Migração: invalidar tudo é seguro (cache).

---

## 4. Navegação e interação

### 4.1 Modo raw
- `←↑→↓` navegam dentro do body como texto normal.
- `Cmd+A` seleciona doc inteiro (CM6 default).
- Seta ↓ de fora entra na primeira linha do body.
- Seta ↓ na última linha do body pula a cerca de fechamento.
- `atomicRanges` só nas linhas de cerca; conteúdo é editável.
- Vim, multi-cursor, undo/redo unificados — tudo via CM6 raiz.

### 4.2 Modo form
- Tab `Params` / `Headers` / `Body` / `Tests` com Tab key navegação.
- Bulk edit `[bulk]` toggle por tab — drop do form para textarea key:value.
- Por linha: Tab navega key → value → description → checkbox → ✕.
- `Cmd+Enter` em qualquer campo do form executa o request.

### 4.3 Toggle raw ↔ form
- Segmented control na toolbar.
- Sem perda: form re-parseia body cru a cada toggle.
- Edge cases: linha mal-formatada vira "raw lines" em modo form (não é dropada).

### 4.4 Slash commands
- `/http`, `/http-get`, `/http-post`, `/http-put`, `/http-delete` em `cm-slash-commands.ts`.
- Template `/http`: insere fence vazio com `alias=req1` e cursor pousa na linha do método.
- Variantes pre-preenchem o método mas `connection=` continua omitido (não aplicável a HTTP).

---

## 5. Migração

### 5.1 Estratégia — conversão silenciosa na leitura, **sem feature flag**

Mesma estratégia do DB block (ver `db-block-redesign.md` §5):

1. Parser detecta body que é JSON com chave `method`/`url` → formato legado.
2. Extrai campos do JSON, monta HTTP message format em memória.
3. Não salva automaticamente — conversão on-read. Próxima edição salva no novo formato.

### 5.2 Code path
- `httui-core/src/blocks/parser.rs`: ramo `http` com heurística JSON vs HTTP-message.
- Frontend `parseHttpMessageBody` + `parseLegacyHttpBody` (shim curto).
- MCP `httui-mcp` herda via `httui-core`.

### 5.3 Pós-migração

Depois de 1-2 releases estáveis: remover branch JSON legado do parser (opcional).

---

## 6. Dependências externas

| Feature | Pacote | Já instalado? | Tamanho aprox |
|---|---|---|---|
| HTTP syntax highlight | `@codemirror/lang-http` ou custom | Não | ~5kb |
| JSON sub-language | `@codemirror/lang-json` | Sim | – |
| XML sub-language | `@codemirror/lang-xml` | Verificar | ~6kb |
| GraphQL editor (V2) | `cm6-graphql` | Não | ~30kb |
| HTTP timing (V1: total + ttfb) | `Instant` no executor (zero deps) | Sim | – |
| HTTP timing breakdown completo (V2) | `isahc` + libcurl `getinfo` | Não — ver [`http-timing-isahc-future.md`](./http-timing-isahc-future.md) | rewrite |
| Cookie jar (V2) | `cookie_store` crate | Não | ~10kb |

---

## 7. Edge cases

1. **Bloco sem alias** — toolbar mostra `HTTP` só. Refs impossíveis. OK.
2. **URL multi-linha (`?param` continuation)** — parser concatena com a primeira linha.
3. **Body com linha em branco interna** — preserva. Separador é a *primeira* linha em branco após headers.
4. **Header `Authorization: Bearer ...` com `:` no valor** — split só no primeiro `:`.
5. **Body em formato não-JSON com `{` inicial** — heurística JSON-legado checa `parseable + has method/url`, não só `starts_with({)`.
6. **Cerca de fechamento ausente** — parser estende até EOF. Toolbar renderiza, usuário corrige.
7. **Body contém ` ``` `** — escritor usa N+1 backticks na cerca.
8. **Bloco legado JSON** — retrocompat via heurística no parser.
9. **Multi-line URL com whitespace** — primeira linha = `METHOD\sURL`; whitespace no meio = bug, parser falha gracioso.
10. **Mutação cacheada via toggle de modo** — toggle raw↔form não dispara execução; cache não muda.
11. **Form mode com body em `binary`** — file picker no drawer; raw fica `< /path/to/file`.
12. **GraphQL body sem schema** — V2 path; V1 não suporta.
13. **Cookies com `Domain=`/`Path=` complexos** — V2 jar respeita RFC 6265.
14. **Statement destrutivo** — não aplicável (HTTP não tem o conceito; semântica vem do método).
15. **Vim mode atravessando cerca** — mesmo plano do DB (test).

---

## 8. Testes

- **Parser** (vitest + parser_tests.rs): info string com metadata, body multi-linha, cerca N-backticks, roundtrip determinístico, heurística JSON vs HTTP-message, query continuation, comments `#`.
- **CM6 decoração** (vitest): `findHttpBlocks` separa http de db/e2e; toolbar/result widgets nas posições; method coloring na primeira linha.
- **Navegação** (playwright): cursor entra/sai com setas; undo/redo; vim `j/k` atravessa cerca; multi-cursor; toggle raw/form sem perda.
- **Form ↔ raw** (RTL): edição em form re-emite raw idempotente; comments `#` viram disabled checkbox.
- **Bulk edit** (RTL): cola key:value, parse no-op, save reflete.
- **Execução** (integração): ▶ dispara `execute_block`, response chega, cancel interrompe, mutation não cacheia.
- **Tests inline** (integração): assertion pass/fail, badge atualiza, mensagem clara.
- **Cookie jar V2** (integração): set-cookie persiste, próximo request envia Cookie header quando opt-in.
- **Timing** (integração): `total_ms` e `ttfb_ms` plausíveis; `ttfb_ms ≤ total_ms`. Sub-fields DNS/Connect/TLS adiados (V2 via isahc).
- **Code generation** (vitest): cURL/fetch/Python output válido, refs resolvidas.

---

## 9. Plano de entrega

Mesma filosofia do DB redesign — entregas mergeable, vault nunca quebra. Sete etapas.

### Etapa 1 — Retrocompat parser (zero mudança visível)

- `parseHttpMessageBody` + `parseLegacyHttpBody` no frontend.
- Branch heurístico no `httui-core/src/blocks/parser.rs`.
- Testes de roundtrip nos dois formatos.
- **Invariante:** UI não muda. Vault antigo continua 100%. Novo formato escrito à mão já é parseado.

### Etapa 2 — Response shape estendido + streaming

- `HttpResponseChunk` enum (Headers/BodyChunk/Done/Error/Cancelled) e shape final `HttpResponse` com `timing` + `cookies[]` (cookies persistente jar fica V2).
- Executor `http.rs` vira streamed: abre request, emite `Headers`, consome body em pedaços pro `BodyChunk`, finaliza com `Done`.
- Cancel via `CancellationToken` (mesmo pattern do DB).
- `timing`: V1 mede `total_ms` (in-out do `req.send()` + body stream) e `ttfb_ms` (cronometra `req.send()` retornar antes de consumir body). DNS/Connect/TLS ficam `None` — exigem trocar reqwest por isahc/libcurl (ver [`http-timing-isahc-future.md`](./http-timing-isahc-future.md)).
- Frontend: hook subscreve ao channel, acumula bytes no CM6 viewer read-only virtualizado, grava no cache SQLite só quando `Done` chega.
- **Invariante:** comportamento idêntico, shape preparado, responses de MB renderizam sem travar.

### Etapa 3 — CM6 fenced render + navegação

- `cm-http-block.tsx` com fenced rendering, decorations, atomic só nas cercas.
- `transactionFilter` pra entrar/sair do bloco com setas.
- Method coloring na primeira linha do body.
- Sub-language JSON highlight no body quando `Content-Type: application/json`.
- Remove ramo `http` de `cm-block-widgets.tsx` e `BlockAdapter`.
- Slash commands atualizados (`/http`, `/http-get`, `/http-post`, etc.).
- **Invariante:** bloco renderiza, edita, navega. Sem ▶ ainda — debug temporário até Etapa 4.

### Etapa 4 — Toolbar, drawer, execução, status bar

- `HttpFencedPanel` com toolbar (identity, mode toggle, body mode pill, run/cancel, send-as, settings).
- Drawer (alias, display, timeout, follow redirects, verify SSL, encode URL, trim).
- ▶ executa via cache + `executeBlock`. ⌘↵ run, ⌘. cancel.
- Status bar: dot por status class, host, elapsed, size, last run, hint.
- Result panel básico: tabs `Body / Headers / Raw` (Cookies e Timing entram na Etapa 6).
- **Invariante:** bloco totalmente usável como substituto do atual.

### Etapa 5 — Form mode + bulk edit

- Toggle `raw│form` na toolbar, persistido no info string (`mode=raw|form`, default `raw`).
- Form com tabs Params/Headers/Body, linhas com checkbox/key/value/description/×.
- Bulk edit textarea por tab.
- Body mode pill (none/json/xml/text/form/multipart/binary) como view read-only derivada do header `Content-Type`. Trocar o pill faz edição cirúrgica só no valor do Content-Type; warning toast ao trocar pra tipo incompatível com body existente.
- Convenção `# linha` = disabled, **exatamente** `# desc:` acima = description (case-sensitive).
- Form add de param: inline até ~80 caracteres na URL line, continuation automática acima disso. Canonical reformatter preserva idempotência.
- **Invariante:** Postman ergonomics back. Raw continua como fonte de verdade.

### Etapa 6 — Result panel rico + SQLite history

- Tabs `Cookies` (lista) e `Timing` (waterfall) entram.
- Body sub-toggle `pretty / raw / preview`. Preview pra image/PDF inline.
- Click direito no JSON → `Save as variable` / `Copy path`.
- "Save as example" no toolbar do panel.
- Migration SQLite `00X_block_run_history.sql` (ver §3.2 pra schema).
- Tauri commands: `list_block_history(file_path, alias)`, `purge_block_history(file_path, alias)`.
- Insert on run: metadados apenas (método, URL canônica, status, elapsed, sizes, timestamp) — **nunca** body de request/response.
- Trim no insert mantém últimos 10 por (file_path, alias).
- Drawer: sections "Examples" (exemplos pinados, persistidos em `block_results` via flag) e "History (last 10)" (leitura da tabela nova).
- Settings drawer: toggle `history_disabled` por bloco, retention global em settings store.
- Purga em cascata: ao deletar bloco/nota.
- **Invariante:** result panel paridade Postman exceto cookies persistentes e HTML preview.

### Etapa 7 — Send-as code generation

- Menu ⤓ Send-as: Copy as cURL, fetch (JS), Python requests, HTTPie, save as `.http` file (file dialog Tauri).
- Refs `{{...}}` já resolvidas no snippet gerado (cURL fica usável colado em terminal).
- Encoding correto (escape de quotes, URL-encode de query, etc.).
- `Mod-Shift-c` → Copy as cURL direto.
- **Invariante:** feature set V1 completo.

### Etapa 8 — Limpeza

- Remove `src/components/blocks/http/HttpBlockView.tsx`.
- Remove `src/components/blocks/http/node.ts`.
- Remove ramo `http` de `BlockAdapter`.
- Atualiza `SPEC.md` e `ARCHITECTURE.md`.
- Depois de 1-2 releases: remove branch JSON legado do parser (opcional).

Cada etapa é mergeable. Nenhuma deixa o app num estado quebrado para vaults existentes.

---

## 10. Não-objetivos

- DB e E2E blocks **não** mudam aqui. E2E vai pra próprio doc (provavelmente `e2e-block-redesign.md`).
- **Tests / assertions inline no HTTP block** — propositalmente fora. Para validar response use o E2E block, que foi feito exatamente pra isso e já existe.
- **Auth helpers** (Bearer/Basic/OAuth2 sugar) — descartado por decisão de produto. Headers + refs cobrem.
- **Pre-request scripts (JS)** — refs entre blocos cobrem o caso real.
- **Mock servers / Monitor** — fora do escopo.
- **Workspaces compartilhados Postman-style** — git + arquivos do vault cumprem.
- **Bibliotecas de "Collections"** — uma collection é uma pasta no vault.

---

## 11. Riscos / decisões abertas

### V2 (confirmados)

1. **GraphQL body mode** — UI dedicada com Variables panel é trabalho não-trivial. V1 trata GraphQL como `text` body.
2. **Cookie jar persistente por env** — precisa store SQLite + UI de revogação + privacy review. V1 mostra cookies da response na tab Cookies, mas não persiste.
3. **HTML preview com iframe sandbox** — segurança não-trivial (CSP, sandbox attrs, isolamento). V1 só preview de imagem/PDF.

### Riscos de implementação

4. **Form ⇄ raw idempotência** — toggling repetidamente não pode driftar o texto. Mitigação: `stringifyHttpMessageBody` é total e canônico; testes de fixed-point.
5. **Body mode `multipart/form-data` em raw** — fica feio em texto cru por design. Mitigação: drawer tabular reescreve só a parte do body, não o todo. Aceitar limitação no raw.
6. **Performance do form overlay** — re-render a cada keystroke pode pesar em blocos grandes. Mitigação: debounce + diff de tokens (igual `cm-db-block` faz).
7. **Bulk edit perde formatação** — concat de linhas key:value não preserva descriptions/disabled flags se usuário editar e voltar. Mitigação: bulk parser detecta `# desc:` lines, mantém metadados; ou aceita perda como tradeoff (Postman também perde).
8. **`@codemirror/lang-http`** — pacote externo pode não cobrir todos os casos. Plano B: highlighting custom hand-rolled (relativamente simples — método + headers + body section).

### Abertos — decidir durante implementação

9. **Examples storage** — reuso de `block_results` com flag `is_example` ou tabela nova? Decidir ao atacar Etapa 6.
10. **`.http` compat level** — suportamos **um** request por fence (copy-paste de cURL/Postman/JetBrains funciona); multi-request `.http` files (separados por `###`), `@var = value` pré-definidas e `> {% script %}` **não** são suportados. Documentar no spec final.
11. **Response body size cap visual** — streaming + CM6 virtualizado deve aguentar, mas executor pode precisar de cap absoluto em memória (1GB?) pra não OOM. Decidir ao implementar Etapa 2.
12. **Query encoding na emissão** — "Encode URL auto" no drawer: encoda só o value de params? Path também? Postman encoda values por default; seguimos isso salvo override.
13. **Form add → inline vs continuation** — heurística ~80 chars resolvida (ver §2.1). Abertura: user pode forçar estilo via setting global "always inline" / "always continuation"? Fica no V2 se aparecer demanda.
14. **Streaming cancel mid-body** — se user cancela durante `BodyChunk`, mostra partial ou descarta? Sugestão: preserva o que chegou + badge "cancelled at Xkb" (mesmo pattern do DB). Confirmar ao implementar.

### Privacidade — history

- SQLite `block_run_history` armazena **apenas metadados** (método, URL canônica, status, elapsed, sizes, timestamp). **Nenhum body** de request/response persiste.
- Cap de 10 runs por bloco (trim no insert). Retention configurável globalmente.
- Opt-out por bloco via toggle no drawer (`history_disabled` em settings store).
- Purga em cascata ao deletar bloco/nota.
