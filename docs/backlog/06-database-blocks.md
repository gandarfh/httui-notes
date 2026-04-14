# Epic 06 — Database Blocks

Connections manager, DB block UI, execucao de queries com prepared statements, schema introspection, e paginacao estilo DBeaver.

**Depende de:** Epic 05 (Block System)
**Desbloqueia:** nenhum

---

## Story 01: CRUD de connections no backend

Implementar gerenciamento de conexoes no Rust.

### Tasks

- [ ] Implementar Tauri commands: `list_connections`, `create_connection`, `update_connection`, `delete_connection`
- [ ] Validar campos obrigatorios por driver (postgres precisa de host/port, sqlite precisa de path)
- [ ] Encriptar password via OS keychain (Tauri keychain plugin)
- [ ] Implementar `test_connection` — tentar conectar com timeout, retornar sucesso ou mensagem de erro
- [ ] Ao atualizar conexao: destruir pool existente e recriar
- [ ] Escrever testes com SQLite in-memory como driver de teste

## Story 02: Connection pool

Gerenciar pools de conexao no Rust.

### Tasks

- [ ] Usar sqlx com pool por conexao ativa
- [ ] Montar connection string internamente a partir dos campos individuais (host, port, database, user, password, ssl_mode)
- [ ] Configurar pool com: max_pool_size do registro, timeout_ms como connect_timeout
- [ ] Implementar TTL: fechar conexoes idle apos ttl_seconds
- [ ] Manter estado de conexao (connected/disconnected) acessivel pelo frontend
- [ ] Emitir evento Tauri ao mudar estado de conexao (para atualizar UI em tempo real)

## Story 03: UI de connections manager

Interface para gerenciar conexoes na sidebar.

### Tasks

- [ ] Criar secao "Connections" na sidebar abaixo do file tree
- [ ] Listar conexoes com: nome, driver (icone), status (badge verde/vermelho daisyUI)
- [ ] Botao "+" para adicionar nova conexao
- [ ] Modal/drawer daisyUI de criacao/edicao com campos:
  - [ ] Name (input text)
  - [ ] Driver (select: postgres, mysql, sqlite)
  - [ ] Host, Port, Database, Username, Password (inputs, adaptar por driver)
  - [ ] SSL Mode (select)
  - [ ] Advanced: timeout_ms, query_timeout_ms, ttl_seconds, max_pool_size (colapsavel)
- [ ] Botao "Test Connection" no modal com feedback visual (loading -> success/error)
- [ ] Context menu na conexao: Edit, Delete, Test, Refresh Schema

## Story 04: DB block UI

Interface do bloco de database no editor.

### Tasks

- [ ] Criar TipTap node `DbBlock` estendendo `ExecutableBlock`
- [ ] UI de input:
  - [ ] Connection selector (dropdown daisyUI com conexoes disponiveis e status)
  - [ ] Query editor (CodeMirror com lang-sql, theme sincronizado com app)
  - [ ] Timeout override (input numerico opcional)
- [ ] UI de output:
  - [ ] Status badge ("247 rows", daisyUI `badge badge-success`)
  - [ ] Tempo de execucao
  - [ ] Tabela paginada (detalhado na Story 05)
  - [ ] Para mutacoes: "N rows affected" (daisyUI `alert alert-info`)
- [ ] Serializar como fenced code block: ` ```db-{driver}:{connection_name} `

## Story 05: Tabela paginada (DBeaver-style)

Renderizar resultados de queries em tabela com paginacao.

### Tasks

- [ ] Criar componente `<ResultTable />` usando daisyUI `table`
- [ ] Cabecalho com nomes das colunas (do array `columns` do resultado)
- [ ] Rows da pagina atual com celulas formatadas (truncar valores longos com tooltip)
- [ ] Barra de paginacao com daisyUI `join` + `btn`:
  - [ ] Botoes: primeira pagina, anterior, proxima, ultima
  - [ ] Input "Go to page" com total de paginas
  - [ ] Exibir "Showing 101-200 of 247 rows"
- [ ] Page size default: 100, configuravel (dropdown com 25, 50, 100, 500)
- [ ] Ao mudar pagina: chamar `execute_query` com page number novo (nao re-executa a query, usa cursor/offset)
- [ ] Valores NULL renderizam com estilo distinct (texto "NULL" em italico cinza)

## Story 06: Execute query no backend

Implementar execucao de queries SQL no Rust.

### Tasks

- [ ] Implementar `execute_query` — recebe connection_id, query parametrizada, bind values, page, page_size
- [ ] Obter pool da conexao (criar se nao existe)
- [ ] Executar com prepared statement via sqlx (bind parameters, nunca interpolacao)
- [ ] Para SELECT: retornar columns (nomes e tipos), rows (pagina atual), total_rows
- [ ] Para INSERT/UPDATE/DELETE: retornar rows_affected
- [ ] Respeitar query_timeout_ms da conexao (ou override do bloco)
- [ ] Tratar erros: connection failure, query syntax error, timeout — com mensagens claras
- [ ] Escrever testes com SQLite in-memory

## Story 07: Schema introspection

Metadata de tabelas e colunas para autocomplete.

### Tasks

- [ ] Implementar `introspect_schema` no Rust — query de introspection por driver:
  - [ ] Postgres: `information_schema.columns`
  - [ ] MySQL: `information_schema.columns`
  - [ ] SQLite: `pragma table_info` + `sqlite_master`
- [ ] Retornar lista de: table_name, column_name, data_type
- [ ] Salvar no `schema_cache` com `cached_at` timestamp
- [ ] Implementar TTL: se cached_at > TTL, re-introspect automaticamente
- [ ] Refresh automatico ao conectar/reconectar
- [ ] Alimentar autocomplete do CodeMirror no SQL editor (tabelas apos FROM/JOIN, colunas apos SELECT/WHERE)
