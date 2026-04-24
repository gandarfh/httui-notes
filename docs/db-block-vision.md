# DB Block — Visão de substituição do DBeaver

Status: Vision · Author: product
Escopo: o bloco `db-*` e o ambiente ao redor dele.
Dependência: assume o redesign descrito em [`db-block-redesign.md`](./db-block-redesign.md) como pré-requisito (fenced nativo, query crua no body).

---

## 1. Objetivo

Transformar o bloco DB no **ambiente de trabalho principal** para quem hoje usa DBeaver. A meta não é "melhor bloco" — é que uma pessoa trabalhando com banco de dados possa **parar de abrir o DBeaver** porque o Notes resolve 80% do trabalho diário e ganha nos 20% que são notes-native (documentação, versionamento, AI, composição de queries).

## 2. Por que agora

O redesign atual (fenced nativo + info string) libera três coisas que hoje são bloqueadas pela arquitetura:

- Query como texto cru → autocomplete ciente de schema passa a fazer sentido.
- Drawer/toolbar desacoplados da query → espaço para EXPLAIN, export, AI, schema nav.

Se essas três peças não entrarem no desenho agora, adicioná-las depois exige refazer o redesign. Este doc é o guia para não pintar canto.

## 3. Não-objetivos (revisados)

- **Não** recriar todas as telas do DBeaver (backup/restore, import wizard, server admin).
- **Não** suportar dialetos além de Postgres/MySQL/SQLite no curto prazo.
- **Não** competir em volume de tipos exóticos — cobrir o essencial (JSONB, array, uuid, timestamp, enum) e cair num fallback legível para o resto.
- **Não** virar IDE de banco autônoma — o bloco vive dentro do Notes, não é janela standalone.
- **Não** manter sessão transacional compartilhada entre blocos do mesmo doc. `BEGIN` num bloco + `COMMIT` em outro é explicitamente fora de escopo. Transações multi-statement dentro de **um** bloco continuam OK.

---

## 4. Visão geral do layout

Três zonas visíveis ao mesmo tempo:

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│  Notes                                                    🗂 prod (RO) · env: staging │
├───────────┬───────────────────────────────────────────────────┬───────────────────────┤
│  FILES    │                                                   │  SCHEMA   🔎 filter   │
│           │  # Análise de churn Q1                            │  ▼ prod (postgres)    │
│ ▸ notes/  │                                                   │    ▸ public           │
│ ▾ runbook │  Quais usuários churnaram e quanto gastavam?      │    ▾ analytics        │
│   churn.md│                                                   │      ▸ events    125M │
│   onboard │  ```db-postgres alias=churn connection=prod...    │      ▾ users      42K │
│   perf.md │  ┌─ DB churn · prod (RO) ······· ▶  ⚡  ▦  ⤓  ⚙ ┐│       · id    uuid PK │
│           │  │ SELECT user_id, count(*) AS n                 ││       · email text    │
│ ▸ .snippets│  │ FROM events                                   ││       · tier  enum    │
│           │  │ WHERE type='churn'                            ││       · ... (+14)     │
│           │  │   AND created_at > {{START_DATE}}             ││      ▸ subscriptions  │
│           │  │ GROUP BY user_id                              ││      ▸ invoices       │
│           │  │ ORDER BY n DESC LIMIT 100                     ││    ▸ billing          │
│           │  └───────────────────────────────────────────────┘│                       │
│           │  ┌─ Result · Messages · Plan · Stats ────────────┐│  ▸ staging (mysql)    │
│           │  │ user_id              │ n                      ││  ▸ local (sqlite)     │
│           │  │ 7f3a…  [→]           │ 47                     ││                       │
│           │  │ 9c21…  [→]           │ 31                     ││                       │
│           │  │ 4e88…  [→]           │ 28                     ││                       │
│           │  │ ... 97 more          │                        ││                       │
│           │  │       [ load 100 more ]                       ││                       │
│           │  └───────────────────────────────────────────────┘│                       │
│           │  prod · 100 rows · 43ms · cached · ran 2m ago    │                       │
└───────────┴───────────────────────────────────────────────────┴───────────────────────┘
```

Zonas:

