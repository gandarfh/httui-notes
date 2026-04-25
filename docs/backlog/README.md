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

Epic 00, 06, 07, 08 (core Rust, executores)
└── Epic 17 (TUI Foundation — extrai httui-core)
    ├── Epic 18 (TUI Buffer & Rendering)
    │   ├── Epic 19 (TUI Vim Engine)
    │   │   └── Epic 20 (TUI Editor Shell)
    │   │       └── Epic 22 (TUI Integrations)
    │   └── Epic 21 (TUI Block Widgets)
    └── Epic 23 (TUI Polish & Distribution) ← consolida 17-22

Epic 07 (HTTP Client), Epic 16 (DB Security pattern)
└── Epic 24 (HTTP Block Redesign — fenced HTTP message format)
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
| 12  | [Chat MVP](12-chat-mvp.md)                      | 8       | 11          | done    |
| 13  | [Chat Agente](13-chat-agente.md)                | 6       | 12          | done    |
| 14  | [Chat QoL](14-chat-qol.md)                      | 5       | 13          | done    |
| 17  | [TUI Foundation](17-tui-foundation.md)          | 5       | 00, 06-08   | planned |
| 18  | [TUI Buffer & Rendering](18-tui-buffer-rendering.md) | 7  | 17          | planned |
| 19  | [TUI Vim Engine](19-tui-vim-engine.md)          | 16      | 18          | planned |
| 20  | [TUI Editor Shell](20-tui-editor-shell.md)      | 10      | 18, 19      | planned |
| 21  | [TUI Block Widgets](21-tui-block-widgets.md)    | 11      | 18, 19      | planned |
| 22  | [TUI Integrations](22-tui-integrations.md)      | 10      | 17, 20      | planned |
| 23  | [TUI Polish & Distribution](23-tui-polish-distribution.md) | 14 | 17-22       | planned |
| 24  | [HTTP Block Redesign](24-http-block-redesign.md) | 8       | 07, 16      | planned |

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

**Fase 12 — TUI Foundation (serial)**

16. Epic 17 — TUI Foundation (extrai httui-core, scaffold binario, event loop, config)

**Fase 13 — TUI core (parallelizable parcialmente)**

17. Epic 18 — TUI Buffer & Rendering (block tree, parser reuso, prose highlight, reflow)
18. Epic 19 — TUI Vim Engine (modos, motions, operadores, text objects, registers, marks, ex, macros, fronteira bloco/prose) — depende de 18
19. Epic 21 — TUI Block Widgets (HTTP/DB/E2E inline com streaming, cancel, autocomplete) — paralelo com 19

**Fase 14 — TUI shell & integracoes**

20. Epic 20 — TUI Editor Shell (file tree, tabs, splits, quick open, FTS, status bar)
21. Epic 22 — TUI Integrations (connections, envs, keychain, sessao, conflitos, co-existencia desktop) — paralelo com 20

**Fase 15 — TUI polish & release**

22. Epic 23 — TUI Polish & Distribution (temas, help, customizacao, cross-platform, packaging, docs, CI)

**Fase 16 — Block redesign (paralelizavel com TUI)**

23. Epic 24 — HTTP Block Redesign (fenced HTTP-message format, mirror do DB redesign ja entregue)

## Metricas

- **Total epics:** 23
- **Total stories:** 170
- **Total tasks:** ~600
