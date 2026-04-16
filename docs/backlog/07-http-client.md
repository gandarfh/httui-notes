# Epic 07 — HTTP Client

HTTP block UI, execucao de requests, environments com variaveis, e preview de responses binarios.

**Depende de:** Epic 05 (Block System)
**Desbloqueia:** Epic 08 (E2E Runner — reutiliza executor HTTP)

---

## Story 01: HTTP block UI ✅

Interface do bloco HTTP no editor.

### Tasks

- [x] Criar TipTap node `HttpBlock` estendendo `ExecutableBlock`
- [x] UI de input:
  - [x] Method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  - [x] URL input com autocomplete para `{{...}}`
  - [x] Headers: lista editavel de key-value pairs (botao "+ Add Header", botao remove por row)
  - [x] Body: CodeMirror com lang-json, visivel apenas para POST/PUT/PATCH
  - [x] Timeout override (input numerico opcional, tab Settings)
- [x] Colorir method badge por tipo (GET=verde, POST=azul, PUT=laranja, PATCH=amarelo, DELETE=vermelho, HEAD=roxo, OPTIONS=cinza)
- [x] Serializar como fenced code block: ` ```http `

## Story 02: HTTP block output ✅

Renderizar resposta HTTP.

### Tasks

- [x] Status badge com cor granular (2xx=verde, 3xx=azul, 4xx=amarelo, 5xx=vermelho)
- [x] Tempo de resposta e tamanho do response (formatado B/KB/MB)
- [x] Response body com syntax highlighting:
  - [x] JSON: formatado e colorizado (lowlight)
  - [x] HTML/XML: source com highlighting
  - [x] Texto plain: exibido como esta
- [x] Response headers (secao colapsavel com chevron)
- [x] Copiar response body com botao (feedback visual com check icon)

## Story 03: Preview de responses binarios ✅

Renderizar imagens, PDFs e outros binarios inline.

### Tasks

- [x] Detectar content-type binario no response (image/*, application/pdf, video/*, audio/*, etc.)
- [x] Imagens (image/png, image/jpeg, image/gif, image/svg+xml): renderizar inline com `<img>` e tamanho max contido no bloco
- [x] PDFs: renderizar com `<iframe>`
- [x] Outros binarios: mostrar info (content-type, tamanho) com icone
- [x] Botao de maximizar em todos os previews: abre modal fullscreen com o conteudo em tamanho maximo — `BinaryPreview` em `HttpBlockView.tsx`
- [x] Botao de download para salvar o response no filesystem

## Story 04: Execute HTTP request no backend ✅

Implementar executor HTTP no Rust.

### Tasks

- [x] Implementar `execute_http_request` — recebe method, url, headers (HashMap), body (Option<String>)
- [x] Usar reqwest como HTTP client
- [x] Retornar: status (u16), status_text, headers, body (string ou base64 para binario), content_type, elapsed_ms, size_bytes
- [x] Detectar content-type e decidir encoding do body (text vs base64)
- [x] Respeitar timeout (30s default + per-request override via timeout_ms)
- [x] Suportar redirects (follow por default via reqwest)
- [x] Tratar erros: timeout, connection_failed, too_many_redirects, body_error — com mensagens classificadas
- [x] Escrever testes com mock server (wiremock: 8 testes)

## Story 05: Environments e variables ✅

Gerenciamento de agrupamentos de variaveis.

### Tasks

- [x] Implementar Tauri commands: `list_environments`, `create_environment`, `set_active_environment`
- [x] Implementar Tauri commands: `list_env_variables`, `set_env_variable`, `delete_env_variable`
- [x] Implementar Tauri commands adicionais: `delete_environment`, `duplicate_environment`
- [x] Encriptar values via OS keychain — campo `is_secret` + keyring crate em `keychain.rs`
- [x] Criar UI de environment selector no top bar (dropdown com globe icon)
- [x] Criar UI de gerenciamento de environments (drawer lateral):
  - [x] Lista de environments na sidebar
  - [x] Para cada environment: lista editavel de key-value pairs
  - [x] Botao para criar novo environment
  - [x] Botao para duplicar environment
  - [x] Botao para deletar environment
- [x] Values sensiveis: toggle para mascarar/mostrar valor (icone de olho)
- [x] Ao trocar environment ativo: env keys aparecem no autocomplete de todos os blocos

## Story 06: Interpolacao de variaveis no frontend ✅

Resolver variaveis antes de enviar request ao backend.

### Tasks

- [x] Antes de executar: resolver todas as `{{...}}` no URL, headers, params e body
- [x] Para environment variables: buscar valor do environment ativo (`{{KEY}}` sem dots)
- [x] Para block references: buscar resultado cacheado do bloco referenciado (`{{alias.response.path}}`)
- [x] Se variavel nao encontrada: mostrar erro com nome da variavel e onde foi usada
- [x] Enviar ao backend os valores ja resolvidos (o Rust recebe tudo interpolado para HTTP)
- [x] Env variable keys aparecem no autocomplete `{{` ao lado dos block aliases