- **Esquerda** — file tree (já existe).
- **Centro** — doc markdown com blocos.
- **Direita** — schema panel (novo). Toggleável com `Cmd+\` para quem quer foco.
- **Topo** — contexto global: connection ativa + modo (RO/RW) + env ativa.

---

## 5. Estados do bloco

### 5.1 Estado padrão (cursor fora)

```
┌─ DB  churn · prod (RO) ·············· ▶   ⚡   ▦   ⤓   ⚙ ─┐
│ SELECT user_id, count(*) AS n                               │
│ FROM events                                                 │
│ WHERE type = 'churn'                                        │
│   AND created_at > {{START_DATE}}                           │
│ GROUP BY user_id                                            │
│ ORDER BY n DESC LIMIT 100                                   │
└─────────────────────────────────────────────────────────────┘
┌─ Result(100) · Messages · Plan · Stats ────────────────────┐
│ user_id                        │ n                          │
├────────────────────────────────┼────────────────────────────┤
│ 7f3a8b2c-…  [→ users]          │ 47                         │
│ 9c217e4d-…  [→ users]          │ 31                         │
│ 4e883f1a-…  [→ users]          │ 28                         │
│ ... 97 more rows                                             │
│                    [ load 100 more ]                        │
└─────────────────────────────────────────────────────────────┘
 prod · 100 rows · 43ms · cached · ran 2m ago · ⌘↵ to run
```

Toolbar, da esquerda pra direita: **badge DB** + alias + connection + modo, **▶** run, **⚡** AI, **▦** EXPLAIN, **⤓** export, **⚙** settings.
Result é tab-set: **Result / Messages / Plan / Stats**.
`[→ users]` = FK navigation (abre bloco com a row referenciada).
Status bar no rodapé.

### 5.2 Cursor dentro do bloco

````
```db-postgres alias=churn connection=prod limit=100
SELECT user_id, count(*) AS n
FROM events
WHERE type = 'churn'
  AND created_at > {{START_DATE}}
GROUP BY user_id
ORDER BY n DESC LIMIT 100
```
┌─ Result(100) · Messages · Plan · Stats ────────────────────┐
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
````

Fence vira texto cru editável. Result permanece visível. Toolbar some — atalhos tomam o lugar (`⌘↵` roda, `⌘⇧F` formata, `⌘.` cancela).

### 5.3 Executando

```
┌─ DB  churn · prod (RO) ········· ⏹  running…  ⚡   ▦   ⤓   ⚙ ─┐
│ SELECT user_id, count(*) AS n                                   │
│ FROM events                                                     │
│ WHERE type = 'churn'                                            │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
┌─ Result · Messages · Plan · Stats ─────────────────────────────┐
│                                                                 │
│            ⣾  streaming… 12,480 rows received                   │
│            [ cancel ]                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
 prod · running 3.2s · ⌘. to cancel
```

▶ vira **⏹**. Spinner + contador de rows streamed. Cancel via atalho ou botão.

### 5.4 Múltiplos result sets (transação)

```
┌─ DB  refund-txn · prod (RO) ······ ▶  ⚡  ▦  ⤓  ⚙ ─┐
│ BEGIN;                                               │
│ UPDATE users SET tier='free' WHERE id={{u.id}};      │
│ SELECT id, tier FROM users WHERE id={{u.id}};        │
│ ROLLBACK;  -- dry-run                                │
└─────────────────────────────────────────────────────┘
┌─ Result 1 · Result 2 · Messages · Plan · Stats ────┐
│   [1: UPDATE]  [2: SELECT●]  [Msg(4)]              │
│ ───────────────────────────────────────────────    │
│  id                    │ tier                      │
│ ───────────────────────┼────────────────────────── │
│  7f3a8b2c-…            │ free                      │
└────────────────────────────────────────────────────┘
 prod · 3 statements · 1 row updated, 1 row read · 12ms
```

Sub-tabs dentro de "Result" quando há N result sets. Comentário `-- dry-run` detectado → badge + toolbar verde.

### 5.5 Erro com squiggle

```
┌─ DB  broken · prod (RO) ············ ▶  ⚡  ▦  ⤓  ⚙ ─┐
│ SELECT user_id, count(*) AS n                         │
│ FROM evnts                                            │
│      ~~~~~                                            │
│ WHERE type = 'churn'                                  │
└───────────────────────────────────────────────────────┘
┌─ Result · Messages(1) ● · Plan · Stats ──────────────┐
│  ✗ relation "evnts" does not exist                    │
│      at line 2, col 6                                 │
│      did you mean "events"?   [ apply fix ]           │
└───────────────────────────────────────────────────────┘
 prod · failed in 8ms
