# Epic 00 — Project Setup

Inicializar o projeto Tauri v2 com toda a stack base configurada e pronta para desenvolvimento.

**Depende de:** nada
**Desbloqueia:** todos os outros epics

---

## Story 01: Scaffold Tauri v2

Criar o projeto Tauri v2 com frontend React + TypeScript.

### Tasks

- [ ] Inicializar projeto Tauri v2 com template React + TypeScript
- [ ] Configurar Cargo.toml com dependencias base (serde, sqlx, tokio, uuid, reqwest)
- [ ] Configurar Tauri permissions e capabilities (fs, shell, notification)
- [ ] Validar que `cargo tauri dev` abre a janela com o frontend React

## Story 02: Configurar frontend tooling

Setup do frontend com Tailwind, daisyUI, e dependencias core.

### Tasks

- [ ] Instalar e configurar Tailwind CSS v4
- [ ] Instalar e configurar daisyUI como plugin do Tailwind
- [ ] Configurar theme (light/dark) no daisyUI com suporte a preferencia do OS
- [ ] Instalar TipTap core (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`)
- [ ] Instalar CodeMirror (`@codemirror/view`, `@codemirror/lang-json`, `@codemirror/lang-sql`)
- [ ] Configurar path aliases no TypeScript (`@/components`, `@/lib`, etc.)
- [ ] Configurar ESLint + Prettier com regras do projeto

## Story 03: Estrutura de pastas do frontend

Definir a organizacao de diretorio do app React.

### Tasks

- [ ] Criar estrutura base: `src/components/`, `src/hooks/`, `src/lib/`, `src/stores/`, `src/types/`
- [ ] Criar `src/components/editor/` para componentes do TipTap
- [ ] Criar `src/components/blocks/` para blocos executaveis (http, db, e2e)
- [ ] Criar `src/components/layout/` para shell do app (topbar, sidebar, panes, statusbar)
- [ ] Criar `src/lib/tauri/` para wrappers dos Tauri commands

## Story 04: SQLite setup no backend

Criar o banco SQLite interno com migrations.

### Tasks

- [ ] Configurar sqlx com SQLite no Rust
- [ ] Criar migration inicial com todas as tabelas: `app_config`, `connections`, `environments`, `env_variables`, `block_results`, `schema_cache`, `search_index` (FTS5)
- [ ] Implementar inicializacao do banco no startup do app (criar arquivo se nao existe, rodar migrations)
- [ ] Implementar Tauri commands basicos: `get_config`, `set_config`
- [ ] Escrever testes unitarios para migrations e CRUD do app_config
