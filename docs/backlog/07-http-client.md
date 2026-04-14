# Epic 07 — HTTP Client

HTTP block UI, execucao de requests, environments com variaveis encriptadas, e preview de responses binarios.

**Depende de:** Epic 05 (Block System)
**Desbloqueia:** Epic 08 (E2E Runner — reutiliza executor HTTP)

---

## Story 01: HTTP block UI

Interface do bloco HTTP no editor.

### Tasks

- [ ] Criar TipTap node `HttpBlock` estendendo `ExecutableBlock`
- [ ] UI de input:
  - [ ] Method selector (dropdown daisyUI: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
  - [ ] URL input com autocomplete para `{{...}}`
  - [ ] Headers: lista editavel de key-value pairs (daisyUI inputs em grid, botao "+ Add Header", botao remove por row)
  - [ ] Body: CodeMirror com lang-json, visivel apenas para POST/PUT/PATCH
  - [ ] Timeout override (input numerico opcional)
- [ ] Colorir method badge por tipo (GET=verde, POST=azul, DELETE=vermelho, etc.)
- [ ] Serializar como fenced code block: ` ```http `

## Story 02: HTTP block output

Renderizar resposta HTTP.

### Tasks

- [ ] Status badge com cor (2xx=verde, 3xx=azul, 4xx=amarelo, 5xx=vermelho) usando daisyUI `badge`
- [ ] Tempo de resposta e tamanho do response
- [ ] Response body com syntax highlighting:
  - [ ] JSON: formatado e colorizedo (CodeMirror read-only ou highlight.js)
  - [ ] HTML: source com highlighting
  - [ ] Texto plain: exibido como esta
- [ ] Response headers (secao colapsavel com daisyUI `collapse`)
- [ ] Copiar response body com botao (daisyUI `btn btn-ghost btn-xs`)

## Story 03: Preview de responses binarios

Renderizar imagens, PDFs e outros binarios inline.

### Tasks

- [ ] Detectar content-type binario no response (image/*, application/pdf, etc.)
- [ ] Imagens (image/png, image/jpeg, image/gif, image/svg+xml): renderizar inline com `<img>` e tamanho max contido no bloco
- [ ] PDFs: renderizar com `<iframe>` ou viewer embeddable
- [ ] Outros binarios: mostrar info (content-type, tamanho) com icone
- [ ] Botao de maximizar em todos os previews: abre modal fullscreen (daisyUI `modal modal-open`) com o conteudo em tamanho maximo
- [ ] Botao de download para salvar o response no filesystem

## Story 04: Execute HTTP request no backend

Implementar executor HTTP no Rust.

### Tasks

- [ ] Implementar `execute_http_request` — recebe method, url, headers (HashMap), body (Option<String>)
- [ ] Usar reqwest como HTTP client
- [ ] Retornar: status (u16), status_text, headers, body (string ou base64 para binario), content_type, elapsed_ms, size_bytes
- [ ] Detectar content-type e decidir encoding do body (text vs base64)
- [ ] Respeitar timeout (do bloco ou global)
- [ ] Suportar redirects (configuravel, follow por default)
- [ ] Tratar erros: DNS resolution failure, connection refused, timeout, SSL error — com mensagens claras
- [ ] Escrever testes com mock server (wiremock-rs ou similar)

## Story 05: Environments e variables

Gerenciamento de agrupamentos de variaveis.

### Tasks

- [ ] Implementar Tauri commands: `list_environments`, `create_environment`, `set_active_environment`
- [ ] Implementar Tauri commands: `list_env_variables`, `set_env_variable`, `delete_env_variable`
- [ ] Encriptar values via OS keychain
- [ ] Criar UI de environment selector no top bar (dropdown daisyUI)
- [ ] Criar UI de gerenciamento de environments:
  - [ ] Modal/drawer com lista de environments
  - [ ] Para cada environment: lista editavel de key-value pairs
  - [ ] Botao para criar novo environment
  - [ ] Botao para duplicar environment (ex: copiar "local" para criar "stage")
  - [ ] Botao para deletar environment
- [ ] Values sensiveis: toggle para mascarar/mostrar valor (icone de olho)
- [ ] Ao trocar environment ativo: atualizar autocomplete em todos os blocos abertos

## Story 06: Interpolacao de variaveis no frontend

Resolver variaveis antes de enviar request ao backend.

### Tasks

- [ ] Antes de executar: resolver todas as `{{...}}` no URL, headers e body
- [ ] Para environment variables: buscar valor do environment ativo
- [ ] Para block references: buscar resultado cacheado do bloco referenciado
- [ ] Se variavel nao encontrada: mostrar erro com nome da variavel e onde foi usada
- [ ] Enviar ao backend os valores ja resolvidos (o Rust recebe tudo interpolado para HTTP)
