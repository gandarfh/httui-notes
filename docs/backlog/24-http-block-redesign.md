# Epic 24 — HTTP Block Redesign

Reescrita do bloco HTTP como **fenced code nativo** do CM6 (formato HTTP message — `.http`/`.rest` compatível), substituindo o NodeView TipTap legado e o adapter ad-hoc. Objetivo: alternativa viável ao Postman dentro do fluxo de notas.

**Depende de:** Epic 07 (HTTP Client — executor existente), Epic 16 (Database Security — pattern de cache/hash), o refactor do DB block já entregue (referência arquitetural).
**Desbloqueia:** redesign futuro do E2E block (mesma estratégia, ainda não escopado).

Referência: [`docs/http-block-redesign.md`](../http-block-redesign.md) — spec completo com mockups ASCII e plano de entrega em 8 etapas.

---

## Story 24.1 — Retrocompat parser

> Etapa 1 do spec. Preserva vault antigo enquanto destrava o formato novo.

### Tasks

- [ ] Criar `src/lib/blocks/http-fence.ts` com `parseHttpFenceInfo` / `stringifyHttpFenceInfo` (canonical: `alias → timeout → display → mode`)
- [ ] Suportar `mode=raw|form` no info string (default `raw` quando omitido)
- [ ] Implementar `parseHttpMessageBody(body)` que reconhece o formato HTTP message (METHOD/URL na linha 1, query continuation com `?`/`&`, headers `Key: Value`, blank line, body cru)
- [ ] URL canonical merge: primeira query → `?`, demais → `&`, independente do que user digitou
- [ ] Convenção `# desc:` (case-sensitive, um espaço) = description da linha abaixo; `#` bare = disabled/comment
- [ ] Implementar `parseLegacyHttpBody(body)` que detecta JSON com `method`/`url` e converte pro shape novo
- [ ] Implementar `stringifyHttpMessageBody(parsed)` canônico e idempotente (reformatter total)
- [ ] Form-driven add de param: inline na URL até ~80 chars, continuation line acima disso
- [ ] Testes vitest: roundtrip nos dois formatos, query continuation, merge de query inline+continuation, comments, `# desc:` vs bare `#`, edge cases (multi-line body, blank lines internas, fence N-backticks)
- [ ] Testes de idempotência: parse → stringify → parse → stringify produz mesmo output (fixed-point)
- [ ] Backend `httui-core/src/blocks/parser.rs`: ramo `http` com mesma heurística JSON-vs-HTTP-message
- [ ] Testes Rust: roundtrip + heurística

**Invariante:** UI não muda. Vault antigo continua 100%. Novo formato escrito à mão é parseado.

## Story 24.2 — Response shape estendido + streaming

> Etapa 2. Prepara result panel rico e responses grandes sem mudar UI.

### Tasks

- [ ] `httui-core/src/executor/http/types.rs`: enum `HttpResponseChunk { Headers, BodyChunk, Done, Error, Cancelled }` + shape final `HttpResponse` com `TimingBreakdown { dns_ms, connect_ms, tls_ms, ttfb_ms, total_ms }` e `cookies: Vec<Cookie>`
- [ ] Executor `http.rs` vira streamed:
  - [ ] Abre request via reqwest com body streaming ativo
  - [ ] Emite `Headers` chunk após status line + headers
  - [ ] Consome body em pedaços (8KB default) emitindo `BodyChunk { offset, bytes }`
  - [ ] Emite `Done { timing, cookies, size_bytes, elapsed_ms }` ao fim
  - [ ] Emite `Error { message, kind }` em falha; `Cancelled` em cancel mid-body
