# Epic 06 — Database Blocks

Connections manager, DB block UI, execucao de queries com prepared statements, schema introspection, e paginacao estilo DBeaver.

**Depende de:** Epic 05 (Block System)
**Desbloqueia:** nenhum
**Status:** Implementado

---

## Story 01: CRUD de connections no backend

Implementar gerenciamento de conexoes no Rust.

### Tasks

- [x] Implementar Tauri commands: `list_connections`, `create_connection`, `update_connection`, `delete_connection`
- [x] Validar campos obrigatorios por driver (postgres precisa de host/port, sqlite precisa de path)
- [x] Encriptar password via OS keychain — `keyring` crate em `keychain.rs`, sentinel `__KEYCHAIN__` no SQLite
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
- [x] Manter estado de conexao (connected/disconnected) acessivel pelo frontend — `useConnectionStatus.ts`
- [x] Emitir evento Tauri ao mudar estado de conexao (para atualizar UI em tempo real) — `PoolManager` emite `connection-status`

## Story 03: UI de connections manager

Interface para gerenciar conexoes na sidebar.

### Tasks

- [x] Criar secao "Connections" na sidebar abaixo do file tree
- [x] Listar conexoes com: nome, driver (icone), status (badge verde/vermelho)
- [x] Botao "+" para adicionar nova conexao
- [x] Form de criacao/edicao (Portal + Box, sem Dialog) com campos:
  - [x] Name (input text)
  - [x] Driver (select: postgres, mysql, sqlite)
  - [x] Host, Port, Database, Username, Password (inputs, adaptar por driver)
  - [x] SSL Mode (select)
  - [x] Advanced: timeout_ms, query_timeout_ms, ttl_seconds, max_pool_size (colapsavel)
- [x] File browse nativo para SQLite (filtro .db/.sqlite/.sqlite3)
- [x] Botao "Test Connection" no form com feedback visual (loading -> success/error)
- [x] Context menu na conexao: Edit, Delete, Test, Refresh

## Story 04: DB block UI

Interface do bloco de database no editor.

### Tasks

- [x] Criar TipTap node `DbBlock` estendendo `ExecutableBlock`
- [x] Slash command `/database query` para inserir DB block
- [x] UI de input:
  - [x] Connection selector (dropdown com conexoes disponiveis)
  - [x] Query editor (CodeMirror com lang-sql, dialect por driver, theme sincronizado)
  - [x] Timeout override (input numerico opcional) — aba Settings no `DbInput`
- [x] UI de output:
  - [x] Status badge ("N rows")
  - [x] Tempo de execucao
  - [x] Tabela paginada (Story 05)
  - [x] Para mutacoes: "N rows affected" (badge)
  - [x] Erros visiveis (switch automatico para split mode)
- [x] Serializar como fenced code block: ` ```db ` com metadata (alias, displayMode)
- [x] Persistencia markdown (roundtrip save/reload)
- [x] Block references: `{{alias.response.rows.0.coluna}}` com bind params (nunca interpolacao)
- [x] Rows como objetos (keyed por nome da coluna, nao arrays)

## Story 05: Tabela paginada (DBeaver-style)

Renderizar resultados de queries em tabela com paginacao.

### Tasks

- [x] Criar componente `<ResultTable />`
- [x] Cabecalho com nomes das colunas (sticky headers)
- [x] Rows da pagina atual com celulas formatadas (truncar valores longos com tooltip)
- [x] Barra de paginacao:
  - [x] Botoes: primeira pagina, anterior, proxima, ultima
  - [x] Input "Go to page" com total de paginas
  - [x] Exibir "Showing 101-200 of 247 rows"
- [x] Page size default: 100, configuravel (dropdown com 25, 50, 100, 500)
- [x] Ao mudar pagina: re-executa com LIMIT/OFFSET
- [x] Valores NULL renderizam com estilo distinct (texto "NULL" em italico cinza)

## Story 06: Execute query no backend

Implementar execucao de queries SQL no Rust.

### Tasks

- [x] Implementar `execute_query` — recebe connection_id, query parametrizada, bind values, page, page_size
- [x] Obter pool da conexao (criar se nao existe)
- [x] Executar com prepared statement via sqlx (bind parameters, nunca interpolacao)
- [x] Para SELECT: retornar columns (nomes e tipos), rows como objetos, total_rows
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
- [x] Refresh automatico ao conectar/reconectar — listener `connection-status` em `DbInput`
- [x] SQL autocomplete context-aware:
  - [x] Tabelas (TBL) e colunas (COL) com icons de texto coloridos
  - [x] Colunas filtradas por tabelas no FROM/JOIN
  - [x] Colunas mostram tabela de origem no detalhe
  - [x] Keywords SQL (SQL) por dialect
  - [x] Referências {{...}} (REF) coexistem com SQL autocomplete

---

## Pendente (futuro)

- [x] Encriptar passwords via OS keychain — `keychain.rs`
- [x] Estado de conexao (connected/disconnected) em tempo real — `useConnectionStatus.ts`
- [x] Eventos Tauri ao mudar estado de conexao — `PoolManager` emite `connection-status`
- [x] Timeout override UI no bloco DB — aba Settings em `DbInput`
- [x] Refresh automatico de schema ao conectar/reconectar — listener `connection-status`
- [x] Query editor auto-height (80px-400px) — cresce conforme conteudo
- [x] Botao de format SQL (sql-formatter) — formata query com indentacao
- [x] Auto-format em queries criadas externamente (MCP) via `parseBlockData`
- [x] Re-sync de conteudo local quando bloco e atualizado externamente (MCP/file-reloaded)
