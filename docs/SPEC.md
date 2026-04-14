# Notes — Spec de produto

## Visão geral

Notes é uma plataforma de documentação integrada com ferramentas de desenvolvimento. O conceito central é um editor de markdown com blocos executáveis inline — HTTP client, database query runner e E2E test runner — tudo dentro do documento.

O app combina ideias do Notion (block editor), Obsidian (vault de markdown), DBeaver (database client), e Postman (HTTP client + environments) numa interface desktop nativa.

---

## Stack

- **Frontend:** React + TypeScript + daisyUI (Tailwind)
- **Editor framework:** TipTap (ProseMirror) com custom extensions para blocos executáveis
- **Code editor:** CodeMirror (embedded em campos específicos dos blocos: body JSON, SQL query)
- **Backend:** Rust via Tauri v2 (desktop framework)
- **Storage:** Arquivos `.md` no filesystem + SQLite interno do app
- **Markdown:** GFM (tables, checklists, strikethrough) + Mermaid + KaTeX

---

## Arquitetura de storage

O sistema usa dois mecanismos de storage com responsabilidades distintas.

### Vault (filesystem)

Diretório no filesystem contendo arquivos `.md`. O app suporta múltiplos vaults com switching — o usuário pode trocar entre vaults de projetos diferentes. O vault ativo é persistido no app_config. Os documentos são markdown padrão com fenced code blocks customizados para blocos executáveis. O conteúdo dos fenced blocks é YAML, mas o usuário nunca vê nem edita YAML diretamente — é o formato interno de serialização. Os arquivos são legíveis em qualquer viewer de markdown — no GitHub, VS Code ou Obsidian os blocos executáveis renderizam como code blocks normais.

O app monitora o vault via file watcher (Tauri notify/watcher). Se um arquivo `.md` é editado externamente (VS Code, git pull, etc.), o app detecta a mudança e recarrega o documento no editor. Se o arquivo está com modificações não salvas no editor, o app avisa o usuário do conflito antes de recarregar.

### SQLite interno (notes.db)

Armazena tudo que não pertence ao arquivo: estado do app, secrets e cache de execução.

**Tabelas:**

- `connections` — conexões de banco de dados (detalhado na seção Connections).
- `environments` — agrupamentos de variáveis. Campos: id, name (local, stage, prod), is_active, created_at.
- `env_variables` — variáveis de ambiente. Campos: environment_id (FK), key, value (encrypted via OS keychain).
- `block_results` — cache de resultados de blocos executáveis. Campos: file_path, block_hash, status (success, error), response (JSON), total_rows (para paginação), executed_at, elapsed_ms. O block_hash é calculado a partir do conteúdo do bloco — se o conteúdo muda, o cache é invalidado automaticamente.
- `app_config` — key-value store para configurações. Inclui: vault ativo, layout dos panes, arquivos abertos, environment ativo, preferências do usuário, keybinding mode, theme override.
- `schema_cache` — metadata das conexões para autocomplete. Campos: connection_id, table_name, column_name, data_type, cached_at. Cache com TTL, refresh ao conectar/reconectar.
- `search_index` — índice full-text (SQLite FTS5) dos conteúdos dos arquivos .md. Atualizado pelo file watcher e ao salvar.

### Criptografia

Conexões e variáveis de ambiente são encriptadas usando o OS keychain nativo (macOS Keychain, Windows Credential Manager, Linux Secret Service) via Tauri.

---

## Connections

O modelo de conexão é mais rico que apenas uma connection string. Cada conexão tem configurações que precisam ser atualizáveis.

**Campos da tabela connections:**

- id (uuid, PK)
- name (ex: "stage-pg", "local-mysql")
- driver (postgres, mysql, sqlite)
- host
- port
- database
- username
- password (encrypted via OS keychain)
- ssl_mode (disable, require, verify-ca, verify-full)
- timeout_ms (timeout de conexão, default 10000)
- query_timeout_ms (timeout por query, default 30000)
- ttl_seconds (time-to-live da conexão no pool, default 300)
- max_pool_size (default 5)
- last_tested_at
- created_at, updated_at