- [ ] `timing` via reqwest middleware (DNS resolver + connect/TLS/TTFB hooks)
- [ ] `cookies` populado a partir do header `Set-Cookie` da response (V1 só captura, jar persistente é V2)
- [ ] Cancel: `CancellationToken` sinalizado por `cancel_block` Tauri command (mesmo pattern do DB); executor aborta e emite `Cancelled` com bytes parciais recebidos
- [ ] Frontend `streamedExecution.ts` extensão: `executeHttpStreamed({ executionId, params, signal })` expõe iterável de chunks + outcome final
- [ ] Frontend acumula `BodyChunk` num buffer e alimenta CM6 read-only viewer virtualizado
- [ ] Cache SQLite grava só no `Done` — chunks intermediários não persistem
- [ ] Frontend `types.ts`: tipo expandido `HttpResponse` + shim para responses cacheadas legacy
- [ ] `normalizeHttpResponse(raw)` aceita shape legacy e shape novo (igual `normalizeDbResponse` do DB)
- [ ] Testes integração: timing breakdown plausível (soma ≤ total), Set-Cookie parseado, streaming de response grande (10MB) termina sem OOM, cancel mid-body retorna partial
- [ ] Testes frontend: buffer acumula chunks corretamente, CM6 viewer renderiza progressivamente

**Invariante:** comportamento idêntico ao atual; shape preparado pro result panel rico; responses de MB renderizam sem travar.

## Story 24.3 — CM6 fenced render + navegação

> Etapa 3. Bloco vira nativo do CM6, sem NodeView nem BlockAdapter.

### Tasks

- [ ] Criar `src/lib/codemirror/cm-http-block.tsx` (mirror de `cm-db-block.tsx`)
  - [ ] `findHttpBlocks(doc)` scanner
  - [ ] Decorations: open-fence vira card header em reading mode; body line classes; close-fence + result widget
  - [ ] `atomicRanges` só nas linhas de cerca; conteúdo editável
  - [ ] `transactionFilter` pra entrar/sair do bloco com setas
  - [ ] Keymap: `Mod-Enter` run, `Mod-.` cancel, `Mod-Shift-c` copy as cURL
- [ ] Method coloring na primeira linha do body (GET=green, POST=blue, PUT=orange, PATCH=yellow, DELETE=red, HEAD=purple, OPTIONS=gray) via `Decoration.mark`
- [ ] Sub-language no body: detecta `Content-Type: application/json` no header e injeta `lang-json` highlighting via `LanguageDescription`
- [ ] Highlight de `{{ref}}` no body inteiro (reusa `cm-references.ts`)
- [ ] Autocomplete `{{` dentro do body (reusa `createReferenceCompletionSource`)
- [ ] Atualizar `slashCommands.ts`: substituir `/HTTP Request` (JSON legado) por `/http`, `/http-get`, `/http-post`, `/http-put`, `/http-delete`. Templates inserem fence vazio + `alias=req1`, cursor pousa na linha do método
- [ ] Remover ramo `http` de `BLOCK_OPEN_RE` em `cm-block-widgets.tsx` e do `BlockAdapter`
- [ ] Wire `cm-http-block` no `MarkdownEditor`
- [ ] Criar `src/components/editor/HttpWidgetPortals.tsx` (mirror de `DbWidgetPortals`)
- [ ] Testes vitest: `findHttpBlocks` separa http de db/e2e; method coloring; sub-language toggling
- [ ] Testes playwright: cursor entra/sai com setas; vim `j/k` atravessa cerca; multi-cursor; undo unificado

**Invariante:** bloco renderiza, edita, navega. Sem ▶ ainda — debug temporário até a próxima story.

## Story 24.4 — Toolbar, drawer, execução, status bar

> Etapa 4. Bloco totalmente usável como substituto do atual.

### Tasks

- [ ] Criar `src/components/blocks/http/fenced/HttpFencedPanel.tsx` (mirror de `DbFencedPanel.tsx`)
- [ ] Toolbar (cursor fora):
  - [ ] Identity: badge HTTP · alias · host (derivado da URL, encolhe)
  - [ ] Mode toggle `raw│form` (segmented control — em V1 só `raw` funciona; `form` é stub até Story 24.5)
  - [ ] Body mode pill (`none / json / xml / text / form / multipart / binary`); ao trocar, atualiza/insere `Content-Type` no body cru
  - [ ] Status indicator (dot pequeno)
  - [ ] ▶/⏹ Run/Cancel
  - [ ] ⤓ Send-as menu (stub em V1; full em Story 24.7)
  - [ ] ⚙ Settings
- [ ] Drawer (Chakra Portal, não Dialog):
  - [ ] Identity (alias, display)
  - [ ] Settings (timeout, follow redirects, verify SSL, encode URL auto, send cookies, trim whitespace)
  - [ ] Delete block
