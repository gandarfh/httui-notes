# Epic 08 — E2E Test Runner

E2E block UI com steps, assertions, extractions entre steps, e report de resultados.

**Depende de:** Epic 05 (Block System), Epic 07 (HTTP Client — reutiliza executor)
**Desbloqueia:** nenhum

---

## Story 01: E2E block UI — input

Interface de configuracao do E2E block.

### Tasks

- [ ] Criar TipTap node `E2eBlock` estendendo `ExecutableBlock`
- [ ] UI de input:
  - [ ] Base URL: input com autocomplete `{{...}}`
  - [ ] Default headers: lista editavel key-value (herdados por todos os steps)
  - [ ] Steps: lista ordenavel (drag and drop para reordenar)
- [ ] Cada step renderiza como um card colapsavel (daisyUI `collapse`) com:
  - [ ] Name: input de texto
  - [ ] Method: dropdown
  - [ ] URL: input de texto (path relativo ao base_url)
  - [ ] Headers: lista editavel (override dos defaults, colapsavel)
  - [ ] Body: CodeMirror JSON (visivel para POST/PUT/PATCH)
  - [ ] Expect (secao colapsavel):
    - [ ] Status: input numerico
    - [ ] JSON match: key-value editor (key = JSON path, value = expected value)
    - [ ] Body contains: lista de strings
  - [ ] Extract: key-value editor (variable_name = JSON path do response)
- [ ] Botao "+ Add Step" no final da lista
- [ ] Botao de remover em cada step

## Story 02: E2E block UI — output

Renderizar resultados da execucao E2E.

### Tasks

- [ ] Summary no topo: "2/3 passed" com barra de progresso (daisyUI `progress`)
  - [ ] Barra verde se todos passaram, vermelha se algum falhou
- [ ] Lista de steps com resultado:
  - [ ] Icone: check verde (passed) ou x vermelho (failed)
  - [ ] Nome do step
  - [ ] HTTP status recebido
  - [ ] Tempo de execucao
- [ ] Cada step e expandivel (daisyUI `collapse`) mostrando:
  - [ ] Response body (com syntax highlighting)
  - [ ] Assertions: lista com expected vs received, diff visual para falhas
  - [ ] Variaveis extraidas: lista key=value

## Story 03: E2E runner no backend

Implementar execucao sequencial de steps no Rust.

### Tasks

- [ ] Implementar `run_e2e_suite` — recebe: base_url, default_headers, steps array
- [ ] Executar steps sequencialmente (ordem do array)
- [ ] Para cada step:
  - [ ] Montar URL: base_url + step.url
  - [ ] Merge headers: default_headers + step.headers (step override default)
  - [ ] Resolver variaveis `{{...}}` incluindo extractions de steps anteriores
  - [ ] Executar HTTP request (reutilizar logica do `execute_http_request`)
  - [ ] Validar expectations:
    - [ ] Status: comparar com expected
    - [ ] JSON match: navegar response JSON e comparar valores
    - [ ] Body contains: verificar se body contem cada string
  - [ ] Processar extractions: extrair valores do response JSON e armazenar para steps seguintes
  - [ ] Se step falha: continuar executando os demais (nao abortar)
- [ ] Retornar resultado por step: passed/failed, errors (array de strings com detalhes), response, elapsed_ms, extractions
- [ ] Escrever testes com mock server para cenarios de sucesso e falha

## Story 04: Serializacao E2E no markdown

Converter E2E block de/para fenced code block.

### Tasks

- [ ] Serializar como ` ```e2e ` com YAML interno seguindo schema da spec
- [ ] Parser: ler YAML e popular atributos do TipTap node
- [ ] Serializer: converter atributos do node para YAML
- [ ] Preservar extractions e expects no roundtrip
- [ ] Suportar variaveis `{{...}}` em todos os campos de texto (url, headers, body, expect values)