```

Erro estruturado com line/col → squiggle no token. Fuzzy match contra schema cache sugere fix aplicável em um clique.

### 5.6 Drawer de settings

```
┌─ DB  churn · prod (RO) ··· ▶ ⚡ ▦ ⤓ ⚙● ─┐    ┌─ Block settings ─── × ─┐
│ SELECT user_id, count(*) AS n            │    │                          │
│ FROM events                              │    │ Alias                    │
│ WHERE type = 'churn'                     │    │ ┌──────────────────────┐ │
│ ...                                      │    │ │ churn                │ │
└──────────────────────────────────────────┘    │ └──────────────────────┘ │
┌─ Result(100) ... ─────────────────────────┐    │                          │
│ ...                                       │    │ Connection               │
└───────────────────────────────────────────┘    │ ┌──────────────────────┐ │
                                                  │ │ prod (postgres)   ▼ │ │
                                                  │ └──────────────────────┘ │
                                                  │  readonly mode  ●●○      │
                                                  │                          │
                                                  │ Row limit                │
                                                  │ ┌───────┐                │
                                                  │ │ 100   │                │
                                                  │ └───────┘                │
                                                  │                          │
                                                  │ Timeout (ms)             │
                                                  │ ┌───────┐                │
                                                  │ │ 30000 │                │
                                                  │ └───────┘                │
                                                  │                          │
                                                  │ Display                  │
                                                  │ ○ input                  │
                                                  │ ● split                  │
                                                  │ ○ output                 │
                                                  │                          │
                                                  │ Resolved bindings (2)    │
                                                  │  $1 START_DATE = 2025…   │
                                                  │                          │
                                                  │ ─────────────────────    │
                                                  │ [ Delete block ]         │
                                                  └──────────────────────────┘
```

Portal lateral (não `Dialog.Root`). Toggle de readonly inline. **Resolved bindings** mostra o mapeamento `{{ref}} → $N` resolvido — debug que DBeaver não tem.

### 5.7 Menu de export

```
                                           ┌─ Export 100 rows ──┐
                                           │  ⊞  CSV            │
                                           │  { } JSON          │
                                           │  ▦  Markdown table │
                                           │  ⬚  INSERT stmts   │
                                           │  ───────────────   │
                                           │  📋 Copy to clip   │
                                           │  💾 Save to file…  │
                                           └────────────────────┘
