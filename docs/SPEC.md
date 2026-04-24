asdlkjasdkljasd

# Notes — Spec de produto

## Visão geral

Notes é uma plataforma de documentação integrada com ferramentas de desenvolvimento. O conceito central é um editor de markdown com blocos executáveis inline — HTTP client, database query runner e E2E test runner — tudo dentro do documento.

O app combina ideias do Notion (block editor), Obsidian (vault de markdown), DBeaver (database client), e Postman (HTTP client + environments) numa interface desktop nativa.

## Stack

-   **Storage:** Arquivos `.md` no filesystem + SQLite interno do app
    
-   **Backend:** Rust via Tauri v2 (desktop frame
    
-   **Frontend:** React + TypeScript + daisyUI (Tailwind)
    
-   **Editor framework:** TipTap (ProseMirror) com custom extensions para blocos executáveis
    
-   **Code editor:** CodeMirror (embedded em campos específicos dos blocos: body JSON, SQL query)
    
-   **Markdown:** GFM (tables, checklists, strikethrough) + Mermaid + KaTeX
    

---

## Arquitetura de storage

O sistema usa dois mecanismos de storage com responsabilidades distintas.

### Vault (filesystem)

Diretório no filesystem contendo arquivos `.md`. O app suporta múltiplos vaults com switching — o usuário pode trocar entre vaults de projetos diferentes. O vault ativo é persistido no app\_config. Os documentos são markdown padrão com fenced code blocks customizados para blocos executáveis. O conteúdo dos fenced blocks é YAML, mas o usuário nunca vê nem edita YAML diretamente — é o formato interno de serialização. Os arquivos são legíveis em qualquer viewer de markdown — no GitHub, VS Code ou Obsidian os blocos executáveis renderizam como code blocks normais.

O app monitora o vault via file watcher (Tauri notify/watcher). Se um arquivo `.md` é editado externamente (VS Code, git pull, etc.), o app detecta a mudança e recarrega o documento no editor. Se o arquivo está com modificações não salvas no editor, o app avisa o usuário do conflito antes de recarregar.

### SQLite interno (notes.db)

Armazena tudo que não pertence ao arquivo: estado do app, secrets e cache de execução.

**Tabelas:**

-   `connections` — conexões de banco de dados (detalhado na seção Connections).
    
-   `environments` — agrupamentos de variáveis. Campos: id, name (local, stage, prod), is\_active, created\_at.
    
-   `env_variables` — variáveis de ambiente. Campos: environment\_id (FK), key, value (encrypted via OS keychain).
    
-   `block_results` — cache de resultados de blocos executáveis. Campos: file\_path, block\_hash, status (success, error), response (JSON), total\_rows (para paginação), executed\_at, elapsed\_ms. O block\_hash é calculado a partir do conteúdo do bloco — se o conteúdo muda, o cache é invalidado automaticamente.
    
-   `app_config` — key-value store para configurações. Inclui: vault ativo, layout dos panes, arquivos abertos, environment ativo, preferências do usuário, keybinding mode, theme override.
    
-   `schema_cache` — metadata das conexões para autocomplete. Campos: connection\_id, table\_name, column\_name, data\_type, cached\_at. Cache com TTL, refresh ao conectar/reconectar.
    
-   `search_index` — índice full-text (SQLite FTS5) dos conteúdos dos arquivos .md. Atualizado pelo file watcher e ao salvar.
    

### Criptografia

Conexões e variáveis de ambiente são encriptadas usando o OS keychain nativo (macOS Keychain, Windows Credential Manager, Linux Secret Service) via Tauri.

---

## Connections

O modelo de conexão é mais rico que apenas uma connection string. Cada conexão tem configurações que precisam ser atualizáveis.

**Campos da tabela connections:**

-   id (uuid, PK)
    
-   name (ex: "stage-pg", "local-mysql")
    
-   driver (postgres, mysql, sqlite)
    
-   host
    
-   port
    
-   database
    
-   username
    
-   password (encrypted via OS keychain)
    
-   ssl\_mode (disable, require, verify-ca, verify-full)
    
-   timeout\_ms (timeout de conexão, default 10000)
    
-   query\_timeout\_ms (timeout por query, default 30000)
    
-   ttl\_seconds (time-to-live da conexão no pool, default 300)
    
-   max\_pool\_size (default 5)
    
-   last\_tested\_at
    
-   created\_at, updated\_at
    

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

-   GFM (GitHub Flavored Markdown): tables, checklists (task lists), strikethrough, autolinks.
    
-   Mermaid: blocos \`\`\`mermaid renderizam diagramas inline (flowcharts, sequence diagrams, ERDs, etc.) usando a biblioteca mermaid.js.
    
-   KaTeX: expressões math inline () e display (
    
    ) renderizadas via KaTeX.
    
-   Syntax highlighting: code blocks com language identifier renderizam com highlighting.
    

### Links

**Links internos (wikilinks):** estilo Obsidian com `<span data-type="wikilink" data-target="nome-do-doc" data-label="nome-do-doc">nome-do-doc</span>` ou `<span data-type="wikilink" data-target="pasta/nome-do-doc" data-label="pasta/nome-do-doc">pasta/nome-do-doc</span>`. O autocomplete sugere documentos existentes no vault ao digitar `[[`. Clicar no link abre o documento no pane atual (ou em novo pane com modifier key).

**Links externos:** URLs padrão de markdown `[texto](https://...)` e autolinks. Clicar abre no navegador padrão do OS via Tauri shell plugin.

### Multi-pane (Neovim-style)

A área de edição suporta splits horizontal e vertical. Cada pane é independente: tem seu próprio arquivo aberto e scroll position. Panes podem ser criados, redimensionados e fechados via atalhos de teclado.

### Keybindings

Configurável entre dois modos: vim-like (com modos normal/insert/visual) e VS Code-style (atalhos diretos). A configuração é persistida no app\_config.

### Session persistence

O app salva e restaura entre sessões: vault ativo, layout dos panes (quais splits existem e seus tamanhos), arquivos abertos em cada pane, environment ativo, e posição de scroll.

---

## UI dos blocos executáveis

O YAML dentro dos fenced code blocks no `.md` é o formato de serialização. O usuário nunca vê nem edita YAML. Cada bloco executável tem uma UI de formulário com campos visuais e três modos de visualização no nível do bloco.

### Display modes (por bloco)

Cada bloco executável tem um toggle com três estados:

-   **input** — mostra apenas o formulário de edição do bloco (campos, body editor).
    
-   **output** — mostra apenas o resultado da execução (response, tabela, test results).
    
-   **split** — divide o bloco verticalmente: input na esquerda, output na direita. É o modo padrão quando há resultado cacheado.
    

### HTTP block

**UI de input:**

-   **Method:** dropdown (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
    
-   **URL:** input de texto com autocomplete para variáveis `{{...}}`.
    
-   **Headers:** lista editável de key-value pairs. Cada header é uma row com input de key, input de value, e botão de remover. Botão "+ add header" no final. Autocomplete para variáveis nos values.
    
-   **Body:** CodeMirror instance com syntax highlighting JSON e autocomplete para variáveis `{{...}}`. Visível apenas para methods que aceitam body (POST, PUT, PATCH).
    
-   **Alias:** campo de texto no header do bloco.
    
-   **Timeout:** campo opcional (ms), override do default da config.
    

**UI de output:**

-   Status badge (ex: "201 Created"), tempo de resposta, tamanho.
    
-   Response body com syntax highlighting (JSON formatado, HTML, texto plain).
    
-   Response headers (colapsável).
    
-   Para responses binários (imagens, PDFs): preview inline com botão de maximizar para fullscreen.
    

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

Diferente de HTTP / E2E, o DB block é renderizado pela extensão nativa CM6 (`cm-db-block.tsx`) ao invés de TipTap NodeView — o body do bloco é SQL cru, o CodeMirror principal cuida do syntax highlighting e autocomplete, e o painel de resultado é montado como um widget lateral (ver `docs/db-block-redesign.md`).

**UI de input:**

-   **Connection:** definida no info string do fence (`connection=prod`). Resolve contra `connections` por nome ou UUID; UI de settings (ícone ⚙) permite trocar.
    
-   **Query:** body do fence, editado diretamente no CodeMirror principal. Autocomplete para `{{...}}` (aliases de blocos acima + env vars), tabelas/colunas do schema cache (pós `FROM`/`JOIN`/`UPDATE`/`INTO`) e keywords do dialeto.
    
-   **Dialect:** herdado do fence token — `db-postgres`, `db-mysql`, `db-sqlite`, ou `db` (genérico → usa o driver da conexão).
    
-   **Alias, limit, timeout, display:** todos no info string (`alias=db1 limit=100 timeout=30000 display=split`).
    

**UI de output:**

-   Status bar (footer): indicador de conexão, contagem de rows, tempo de execução, menu de export (CSV / JSON / Markdown / INSERT / clipboard / save).
    
-   Painel de resultado: tabs `Results`, `Messages`, `Plan`, `Stats`. Tabela virtualizada com colunas ordenáveis; page size default 100.
    
-   Multi-result (`SELECT; SELECT;` na mesma query): cada result set vira uma sub-tab dentro do `Results`.
    
-   Errors com line/column: squiggle vermelho no token problemático + mensagem no `Messages`.
    
-   Para mutations: "N rows affected" + confirmação obrigatória quando a connection está flaggeada `is_readonly`.
    

**Serialização no .md:**

O info string do fence carrega toda a metadata — corpo fica 100% SQL, sem envelope JSON/YAML:

```
```db-postgres alias=list_orders connection=stage-pg limit=100 display=split
SELECT id, status, total
FROM orders
WHERE customer = {{create_order.response.customer}}
ORDER BY created_at DESC;
```
```

Chaves reconhecidas no info string (ordem canônica no write): `alias → connection → limit → timeout → display`. Valores sem aspas (MVP); chaves desconhecidas ignoradas. Valores inválidos ignorados silenciosamente (não lançam erro de parse).

**Cache de resultado:**

A chave de hash inclui o body + o connection ID resolvido + um snapshot das env vars referenciadas pelo body (`{{KEY}}`). Isso isola o cache por ambiente ativo: mudar de env não reusa um row que rodou contra outra env. Queries sem refs a env vars têm hash estável entre ambientes. Ver `src/lib/blocks/hash.ts#computeDbCacheHash`.

### E2E block

**UI de input:**

-   **Base URL:** input de texto com autocomplete para variáveis.
    
-   **Default headers:** lista editável de key-value pairs (herdados por todos os steps).
    
-   **Steps:** lista ordenável de steps, cada step com:
    
    -   Name: input de texto.
        
    -   Method: dropdown.
        
    -   URL: input de texto (relativo ao base\_url).
        
    -   Headers: lista editável (override dos defaults).
        
    -   Body: CodeMirror para JSON (quando aplicável).
        
    -   Expect: campos visuais — status (input numérico), JSON match (key-value editor), body contains (lista de strings).
        
    -   Extract: key-value editor (nome da variável → JSON path).
        
-   **Alias:** campo de texto no header do bloco.
    

**UI de output:**

-   Summary: "2/3 passed" com indicador visual (barra de progresso verde/vermelha).
    
-   Lista de steps com: status (check/x), nome, HTTP status, tempo. Expandível para ver: response body, erros de assertion com diff (expected vs received), variáveis extraídas.
    

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

Exemplos: `{{create_order.response.id}}` acessa o campo id do response JSON do bloco create\_order, `{{list_users.response.rows.0.email}}` acessa o email da primeira row de um resultado SQL, `{{create_order.status}}` acessa o HTTP status code.

### Direção

Um bloco só pode referenciar blocos que estão acima dele no documento. Isso garante que o grafo de dependências é um DAG (directed acyclic graph) por construção — ciclos são impossíveis.

### Resolução de dependências

Quando o usuário clica Run num bloco: (1) o parser escaneia o conteúdo buscando referências `{{...}}`, (2) para cada referência, verifica se o bloco alvo tem resultado cacheado no SQLite (block\_results), (3) se não tem cache ou o cache está invalidado (block\_hash mudou), executa o bloco alvo primeiro, (4) o processo é recursivo — o bloco alvo resolve suas próprias dependências antes de executar, (5) após resolver todas as dependências, executa o bloco original, (6) o resultado é salvo no block\_results.

### Dois pipelines de interpolação

**HTTP blocks:** interpolação é string pura — segura porque o resultado é uma URL, header ou body de request HTTP.

**SQL blocks:** referências são convertidas para bind parameters do driver. `WHERE id = {{create_order.response.id}}` vira `WHERE id = $1` com o valor passado via `sqlx::query().bind()`. Nunca há interpolação de string em SQL.

---

## Autocomplete (CodeMirror)

O provider de autocomplete alimenta os campos CodeMirror dentro dos blocos executáveis com três fontes de dados.

**Environment variables:** todas as variáveis do environment ativo. Triggered ao digitar `{{`. Mostra key e valor (masked para secrets). Disponível em todos os campos que aceitam variáveis (URL, headers, body, SQL query).

**Block outputs:** resultados cacheados de blocos anteriores no documento. Triggered ao digitar `{{`. Navega a árvore JSON do response com dot notation. Só mostra blocos que estão acima do bloco atual e que têm alias definido.

**Connection metadata (SQL blocks only):** nomes de tabelas e colunas da conexão selecionada. Obtidos via introspection (INFORMATION\_SCHEMA ou equivalente). Cache com TTL no SQLite (schema\_cache), refresh automático ao conectar ou reconectar. Triggered durante a escrita do SQL (após FROM, JOIN, WHERE, etc.).

---

## Comportamento de execução

### Estados de um bloco

-   **idle** — nunca executado, ou cache invalidado. Output area mostra placeholder.
    
-   **cached** — tem resultado de execução anterior. Output area mostra preview do resultado.
    
-   **running** — execução em andamento. Output area mostra loading indicator.
    
-   **success** — execução bem-sucedida. Output area mostra resultado com status, tempo, e response.
    
-   **error** — execução falhou. Output area mostra mensagem de erro.
    

### Cache e persistência

Quando o app abre um documento, cada bloco executável verifica se há resultado cacheado no block\_results (SQLite) usando file\_path + block\_hash. Se o hash bate (conteúdo não mudou), renderiza o output com o resultado anterior e entra automaticamente em split view. Se o hash não bate, o bloco volta para idle.

### Execução concorrente

Blocos podem ser executados simultaneamente em panes diferentes ou no mesmo documento. Cada execução é independente. Se dois blocos compartilham uma dependência e ambos são executados ao mesmo tempo, a dependência é executada apenas uma vez (lock no block\_id durante execução) e ambos esperam o resultado.

### Paginação de resultados (DB blocks)

Resultados de queries SQL são paginados estilo DBeaver. O backend executa a query e retorna as primeiras N rows (default: 100). O output mostra uma tabela com: cabeçalho com nomes das colunas, rows da página atual, barra de navegação (página anterior, próxima, ir para página, total de rows). O total de rows é armazenado no block\_results para exibir mesmo quando cacheado.

### Response binário (HTTP blocks)

Quando um HTTP response tem content-type binário (imagem, PDF, etc.), o output renderiza o conteúdo inline: imagens são exibidas diretamente, PDFs renderizam com viewer embeddable, outros tipos mostram info do content-type + tamanho. Todos os previews de response binário têm um botão de maximizar que abre o conteúdo em fullscreen dentro do app.

### Timeouts

Timeouts são configuráveis em três níveis: global (app\_config, default para novas conexões), por conexão (campos timeout\_ms e query\_timeout\_ms na tabela connections), e por bloco (campo opcional na UI do bloco). A precedência é: bloco > conexão > global.

### Erros

Erros são exibidos na output area do bloco. Tipos de erro: connection failure (não conseguiu conectar ao banco ou à URL), timeout (com indicação de qual timeout foi atingido e onde configurar), dependency resolution failure (bloco referenciado não existe, não tem alias, ou está abaixo do bloco atual), SQL error (query inválida, com mensagem do driver), HTTP error (status >= 400 pode ou não ser erro dependendo do expect), e2e assertion failure (expect não bateu, com diff do esperado vs recebido).

---

## Busca

### Busca por nome (Ctrl+P)

Quick-open estilo VS Code. Busca fuzzy por nome de arquivo no vault ativo. Abre o arquivo selecionado no pane atual.

### Busca full-text (Ctrl+Shift+F)

Busca por conteúdo dentro de todos os arquivos .md do vault. Usa SQLite FTS5 como engine (tabela search\_index). O índice é atualizado pelo file watcher e ao salvar arquivos. Resultados mostram: nome do arquivo, trecho com match highlighted, e linha. Clicar num resultado abre o arquivo e scroll até o trecho.

---

## Interface

### Layout geral

-   **Top bar:** nome do app, vault selector (dropdown para trocar de vault), environment selector (dropdown), busca (Ctrl+P).
    
-   **Sidebar esquerda:** árvore de arquivos do vault (pastas e .md files), seção de connections com status (conectada/desconectada).
    
-   **Área central:** multi-pane com splits. Cada pane tem: tab bar com arquivos abertos e a área do TipTap editor.
    
-   **Status bar:** connection status, keybinding mode, contagem de panes, environment ativo.
    

### Theme

Light e dark mode. Segue a preferência do OS com opção de override manual nas configurações.

---

## Tauri commands (backend Rust)

O frontend se comunica com o backend Rust via Tauri IPC (invoke). Os commands são:

**Filesystem:** list\_workspace, read\_note, write\_note, create\_note, delete\_note, rename\_note, create\_folder, watch\_vault (inicia file watcher), switch\_vault.

**HTTP executor:** execute\_http\_request — recebe method, url, headers, body (já interpolados para HTTP). Retorna status, status\_text, headers, body (string ou base64 para binário), content\_type, elapsed\_ms, size\_bytes.

**DB executor:** execute\_query — recebe connection\_id, query parametrizada, array de bind values, page (número da página), page\_size (rows por página). Conecta via pool (ou cria pool se não existe), executa com prepared statement, retorna columns, rows, total\_rows, elapsed\_ms. Também: test\_connection para validar uma conexão.

**E2E runner:** run\_e2e\_suite — recebe suite config com steps, executa sequencialmente, resolve extractions entre steps, valida expectations. Retorna resultado por step (passed/failed, errors, response, elapsed\_ms).

**Schema introspection:** introspect\_schema — recebe connection\_id, executa query de introspection adequada ao driver, retorna lista de tabelas e colunas. Salva no schema\_cache com timestamp.

**Config:** get\_config, set\_config — CRUD no app\_config.

**Connections:** list\_connections, create\_connection, update\_connection, delete\_connection, test\_connection.

**Environments:** list\_environments, create\_environment, set\_active\_environment, list\_env\_variables, set\_env\_variable, delete\_env\_variable.

**Block results:** get\_block\_result, save\_block\_result — CRUD no block\_results indexado por file\_path + block\_hash.

**Search:** search\_files (por nome, fuzzy), search\_content (full-text via FTS5), rebuild\_search\_index (reindexar vault completo).

---

## Prioridade de implementação

1.  **Editor markdown** — TipTap com extensions de texto, parser de .md, slash commands, drag and drop, sidebar com file tree, multi-pane, file watcher, session persistence, wikilinks, vault switching, busca.
    
2.  **Database query** — connections manager (com config completa: host, port, ssl, pool, TTL, timeouts), db block UI com connection selector + CodeMirror SQL + autocomplete, execute\_query com prepared statements e paginação estilo DBeaver, schema introspection com cache TTL, split view input/output.
    
3.  **HTTP client** — http block UI com method dropdown + URL input + headers list + CodeMirror body, execute\_http\_request, output com JSON highlighting + preview binário com fullscreen, environments + variables, split view input/output.
    
4.  **E2E test runner** — e2e block UI com step list + expect/extract editors, run\_e2e\_suite, output com pass/fail por step + diff de assertions, extract entre steps.