- [ ] Execução:
  - [ ] Resolve refs no body cru (reusa `resolveAllReferences`)
  - [ ] Chama `execute_block` com shape atual (parser converte body novo → JSON do executor)
  - [ ] Mutações (POST/PUT/PATCH/DELETE) **nunca** servem do cache; sempre re-executam
  - [ ] Cache hash: `sha256(method + url_canonical + headers_canonical + body_canonical + env_snapshot)`
- [ ] Status bar:
  - [ ] Dot por status class (2xx green / 3xx blue / 4xx orange / 5xx red)
  - [ ] Host, elapsed, size, "ran X ago" relativo, hint contextual
- [ ] Result panel básico (Body / Headers / Raw) — Cookies/Timing/Tests entram nas próximas stories
- [ ] Atalhos: ⌘↵ run dentro do bloco, ⌘. cancel
- [ ] Testes RTL: drawer abre/fecha, execução flui ponta-a-ponta, refs resolvidas, status bar atualiza

**Invariante:** bloco totalmente usável como substituto do `HttpBlockView` atual.

## Story 24.5 — Form mode + bulk edit

> Etapa 5. Postman ergonomics back, raw permanece fonte de verdade.

### Tasks

- [ ] Implementar form overlay sobreposto ao body cru via portal posicionado
- [ ] Tabs do editing: `Params · Headers · Body` (sem Tests — use E2E block pra assertions)
- [ ] Toggle `raw│form` na toolbar persistido no info string como `mode=raw|form`; default `raw`
- [ ] Por linha (Params/Headers):
  - [ ] Checkbox enable/disable (disabled prefixa `#` no raw)
  - [ ] Inputs key/value com `{{ref}}` highlight + autocomplete
  - [ ] Coluna description — emitida como `# desc:` (case-sensitive, um espaço) linha acima no raw
  - [ ] Botão `×` delete
  - [ ] Botão `+ add row`
- [ ] Form add de param: inline na URL line até ~80 caracteres, continuation line acima disso. Canonical reformatter preserva idempotência
- [ ] Body mode pill (none/json/xml/text/form-urlencoded/multipart/binary/graphql) como **view read-only derivada do header `Content-Type`**:
  - [ ] Trocar o pill faz edição cirúrgica só no valor do header `Content-Type` (não mexe no body)
  - [ ] Trocar entre tipos textuais (`json`/`xml`/`text`) preserva body
  - [ ] Trocar pra `form`/`multipart`/`binary` com body textual existente dispara warning toast e mantém body até user limpar
- [ ] Body tab dirigido pelo body mode pill:
  - [ ] `none`: vazio
  - [ ] `json` / `xml` / `text`: CodeMirror sublanguage com pretty/format
  - [ ] `form-urlencoded` / `multipart`: tabela key/value (multipart aceita `< /path/to/file`)
  - [ ] `binary`: file picker
  - [ ] `graphql`: stub (V2)
- [ ] Bulk edit por tab (botão `[bulk]`):
  - [ ] Drop do form → textarea key:value
  - [ ] Parse de volta preserva `# desc:` e disabled
- [ ] Toggle `raw│form` re-parseia body cru a cada flip; testes de fixed-point garantem idempotência
- [ ] Testes RTL: edição em form re-emite raw; comments `#` viram disabled; bulk edit roundtrip
- [ ] Testes de idempotência: toggle raw↔form N vezes não muda o texto cru
- [ ] Edge cases: linhas mal-formatadas viram "raw lines" no form (não dropadas); `# desc:` case-sensitive é respeitado

**Invariante:** Postman ergonomics dentro do mesmo bloco. Raw continua como fonte de verdade.

## Story 24.6 — Result panel rico + SQLite history

> Etapa 6. Paridade Postman no resultado + persistência leve de metadados de execução.

### Tasks

- [ ] Result tabs adicionais: `Cookies`, `Timing`
- [ ] **Cookies tab:** tabela domain · name · value · path · expires (vazia se não houver Set-Cookie)
- [ ] **Timing tab:** waterfall horizontal (DNS · Connect · TLS · TTFB · Download · Total) com barras coloridas
- [ ] **Body tab** sub-toggle `pretty / raw / preview`:
  - [ ] `pretty`: JSON formatado, XML indentado, HTML highlighted
  - [ ] `raw`: texto cru
  - [ ] `preview`: imagem inline, PDF embed (HTML iframe é V2)
