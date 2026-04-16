# Epic 06 — Database Blocks

Connections manager, DB block UI, execucao de queries com prepared statements, schema introspection, e paginacao estilo DBeaver.

**Depende de:** Epic 05 (Block System)
**Desbloqueia:** nenhum

---

## Story 01: CRUD de connections no backend

Implementar gerenciamento de conexoes no Rust.

### Tasks

- [x] Implementar Tauri commands: `list_connections`, `create_connection`, `update_connection`, `delete_connection`
- [x] Validar campos obrigatorios por driver (postgres precisa de host/port, sqlite precisa de path)
- [ ] Encriptar password via OS keychain (Tauri keychain plugin)
- [x] Implementar `test_connection` — tentar conectar com timeout, retornar sucesso ou mensagem de erro
- [x] Ao atualizar conexao: destruir pool existente e recriar
- [x] Escrever testes com SQLite in-memory como driver de teste

## Story 02: Connection pool

Gerenciar pools de conexao no Rust.

### Tasks

- [x] Usar sqlx com pool por conexao ativa
- [x] Montar connection string internamente a partir dos campos individuais (host, port, database, user, password, ssl_mode)
- [x] Configurar pool com: max_pool_size do registro, timeout_ms como connect_timeout
- [x] Implementar TTL: fechar conexoes idle apos ttl_seconds
- [ ] Manter estado de conexao (connected/disconnected) acessivel pelo frontend
- [ ] Emitir evento Tauri ao mudar estado de conexao (para atualizar UI em tempo real)

## Story 03: UI de connections manager

Interface para gerenciar conexoes na sidebar.

### Tasks

- [x] Criar secao "Connections" na sidebar abaixo do file tree
- [x] Listar conexoes com: nome, driver (icone), status (badge verde/vermelho daisyUI)
- [x] Botao "+" para adicionar nova conexao
- [x] Modal/drawer de criacao/edicao com campos:
  - [x] Name (input text)
  - [x] Driver (select: postgres, mysql, sqlite)
  - [x] Host, Port, Database, Username, Password (inputs, adaptar por driver)
  - [x] SSL Mode (select)
  - [x] Advanced: timeout_ms, query_timeout_ms, ttl_seconds, max_pool_size (colapsavel)
- [x] Botao "Test Connection" no modal com feedback visual (loading -> success/error)
- [x] Context menu na conexao: Edit, Delete, Test, Refresh Schema

## Story 04: DB block UI

Interface do bloco de database no editor.

### Tasks

- [x] Criar TipTap node `DbBlock` estendendo `ExecutableBlock`
- [x] UI de input:
  - [x] Connection selector (dropdown com conexoes disponiveis e status)
  - [x] Query editor (CodeMirror com lang-sql, theme sincronizado com app)
  - [ ] Timeout override (input numerico opcional)
- [x] UI de output:
  - [x] Status badge ("247 rows", badge)
  - [x] Tempo de execucao
  - [x] Tabela paginada (detalhado na Story 05)
  - [x] Para mutacoes: "N rows affected" (badge)
- [ ] Serializar como fenced code block: ` ```db-{driver}:{connection_name} `

## Story 05: Tabela paginada (DBeaver-style)

Renderizar resultados de queries em tabela com paginacao.

### Tasks

- [x] Criar componente `<ResultTable />`
- [x] Cabecalho com nomes das colunas (do array `columns` do resultado)
- [x] Rows da pagina atual com celulas formatadas (truncar valores longos com tooltip)
- [x] Barra de paginacao:
  - [x] Botoes: primeira pagina, anterior, proxima, ultima
  - [x] Input "Go to page" com total de paginas
  - [x] Exibir "Showing 101-200 of 247 rows"
- [x] Page size default: 100, configuravel (dropdown com 25, 50, 100, 500)
- [x] Ao mudar pagina: chamar `execute_query` com page number novo (re-executa com LIMIT/OFFSET)
- [x] Valores NULL renderizam com estilo distinct (texto "NULL" em italico cinza)

## Story 06: Execute query no backend

Implementar execucao de queries SQL no Rust.

### Tasks

- [x] Implementar `execute_query` — recebe connection_id, query parametrizada, bind values, page, page_size
- [x] Obter pool da conexao (criar se nao existe)
- [x] Executar com prepared statement via sqlx (bind parameters, nunca interpolacao)
- [x] Para SELECT: retornar columns (nomes e tipos), rows (pagina atual), total_rows
- [x] Para INSERT/UPDATE/DELETE: retornar rows_affected
- [x] Respeitar query_timeout_ms da conexao (ou override do bloco)
- [x] Tratar erros: connection failure, query syntax error, timeout — com mensagens claras
- [x] Escrever testes com SQLite in-memory

## Story 07: Schema introspection

Metadata de tabelas e colunas para autocomplete.

### Tasks

- [x] Implementar `introspect_schema` no Rust — query de introspection por driver:
  - [x] Postgres: `information_schema.columns`
  - [x] MySQL: `information_schema.columns`
  - [x] SQLite: `pragma table_info` + `sqlite_master`
- [x] Retornar lista de: table_name, column_name, data_type
- [x] Salvar no `schema_cache` com `cached_at` timestamp
- [x] Implementar TTL: se cached_at > TTL, re-introspect automaticamente
- [ ] Refresh automatico ao conectar/reconectar
- [x] Alimentar autocomplete do CodeMirror no SQL editor (tabelas apos FROM/JOIN, colunas apos SELECT/WHERE)
