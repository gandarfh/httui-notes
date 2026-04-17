# Backlog — Notes

## Mapa de dependencias

```
Epic 00 (Project Setup)
├── Epic 09 (UI Shell & Theme)
├── Epic 01 (Editor Markdown)
│   └── Epic 05 (Block System Core)
│       ├── Epic 06 (Database Blocks)
│       ├── Epic 07 (HTTP Client)
│       │   └── Epic 08 (E2E Test Runner)
│       └── [shared] Epic 07 → Epic 08
├── Epic 02 (Vault & Filesystem)
│   ├── Epic 03 (Multi-pane & Session)
│   └── Epic 04 (Search)
├── [shared] Epic 01 → Epic 03
└── Epic 10 (Polish & Pending) ← consolida pendencias de 01-09

Epic 00 (Project Setup)
└── Epic 11 (Chat Sidecar & Protocolo)
    └── Epic 12 (Chat MVP)
        └── Epic 13 (Chat Agente)
            └── Epic 14 (Chat QoL)
```

## Epics

| #   | Epic                                             | Stories | Depende de  | Status  |
| --- | ------------------------------------------------ | ------- | ----------- | ------- |
| 00  | [Project Setup](00-project-setup.md)             | 4       | —           | done    |
| 09  | [UI Shell & Theme](09-ui-shell.md)               | 4       | 00          | done    |
| 01  | [Editor Markdown](01-editor-markdown.md)         | 9       | 00          | done    |
| 02  | [Vault & Filesystem](02-vault-filesystem.md)     | 5       | 00          | done    |
| 03  | [Multi-pane & Session](03-multi-pane-session.md) | 4       | 01, 02      | done    |
| 04  | [Search](04-search.md)                           | 3       | 00, 02      | done    |
| 05  | [Block System Core](05-block-system.md)          | 8       | 00, 01      | done    |
| 06  | [Database Blocks](06-database-blocks.md)         | 7       | 05          | done    |
| 07  | [HTTP Client](07-http-client.md)                 | 6       | 05          | done    |
| 08  | [E2E Test Runner](08-e2e-runner.md)              | 4       | 05, 07      | done    |
| 10  | [Polish & Pending](10-polish-pending.md)         | 10      | 05, 06, 07  | done    |
| 11  | [Chat Sidecar & Protocolo](11-chat-sidecar.md)  | 6       | 00          | done    |
| 12  | [Chat MVP](12-chat-mvp.md)                      | 8       | 11          | wip     |
| 13  | [Chat Agente](13-chat-agente.md)                | 6       | 12          | backlog |
| 14  | [Chat QoL](14-chat-qol.md)                      | 5       | 13          | backlog |

## Ordem sugerida de implementacao

**Fase 1 — Foundation (parallelizable)**

1. Epic 00 — Project Setup
2. Epic 09 — UI Shell & Theme (inicia apos scaffold do Epic 00)

**Fase 2 — Editor core (parallelizable)**

3. Epic 01 — Editor Markdown
4. Epic 02 — Vault & Filesystem (paralelo com 01)

**Fase 3 — Layout & discovery**

5. Epic 03 — Multi-pane & Session
6. Epic 04 — Search (paralelo com 03)

**Fase 4 — Executable blocks**

7. Epic 05 — Block System Core

**Fase 5 — Integrations (parallelizable)**

8. Epic 06 — Database Blocks
9. Epic 07 — HTTP Client (paralelo com 06)

**Fase 6 — E2E**

10. Epic 08 — E2E Test Runner

**Fase 7 — Polish & pendencias**

11. Epic 10 — Polish & Pending (seguranca → pipeline → visual → QoL)

**Fase 8 — Chat infrastructure**

12. Epic 11 — Chat Sidecar & Protocolo (sidecar Node, protocolo NDJSON, SQLite, Tauri commands)

**Fase 9 — Chat UI**

13. Epic 12 — Chat MVP (layout, input texto + imagens, streaming, markdown, sessoes)

**Fase 10 — Chat agent capabilities**

14. Epic 13 — Chat Agente (tools, permissoes, cwd, modal, tool use rendering)

**Fase 11 — Chat polish**

15. Epic 14 — Chat QoL (editar, regerar, abort, busca, integracao notes)

## Metricas

- **Total epics:** 15
- **Total stories:** 89
- **Total tasks:** ~310