- [ ] Botão `[ ⊞ visualize ]` quando JSON com tree/tabela (visualizador estilo JsonView)
- [ ] Click direito em valor JSON do Body:
  - [ ] `Save as variable` (cria var na env ativa com path)
  - [ ] `Copy path`
  - [ ] `Copy value`
- [ ] Botão "Save as example" no toolbar do result panel
- [ ] Drawer "Examples" section: lista de responses pinned, click pra restaurar

### SQLite history

- [ ] Migration `httui-core/migrations/00X_block_run_history.sql`:
  ```sql
  CREATE TABLE block_run_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    block_alias TEXT NOT NULL,
    method TEXT NOT NULL,
    url_canonical TEXT NOT NULL,
    status INTEGER,
    request_size INTEGER,
    response_size INTEGER,
    elapsed_ms INTEGER,
    outcome TEXT NOT NULL,
    ran_at TEXT NOT NULL
  );
  CREATE INDEX idx_brh_block ON block_run_history(file_path, block_alias, ran_at DESC);
  ```
- [ ] Rust commands: `list_block_history(file_path, alias) -> Vec<HistoryEntry>`, `purge_block_history(file_path, alias)`
- [ ] Insert on successful/failed run — **apenas metadados**, nunca body
- [ ] Trim automático: mantém últimos 10 por (file_path, alias) após cada insert
- [ ] Purga em cascata: ao deletar bloco (parser detecta remoção) ou nota (via watcher)
- [ ] Toggle `history_disabled` por bloco no drawer settings (persistido em settings store, não no info string)
- [ ] Retention global configurável em settings (default 10, min 0 = history off)
- [ ] Drawer "History (last 10)" section: lista compacta `status · elapsed · "ran X ago"` lendo da tabela
- [ ] Testes RTL: tabs renderizam corretamente, save-as-variable cria env var, examples persistem
- [ ] Testes history: insert grava só metadados, trim respeita cap, purga funciona em cascata, opt-out previne insert

**Invariante:** result panel paridade Postman exceto cookies persistentes (V2) e HTML preview (V2). History persistido com privacy-by-default.

## Story 24.7 — Send-as code generation ✅ done (TUI clipboard, 2026-04-27)

> Etapa 7. Feature set V1 completo. (Tests inline foram descartados — use o E2E block para assertions.)

### Tasks (desktop)

- [ ] Send-as menu (⤓ na toolbar):
  - [ ] Copy as cURL (refs resolvidas, escape de quotes, URL-encode de query)
  - [ ] Copy as fetch (JavaScript — `await fetch(...)` com options válido)
  - [ ] Copy as Python requests
  - [ ] Copy as HTTPie (comando CLI `http METHOD url headers body`)
  - [ ] Save as `.http` file (Tauri file dialog; exporta um request no formato do fence)
- [ ] `Mod-Shift-c` dentro do bloco → Copy as cURL direto (sem abrir menu)
- [ ] Refs `{{...}}` resolvidas via `resolveAllReferences` antes do output — snippet gerado tem valores finais, não placeholders
- [ ] Testes vitest: cURL/fetch/Python/HTTPie output válido (round-trip de parsing), refs resolvidas, encoding correto (JSON quotes, URL `+`)
- [ ] Testes RTL: menu abre/fecha, shortcut dispara direto, `.http` save chama Tauri dialog

### Entregue na TUI (2026-04-27)