O app mantém um connection pool por conexão ativa. O pool é gerenciado pelo Rust com TTL configurável — conexões idle são fechadas após o TTL. Quando uma conexão é editada (host, password, etc.), o pool é destruído e recriado.

A connection string é montada internamente pelo Rust a partir dos campos individuais — o usuário nunca precisa montar manualmente.

---

## Editor

### TipTap + custom extensions

O editor usa TipTap (baseado em ProseMirror) como framework. O documento é sempre editável — não existe modo "preview" separado. TipTap fornece: block editor com paragraph, heading, list, blockquote, divider, code block, drag and drop de blocos, slash commands (/), e serialização para/de markdown.

Extensões customizadas do TipTap para os blocos executáveis: cada bloco executável é um TipTap node com nodeView customizado que renderiza um componente React com UI de formulário. O usuário interage com campos visuais (dropdowns, inputs, listas), nunca com YAML. A serialização para YAML acontece transparentemente ao salvar o `.md`.

**Slash commands:** ao digitar `/` o usuário vê um menu com: /http (cria HTTP block), /sql ou /db (cria DB block), /e2e (cria E2E block), /mermaid (cria bloco Mermaid), /math (cria bloco KaTeX), /table (cria tabela GFM), /divider, /code, /todo, /quote, /h1, /h2, /h3.

**Drag and drop:** blocos podem ser reordenados arrastando. Quando um bloco executável é movido abaixo de um bloco que ele referencia, a referência se mantém válida (referência é só pra cima). Se um bloco é movido acima de um bloco que ele referencia, a referência fica inválida e o editor mostra um warning visual.

### Markdown features

O parser e renderer suportam:

- GFM (GitHub Flavored Markdown): tables, checklists (task lists), strikethrough, autolinks.
- Mermaid: blocos ```mermaid renderizam diagramas inline (flowcharts, sequence diagrams, ERDs, etc.) usando a biblioteca mermaid.js.
- KaTeX: expressões math inline ($...$) e display ($$...$$) renderizadas via KaTeX.
- Syntax highlighting: code blocks com language identifier renderizam com highlighting.

### Links

**Links internos (wikilinks):** estilo Obsidian com `[[nome-do-doc]]` ou `[[pasta/nome-do-doc]]`. O autocomplete sugere documentos existentes no vault ao digitar `[[`. Clicar no link abre o documento no pane atual (ou em novo pane com modifier key).

**Links externos:** URLs padrão de markdown `[texto](https://...)` e autolinks. Clicar abre no navegador padrão do OS via Tauri shell plugin.

### Multi-pane (Neovim-style)

A área de edição suporta splits horizontal e vertical. Cada pane é independente: tem seu próprio arquivo aberto e scroll position. Panes podem ser criados, redimensionados e fechados via atalhos de teclado.

### Keybindings

Configurável entre dois modos: vim-like (com modos normal/insert/visual) e VS Code-style (atalhos diretos). A configuração é persistida no app_config.

### Session persistence

O app salva e restaura entre sessões: vault ativo, layout dos panes (quais splits existem e seus tamanhos), arquivos abertos em cada pane, environment ativo, e posição de scroll.

---

## UI dos blocos executáveis

O YAML dentro dos fenced code blocks no `.md` é o formato de serialização. O usuário nunca vê nem edita YAML. Cada bloco executável tem uma UI de formulário com campos visuais e três modos de visualização no nível do bloco.

### Display modes (por bloco)

Cada bloco executável tem um toggle com três estados:

- **input** — mostra apenas o formulário de edição do bloco (campos, body editor).
- **output** — mostra apenas o resultado da execução (response, tabela, test results).
- **split** — divide o bloco verticalmente: input na esquerda, output na direita. É o modo padrão quando há resultado cacheado.

### HTTP block

**UI de input:**

- **Method:** dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
- **URL:** input de texto com autocomplete para variáveis `{{...}}`.
- **Headers:** lista editável de key-value pairs. Cada header é uma row com input de key, input de value, e botão de remover. Botão "+ add header" no final. Autocomplete para variáveis nos values.
- **Body:** CodeMirror instance com syntax highlighting JSON e autocomplete para variáveis `{{...}}`. Visível apenas para methods que aceitam body (POST, PUT, PATCH).
- **Alias:** campo de texto no header do bloco.
- **Timeout:** campo opcional (ms), override do default da config.

**UI de output:**

- Status badge (ex: "201 Created"), tempo de resposta, tamanho.
- Response body com syntax highlighting (JSON formatado, HTML, texto plain).
- Response headers (colapsável).
- Para responses binários (imagens, PDFs): preview inline com botão de maximizar para fullscreen.

**Serialização no .md:**

```
alias: create_order
method: POST
url: "{{base_url}}/api/v1/orders"
headers:
  Content-Type: application/json
  Authorization: "Bearer {{token}}"
body:
  product_id: abc-123
  quantity: 2
  customer: "{{customer_id}}"
```

### DB block

**UI de input:**

- **Connection:** dropdown com as conexões disponíveis (da tabela connections). Mostra status (conectada/desconectada).
- **Query:** CodeMirror instance com syntax highlighting SQL, autocomplete para variáveis `{{...}}`, e autocomplete para tabelas/colunas da conexão selecionada (via schema_cache).
- **Alias:** campo de texto no header do bloco.
- **Timeout:** campo opcional (ms), override do default da conexão.

**UI de output:**

- Status badge (ex: "247 rows"), tempo de execução.
- Tabela paginada estilo DBeaver: cabeçalho com nomes das colunas, rows da página atual, barra de paginação (anterior, próxima, ir para página, total de rows). Page size default: 100 rows.
- Para queries de mutação (INSERT, UPDATE, DELETE): mostra "N rows affected".

**Serialização no .md:**

Language identifier carrega driver e conexão: `db-postgres:stage-pg`

```
alias: list_orders
query: |
  SELECT id, status, total
  FROM orders
  WHERE customer = {{create_order.response.customer}}
  ORDER BY created_at DESC;
```

### E2E block

**UI de input:**

- **Base URL:** input de texto com autocomplete para variáveis.
- **Default headers:** lista editável de key-value pairs (herdados por todos os steps).
- **Steps:** lista ordenável de steps, cada step com:
  - Name: input de texto.
  - Method: dropdown.
  - URL: input de texto (relativo ao base_url).
  - Headers: lista editável (override dos defaults).
  - Body: CodeMirror para JSON (quando aplicável).
  - Expect: campos visuais — status (input numérico), JSON match (key-value editor), body contains (lista de strings).
  - Extract: key-value editor (nome da variável → JSON path).
- **Alias:** campo de texto no header do bloco.

**UI de output:**

- Summary: "2/3 passed" com indicador visual (barra de progresso verde/vermelha).
- Lista de steps com: status (check/x), nome, HTTP status, tempo. Expandível para ver: response body, erros de assertion com diff (expected vs received), variáveis extraídas.

**Serialização no .md:**

```
alias: order_flow
base_url: "{{base_url}}"
headers:
  Authorization: "Bearer {{token}}"
steps:
  - name: Create order
    method: POST
    url: /orders
    body:
      product_id: abc-123
    expect:
      status: 201
      json:
        status: pending
    extract:
      order_id: response.id
  - name: Get order
    method: GET
    url: "/orders/{{order_id}}"
    expect:
      status: 200
```

---

## Sistema de referências entre blocos

### Sintaxe

Blocos referenciam outros usando `{{alias.response.path}}` onde: `alias` é o valor da propriedade alias do bloco alvo, `response` acessa o resultado cacheado, e `path` navega o JSON do resultado via dot notation.

Exemplos: `{{create_order.response.id}}` acessa o campo id do response JSON do bloco create_order, `{{list_users.response.rows.0.email}}` acessa o email da primeira row de um resultado SQL, `{{create_order.status}}` acessa o HTTP status code.

### Direção

Um bloco só pode referenciar blocos que estão acima dele no documento. Isso garante que o grafo de dependências é um DAG (directed acyclic graph) por construção — ciclos são impossíveis.

### Resolução de dependências

Quando o usuário clica Run num bloco: (1) o parser escaneia o conteúdo buscando referências `{{...}}`, (2) para cada referência, verifica se o bloco alvo tem resultado cacheado no SQLite (block_results), (3) se não tem cache ou o cache está invalidado (block_hash mudou), executa o bloco alvo primeiro, (4) o processo é recursivo — o bloco alvo resolve suas próprias dependências antes de executar, (5) após resolver todas as dependências, executa o bloco original, (6) o resultado é salvo no block_results.

### Dois pipelines de interpolação

**HTTP blocks:** interpolação é string pura — segura porque o resultado é uma URL, header ou body de request HTTP.

**SQL blocks:** referências são convertidas para bind parameters do driver. `WHERE id = {{create_order.response.id}}` vira `WHERE id = $1` com o valor passado via `sqlx::query().bind()`. Nunca há interpolação de string em SQL.

---

## Autocomplete (CodeMirror)

O provider de autocomplete alimenta os campos CodeMirror dentro dos blocos executáveis com três fontes de dados.

**Environment variables:** todas as variáveis do environment ativo. Triggered ao digitar `{{`. Mostra key e valor (masked para secrets). Disponível em todos os campos que aceitam variáveis (URL, headers, body, SQL query).

**Block outputs:** resultados cacheados de blocos anteriores no documento. Triggered ao digitar `{{`. Navega a árvore JSON do response com dot notation. Só mostra blocos que estão acima do bloco atual e que têm alias definido.

**Connection metadata (SQL blocks only):** nomes de tabelas e colunas da conexão selecionada. Obtidos via introspection (INFORMATION_SCHEMA ou equivalente). Cache com TTL no SQLite (schema_cache), refresh automático ao conectar ou reconectar. Triggered durante a escrita do SQL (após FROM, JOIN, WHERE, etc.).

---

## Comportamento de execução

### Estados de um bloco

- **idle** — nunca executado, ou cache invalidado. Output area mostra placeholder.
- **cached** — tem resultado de execução anterior. Output area mostra preview do resultado.
- **running** — execução em andamento. Output area mostra loading indicator.
- **success** — execução bem-sucedida. Output area mostra resultado com status, tempo, e response.
- **error** — execução falhou. Output area mostra mensagem de erro.

### Cache e persistência

Quando o app abre um documento, cada bloco executável verifica se há resultado cacheado no block_results (SQLite) usando file_path + block_hash. Se o hash bate (conteúdo não mudou), renderiza o output com o resultado anterior e entra automaticamente em split view. Se o hash não bate, o bloco volta para idle.

### Execução concorrente

Blocos podem ser executados simultaneamente em panes diferentes ou no mesmo documento. Cada execução é independente. Se dois blocos compartilham uma dependência e ambos são executados ao mesmo tempo, a dependência é executada apenas uma vez (lock no block_id durante execução) e ambos esperam o resultado.

### Paginação de resultados (DB blocks)

Resultados de queries SQL são paginados estilo DBeaver. O backend executa a query e retorna as primeiras N rows (default: 100). O output mostra uma tabela com: cabeçalho com nomes das colunas, rows da página atual, barra de navegação (página anterior, próxima, ir para página, total de rows). O total de rows é armazenado no block_results para exibir mesmo quando cacheado.

### Response binário (HTTP blocks)

Quando um HTTP response tem content-type binário (imagem, PDF, etc.), o output renderiza o conteúdo inline: imagens são exibidas diretamente, PDFs renderizam com viewer embeddable, outros tipos mostram info do content-type + tamanho. Todos os previews de response binário têm um botão de maximizar que abre o conteúdo em fullscreen dentro do app.

### Timeouts

Timeouts são configuráveis em três níveis: global (app_config, default para novas conexões), por conexão (campos timeout_ms e query_timeout_ms na tabela connections), e por bloco (campo opcional na UI do bloco). A precedência é: bloco > conexão > global.

### Erros

Erros são exibidos na output area do bloco. Tipos de erro: connection failure (não conseguiu conectar ao banco ou à URL), timeout (com indicação de qual timeout foi atingido e onde configurar), dependency resolution failure (bloco referenciado não existe, não tem alias, ou está abaixo do bloco atual), SQL error (query inválida, com mensagem do driver), HTTP error (status >= 400 pode ou não ser erro dependendo do expect), e2e assertion failure (expect não bateu, com diff do esperado vs recebido).

---

## Busca

### Busca por nome (Ctrl+P)

Quick-open estilo VS Code. Busca fuzzy por nome de arquivo no vault ativo. Abre o arquivo selecionado no pane atual.

### Busca full-text (Ctrl+Shift+F)

Busca por conteúdo dentro de todos os arquivos .md do vault. Usa SQLite FTS5 como engine (tabela search_index). O índice é atualizado pelo file watcher e ao salvar arquivos. Resultados mostram: nome do arquivo, trecho com match highlighted, e linha. Clicar num resultado abre o arquivo e scroll até o trecho.

---

## Interface

### Layout geral

- **Top bar:** nome do app, vault selector (dropdown para trocar de vault), environment selector (dropdown), busca (Ctrl+P).
- **Sidebar esquerda:** árvore de arquivos do vault (pastas e .md files), seção de connections com status (conectada/desconectada).
- **Área central:** multi-pane com splits. Cada pane tem: tab bar com arquivos abertos e a área do TipTap editor.
- **Status bar:** connection status, keybinding mode, contagem de panes, environment ativo.

### Theme

Light e dark mode. Segue a preferência do OS com opção de override manual nas configurações.

---

## Tauri commands (backend Rust)

O frontend se comunica com o backend Rust via Tauri IPC (invoke). Os commands são:

**Filesystem:** list_workspace, read_note, write_note, create_note, delete_note, rename_note, create_folder, watch_vault (inicia file watcher), switch_vault.

**HTTP executor:** execute_http_request — recebe method, url, headers, body (já interpolados para HTTP). Retorna status, status_text, headers, body (string ou base64 para binário), content_type, elapsed_ms, size_bytes.

**DB executor:** execute_query — recebe connection_id, query parametrizada, array de bind values, page (número da página), page_size (rows por página). Conecta via pool (ou cria pool se não existe), executa com prepared statement, retorna columns, rows, total_rows, elapsed_ms. Também: test_connection para validar uma conexão.

**E2E runner:** run_e2e_suite — recebe suite config com steps, executa sequencialmente, resolve extractions entre steps, valida expectations. Retorna resultado por step (passed/failed, errors, response, elapsed_ms).

**Schema introspection:** introspect_schema — recebe connection_id, executa query de introspection adequada ao driver, retorna lista de tabelas e colunas. Salva no schema_cache com timestamp.

**Config:** get_config, set_config — CRUD no app_config.

**Connections:** list_connections, create_connection, update_connection, delete_connection, test_connection.

**Environments:** list_environments, create_environment, set_active_environment, list_env_variables, set_env_variable, delete_env_variable.

**Block results:** get_block_result, save_block_result — CRUD no block_results indexado por file_path + block_hash.

**Search:** search_files (por nome, fuzzy), search_content (full-text via FTS5), rebuild_search_index (reindexar vault completo).

---

## Prioridade de implementação

1. **Editor markdown** — TipTap com extensions de texto, parser de .md, slash commands, drag and drop, sidebar com file tree, multi-pane, file watcher, session persistence, wikilinks, vault switching, busca.
2. **Database query** — connections manager (com config completa: host, port, ssl, pool, TTL, timeouts), db block UI com connection selector + CodeMirror SQL + autocomplete, execute_query com prepared statements e paginação estilo DBeaver, schema introspection com cache TTL, split view input/output.
3. **HTTP client** — http block UI com method dropdown + URL input + headers list + CodeMirror body, execute_http_request, output com JSON highlighting + preview binário com fullscreen, environments + variables, split view input/output.
4. **E2E test runner** — e2e block UI com step list + expect/extract editors, run_e2e_suite, output com pass/fail por step + diff de assertions, extract entre steps.
