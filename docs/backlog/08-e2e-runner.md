# Epic 08 — E2E Test Runner

E2E block UI com steps, assertions, extractions entre steps, e report de resultados.

**Depende de:** Epic 05 (Block System), Epic 07 (HTTP Client — reutiliza executor)
**Desbloqueia:** nenhum

---

## Story 01: E2E block UI — input

Interface de configuracao do E2E block.

### Tasks

- [x] Criar TipTap node `E2eBlock` estendendo `ExecutableBlock`
- [x] UI de input:
  - [x] Base URL: input com autocomplete `{{...}}`
  - [x] Default headers: lista editavel key-value (herdados por todos os steps)
  - [x] Steps: lista ordenavel (botoes up/down para reordenar)
- [x] Cada step renderiza como um card colapsavel com:
  - [x] Name: input de texto
  - [x] Method: dropdown
  - [x] URL: input de texto (path relativo ao base_url)
  - [x] Headers: lista editavel (override dos defaults, colapsavel)
  - [x] Body: CodeMirror JSON (visivel para POST/PUT/PATCH)
  - [x] Expect (secao colapsavel):
    - [x] Status: input numerico
    - [x] JSON match: key-value editor (key = JSON path, value = expected value)
    - [x] Body contains: lista de strings
  - [x] Extract: key-value editor (variable_name = JSON path do response)
- [x] Botao "+ Add Step" no final da lista
- [x] Botao de remover em cada step

## Story 02: E2E block UI — output

Renderizar resultados da execucao E2E.

### Tasks

- [x] Summary no topo: "2/3 passed" com barra de progresso (Chakra UI)
  - [x] Barra verde se todos passaram, vermelha se algum falhou
- [x] Lista de steps com resultado:
  - [x] Icone: check verde (passed) ou x vermelho (failed)
  - [x] Nome do step
  - [x] HTTP status recebido
  - [x] Tempo de execucao
- [x] Cada step e expandivel mostrando:
  - [x] Response body (com syntax highlighting via lowlight)
  - [x] Assertions: lista com expected vs received, diff visual para falhas
  - [x] Variaveis extraidas: lista key=value

## Story 03: E2E runner no backend

Implementar execucao sequencial de steps no Rust.

### Tasks

- [x] Implementar `E2eExecutor` — recebe: base_url, default_headers, steps array
- [x] Executar steps sequencialmente (ordem do array)
- [x] Para cada step:
  - [x] Montar URL: base_url + step.url
  - [x] Merge headers: default_headers + step.headers (step override default)
  - [x] Resolver variaveis `{{...}}` incluindo extractions de steps anteriores
  - [x] Executar HTTP request (reutilizar reqwest Client)
  - [x] Validar expectations:
    - [x] Status: comparar com expected
    - [x] JSON match: navegar response JSON e comparar valores
    - [x] Body contains: verificar se body contem cada string
  - [x] Processar extractions: extrair valores do response JSON e armazenar para steps seguintes
  - [x] Se step falha: continuar executando os demais (nao abortar)
- [x] Retornar resultado por step: passed/failed, errors (array de strings com detalhes), response, elapsed_ms, extractions
- [x] Escrever testes com mock server (wiremock) para cenarios de sucesso e falha (8 testes)

## Story 04: Serializacao E2E no markdown

Converter E2E block de/para fenced code block.

### Tasks

- [x] Serializar como ` ```e2e ` com JSON interno (seguindo padrao dos outros blocos)
- [x] Parser: ler JSON e popular atributos do TipTap node
- [x] Serializer: converter atributos do node para JSON
- [x] Preservar extractions e expects no roundtrip
- [x] Suportar variaveis `{{...}}` em todos os campos de texto (url, headers, body, expect values)

---

## Notas de implementacao

- Reordenacao de steps usa botoes up/down (sem dependencia de DnD library)
- UI usa Chakra UI v3 (nao daisyUI como originalmente descrito no backlog)
- Formato de serializacao e JSON (consistente com http e db blocks), nao YAML
- `dependencies.ts` generalizado para suportar execucao de qualquer blockType (nao apenas HTTP)
- Slash command `/e2e` adicionado (titulo "E2E Test")