- [x] **Lib pura `httui-core::blocks::http_codegen`** — port de `src/lib/blocks/http-codegen.ts`. 5 funções: `to_curl`, `to_fetch`, `to_python`, `to_httpie`, `to_http_file`. URL-encoding via `percent-encoding` crate; shell-quote single-quote `'…'\''…'`; JS/Python escape `\\`/`'`/`\n`. Body só pra POST/PUT/PATCH/DELETE (mirror JS). Empty keys dropped (mirror parser).
- [x] **Picker `gx` block-type aware** — `BlockExportFormat` enum com `DB_FORMATS` (CSV/JSON/Markdown/INSERT) e `HTTP_FORMATS` (cURL/Fetch/Python/HTTPie/.http). `DbExportPickerState.formats: &'static [...]` snapshotted no open. Open validation: HTTP precisa de URL não vazia (não precisa de result), DB precisa de SELECT result com ≥1 row.
- [x] **Confirm dispatch** — `confirm_export_picker` faz match por format e roteia pra `db_export::*` ou `http_codegen::*`. Status summary distinto pra DB (`X rows`) vs HTTP (só bytes).
- [x] **Header chip line** atualizada: HTTP blocks mostram `r run · gh history · gx export`; DB mantém `gx export · gs settings`.
- [x] **Tests:** 11 unit tests no `httui-core::blocks::http_codegen` (cURL multi-line+escape, fetch headers/body, Python skip empty blocks, HTTPie `==`/`:` syntax, .http file format, percent-encoding, empty-key drop).

**Pendente na TUI (V2 / pequeno):**
- [x] **`<C-S-c>` direct shortcut** — implementado 2026-04-27. `kb::matches_copy_as_curl` aceita `CTRL+SHIFT+'C'` e bare `CTRL+'C'` (terminals diferentes encodam diferente); plain `<C-c>` lower-case continua como cancel intercept no top do dispatch. Resolve refs antes do output, mesma flow do gx picker.
- [x] **Resolver `{{refs}}` antes do output** — implementado 2026-04-27. `confirm_export_picker` HTTP path e `copy_as_curl` ambos chamam `resolve_in_http_params` antes de `to_*`. Snippets gerados ficam aplicáveis (cURL/Fetch que rodam direto sem placeholders).
- [ ] Save-as-file destino (ambos DB e HTTP — depende de path-prompt UX)

**Invariante:** feature set V1 do spec completo.

## Story 24.8 — Limpeza

> Etapa 8. Remove débito legado.

### Tasks

- [ ] Remover `src/components/blocks/http/HttpBlockView.tsx`
- [ ] Remover `src/components/blocks/http/node.ts`
- [ ] Remover ramo `http` de `src/components/blocks/BlockAdapter.tsx`
- [ ] Remover ramo `http` de `BLOCK_OPEN_RE` em `cm-block-widgets.tsx` (se ainda houver)
- [ ] Atualizar `docs/SPEC.md` — secção "HTTP block" reescrita pro modelo fenced
- [ ] Atualizar `docs/ARCHITECTURE.md` — diagrama atualizado, exemplo de plugin atualizado
- [ ] Atualizar `CLAUDE.md` — secção HTTP block atualizada
- [ ] Migrar testes existentes que ainda referenciam `HttpBlockView` pro novo `HttpFencedPanel`
- [ ] Remover `lowlight` da dependência se não tiver mais uso depois da migração
- [ ] (Opcional, depois de 1-2 releases estáveis) Remover branch JSON legado do parser

**Invariante:** vault legado continua abrindo via parser retrocompat; código novo é a única superfície ativa.

---

## Riscos / decisões adiadas

Tracking dos itens marcados V2 ou abertos no spec (`docs/http-block-redesign.md` §11):

| # | Item | Status | Decisão |
|---|------|--------|---------|
| R1 | GraphQL body mode com Variables panel | V2 | UI dedicada complexa; V1 trata como `text` |
| R2 | Cookie jar persistente por env | V2 | Backend store + UI revogação + privacy review |
| R3 | HTML preview com iframe sandbox | V2 | Segurança não-trivial (CSP, sandbox attrs) |
| R4 | `@codemirror/lang-http` vs custom | abertura | Plano B custom é simples; testar pacote primeiro |
| R5 | Bulk edit perdendo description em flip | aceitar | Postman também perde; documentar |
| R6 | Examples storage (nova tabela vs flag em `block_results`) | decidir na Etapa 6 | Flag `is_example` em `block_results` é mais simples; tabela nova dá mais flexibilidade |
| R7 | Response body cap absoluto em memória | decidir na Etapa 2 | Streaming evita OOM frontend; backend pode precisar cap (~1GB) pra não carregar request inteiro |
| R8 | Streaming cancel mid-body preserva partial | decidir na Etapa 2 | Recomendação: preserva + badge "cancelled at Xkb" (mesmo pattern do DB) |