```

### 5.8 AI assist

```
┌─ Ask about this query ······ schema context: prod ── × ─┐
│                                                          │
│  ○ Explain          ○ Optimize         ○ Find bugs       │
│  ○ Add pagination   ○ Convert to CTE   ○ Custom…         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ How would I pivot this by week instead of user?  │   │
│  └──────────────────────────────────────────────────┘   │
│                                      [ Ask Claude ⏎ ]    │
│  ─────────────────────────────────────────────────       │
│  Suggested rewrite (schema-aware):                       │
│                                                          │
│   SELECT date_trunc('week', created_at) AS wk,           │
│          count(*) AS n                                   │
│   FROM events                                            │
│   WHERE type = 'churn' AND created_at > {{START_DATE}}   │
│   GROUP BY wk ORDER BY wk                                │
│                                                          │
│   [ Replace ]  [ Insert as new block ]  [ Discard ]      │
└──────────────────────────────────────────────────────────┘
```

Presets + prompt livre. Schema do `connection` ativo vai no contexto do Claude via MCP. Output dá três ações.

### 5.9 Chart inline

```
┌─ Result · Chart · Messages · Plan ─────────────────────┐
│  View: ○ table  ● line  ○ bar  ○ pie                   │
│                                                         │
│    n                                                    │
│  50 ┤                ╭─╮                                │
│  40 ┤              ╭─╯ ╰╮                               │
│  30 ┤           ╭──╯    ╰─╮                             │
│  20 ┤        ╭──╯          ╰─╮                          │
│  10 ┤     ╭──╯                ╰──╮                      │
│   0 ┼─────┴──────────────────────┴─────────────         │
│      w1   w2   w3   w4   w5   w6   w7                   │
└─────────────────────────────────────────────────────────┘
```

Tab "Chart" aparece quando o shape do result permite (≥1 numérica + ≥1 categórica/temporal).

---

## 6. Features por camada

### 6.1 Bloqueantes — sem estas, ninguém larga DBeaver

| # | Feature | Onde entra | Complexidade |
|---|---|---|---|
| B1 | Schema browser permanente | Painel direito | Alta |
| B2 | Autocomplete ciente de schema (tabelas/colunas/FK) | CM6 no bloco | Média |
| B3 | Múltiplas statements por bloco + multi result set | `DbResponse` shape + executor | Alta |
| B5 | Cancelar query em andamento | Executor + UI ⏹ | Média |
| B6 | Paginação real + streaming | Channel + grid virtualizado | Alta |
| B7 | Modo read-only por conexão | Flag + confirm dialog | Baixa |
| B8 | Erro com line/col + squiggle | Parse error postgres/mysql | Média |
| B9 | Export (CSV/JSON/MD/INSERT/clip) | Menu ⤓ | Baixa |

### 6.2 Data editor

| # | Feature | Complexidade |
|---|---|---|
| D1 | "Gerar UPDATE/DELETE" a partir de row do result | Baixa |
| D2 | "Novo registro" (form derivado de colunas) | Média |
| D3 | Editar célula inline + commit explícito | Alta |

### 6.3 Diferenciais notes-native (lean into these)

| # | Feature | Por que ganha de DBeaver |
|---|---|---|
| N1 | Histórico vault-wide de queries (Cmd+P) | DBeaver só tem history por janela |
| N2 | AI schema-aware (explain/optimize/bugs/rewrite) | Nada comparável no DBeaver |
| N3 | Chart inline do result | Notes-native, markdown friendly |
| N4 | Dry-run para destrutivas | DBeaver tem, mas não integrado |
| N5 | Pipeline `{{alias.response…}}` entre queries | DBeaver tem linked queries ruins |
| N6 | Git-versioned com comentário em prosa | Sem equivalente |
| N7 | ERD Mermaid gerado do schema | "Grátis" dado o schema cache |
| N8 | Resolved bindings debug no drawer | Transparência que DBeaver esconde |

### 6.4 Secundários (quando der)

| # | Feature |
|---|---|
| S1 | EXPLAIN ANALYZE com plan em árvore colapsável |
| S2 | SQL formatter (`sql-formatter`) |
| S3 | Schema diff entre duas conexões |
| S4 | Snippets library (`.snippets/*.sql` ou `.md`) |
| S5 | Warning de full table scan antes do run |
| S6 | Server stats panel (`pg_stat_activity`) |
| S7 | FK navigation no result → bloco novo |
| S8 | Keymap DBeaver-compat opcional |
| S9 | Renderização de tipos exóticos (JSONB, array, interval, tsrange, enum, uuid, bytea, hstore) |

---

## 7. Decisões arquiteturais que não dão para adiar

Listadas em ordem de custo-se-adiado. Qualquer uma delas depois do launch = reescrita.

### 7.1 Shape do response (multi result set)

Mudança proposta em `src/components/blocks/db/types.ts`:

```ts
type DbResponse = {
  results: Array<DbSelectResponse | DbMutationResponse | DbError>;
  messages: DbMessage[];         // NOTICE, WARNING, RAISE etc.
  plan?: ExplainPlan;            // presente se ▦ foi usado
  stats: { elapsed_ms: number; rows_streamed?: number };
};
```

Se sair como está hoje (`columns+rows` OU `rows_affected`) e depois virar multi, **todas as refs `{{alias.response...}}` salvas nos vaults quebram**.

### 7.2 Executor com cancel token

Assinatura:

```rust
fn execute_query(
  &self,
  query: &str,
  binds: &[BindValue],
  fetch_size: Option<usize>,
  cancel: CancellationToken,
) -> impl Stream<Item = DbChunk>;
```

Retorno streamed via `tauri::Channel`. Hoje é `Future<DbResponse>` único. Mudar depois = refatorar toda chamada.

### 7.3 Identifier de connection no info string

**Decisão pendente.** Três alternativas (ver seção 2 do redesign):
- UUID (péssimo raw) · Slug (colide em rename) · Quoted name (requer parser mais rico).

**Proposta:** UUID + alias opcional (`connection=prod`) com resolução: slug primeiro, fallback UUID. Mantém legibilidade sem perder estabilidade.

### 7.4 Schema cache compartilhado

Autocomplete, ERD, FK-nav, AI, full-scan warning — todos precisam do mesmo snapshot de schema. Centralizar em **um** store (Zustand ou Tauri state) com TTL e refresh explícito. Evita 5 caches divergentes.

### 7.5 Result storage

Recomendação: **não** introduzir Zustand `dbResults` novo. Reusar cache SQLite (já existe) + `Channel` para execuções live. Refs `{{alias.response…}}` leem do cache. Execução em andamento publica via Channel para o widget.

---

## 8. Roadmap

Cada V termina mergeable e usável.

### V1 — MVP de substituição

Foco: 80% do trabalho diário sai do DBeaver.

- Redesign fenced nativo concluído (pré-requisito, ver `db-block-redesign.md`).
- **B1** schema panel (read-only, browser + filter + insert SELECT no bloco).
- **B2** autocomplete schema-aware.
- **B7** read-only mode por conexão.
- **B8** erro com line/col + squiggle.
- **B9** export CSV/JSON/MD/clip.
- **B5** cancel.
- **S1** EXPLAIN button (plan cru, ainda sem render bonito).

Ao fim da V1, um dev backend deve conseguir rodar o dia inteiro sem abrir DBeaver para consultas e análises — só cairia pro DBeaver em data editing pesado.

### V2 — Diferenciação

Foco: razões para **preferir** Notes sobre DBeaver.

- **B3** multi result set (shape novo).
- **B6** paginação/streaming real.
- **N1** histórico vault-wide (Cmd+P).
- **N2** AI schema-aware.
- **N3** chart inline.
- **N4** dry-run.
- **D1** gerar UPDATE/DELETE a partir de row.
- **S9** tipos exóticos (JSONB, array, uuid, enum, tsrange).

### V3 — Power user

Foco: fechar as lacunas onde ainda se abre DBeaver.

- **D2** novo registro via form.
- **D3** edit inline de célula.
- **S7** FK navigation.
- **N7** ERD Mermaid gerado.
- **S3** schema diff.
- **S5** warning de full scan.
- **S6** server stats panel.
- **S4** snippets library.
- **S1** EXPLAIN com árvore interativa.
- **S2** formatter.

---

## 9. Pontos abertos

- **Identifier de connection** (seção 7.4) — decidir antes da V1.
- **Keymap DBeaver-compat** (S8) — opcional ou default? Opt-in no settings parece certo.
- **ERD como bloco mermaid vs overlay dedicado** — sendo bloco, fica versionado. Overlay é mais interativo mas não persiste. Bloco vence.
- **Limite máximo de rows renderizadas** — 10k? 50k? Dependente de virtualização.
- **Interação schema panel ↔ doc com múltiplas conexões** — se o doc tem 3 blocos com 3 connections, qual aparece no panel? Proposta: o panel expande por connection e rola; destaca o da connection do bloco ativo.
- **AI cost** — Claude calls via MCP têm custo. Deve haver toggle global "AI on/off" ou quota visível.
- **Compactação do schema para contexto Claude** — 125M row `events` tem 50+ colunas × 20 tabelas. Enviar schema todo por chamada = caro. Decidir escopo: só tabelas referenciadas na query? Top N por relevância?
- **Readonly mode — quem define?** Flag no connection record (persistida) ou inferido por role do banco? Proposta: flag manual, com aviso se role do banco já é readonly (redundante mas consistente).

---

## 10. Referências

- [`db-block-redesign.md`](./db-block-redesign.md) — redesign do formato fenced nativo (pré-requisito).
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — plugin architecture (contexto do registry).
- [`SPEC.md`](./SPEC.md) — especificação geral do produto.
- [`chat-design.md`](./chat-design.md) — design do chat (base para AI schema-aware via MCP).
