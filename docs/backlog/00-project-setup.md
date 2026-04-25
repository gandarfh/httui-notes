# Epic 00 — Project Setup ✅

Inicializar o projeto Tauri v2 com toda a stack base configurada e pronta para desenvolvimento.

**Depende de:** nada
**Desbloqueia:** todos os outros epics
**Status:** concluido

---

## Story 01: Scaffold Tauri v2

Criar o projeto Tauri v2 com frontend React + TypeScript.

### Tasks

- [x] Inicializar projeto Tauri v2 com template React + TypeScript
- [x] Configurar Cargo.toml com dependencias base (serde, sqlx, tokio, uuid, reqwest)
- [x] Configurar Tauri permissions e capabilities (fs, shell, notification)
- [x] Validar que `cargo tauri dev` abre a janela com o frontend React

## Story 02: Configurar frontend tooling

Setup do frontend com Tailwind, daisyUI, e dependencias core.

### Tasks

- [x] Instalar e configurar Tailwind CSS v4
- [x] Instalar e configurar daisyUI como plugin do Tailwind
- [x] Configurar theme (light/dark) no daisyUI com suporte a preferencia do OS
- [x] Instalar TipTap core (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`)
- [x] Instalar CodeMirror (`@codemirror/view`, `@codemirror/lang-json`, `@codemirror/lang-sql`)
- [x] Configurar path aliases no TypeScript (`@/components`, `@/lib`, etc.)
- [x] Configurar ESLint + Prettier com regras do projeto

## Story 03: Estrutura de pastas do frontend

Definir a organizacao de diretorio do app React.

### Tasks

- [x] Criar estrutura base: `src/components/`, `src/hooks/`, `src/lib/`, `src/stores/`, `src/types/`
- [x] Criar `src/components/editor/` para componentes do TipTap
- [x] Criar `src/components/blocks/` para blocos executaveis (http, db, e2e)
- [x] Criar `src/components/layout/` para shell do app (topbar, sidebar, panes, statusbar)
- [x] Criar `src/lib/tauri/` para wrappers dos Tauri commands

## Story 04: SQLite setup no backend

Criar o banco SQLite interno com migrations.

### Tasks

- [x] Configurar sqlx com SQLite no Rust
- [x] Criar migration inicial com todas as tabelas: `app_config`, `connections`, `environments`, `env_variables`, `block_results`, `schema_cache`, `search_index` (FTS5)
- [x] Implementar inicializacao do banco no startup do app (criar arquivo se nao existe, rodar migrations)
- [x] Implementar Tauri commands basicos: `get_config`, `set_config`
- [x] Escrever testes unitarios para migrations e CRUD do app_config (6 testes passando)