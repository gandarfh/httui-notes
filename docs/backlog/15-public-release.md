# Epic 15 — Public Release Readiness

Gap analysis based on competitive research (Bruno, Hoppscotch, Insomnia, HTTPie, Paw).

## Alta prioridade

### Import de coleções
- Postman collections (JSON v2.1)
- cURL commands (parse e criar HTTP block)
- OpenAPI specs (gerar blocks a partir de endpoints)
- Todos os concorrentes suportam pelo menos Postman + cURL
- Principal barreira de adoção — sem import, usuário precisa recriar tudo manualmente

### Export
- cURL (mínimo — gerar curl a partir de HTTP block)
- JSON/YAML das coleções
- Usuários não adotam ferramenta que não permite sair
- Bruno recebe críticas por export limitado

### Empty state / Onboarding
- Primeira abertura sem vault: tela de boas-vindas com "Open Folder" ou "Create Vault"
- Vault vazio: sample note com HTTP block de exemplo pronto para rodar
- Bruno pré-carrega uma collection de onboarding
- Insomnia mostra prompts para criar primeiro request

### Versão visível
- Mostrar versão no StatusBar ou About
- Necessário para bug reports
- Todos os concorrentes mostram

## Média prioridade

### Keyboard shortcuts reference
- Painel/modal com lista de atalhos (Cmd+?)
- Bruno tem tab dedicada em Settings
- Insomnia tem tab Keyboard em Preferences
- HTTPie documenta 3 categorias (Global, Request, Editor)

### Report bug / Feedback
- Link no app (Help menu ou Settings) para GitHub Issues
- Insomnia tem Support section
- HTTPie tem feedback@httpie.io
- Facilitar para o usuário reportar

### LICENSE file
- Criar MIT LICENSE na raiz do repo
- README já diz MIT mas não tem o arquivo

### Settings / Preferences
- Tela de configurações no app
- Mínimo: tema (dark/light/system), font size, proxy
- Bruno tem 9 categorias de settings
- Pode ser incremental

## Baixa prioridade

### Command palette (Cmd+K)
- Hoppscotch e HTTPie usam para discovery de features
- Já temos Quick Open (Cmd+P) e Search (Cmd+Shift+F)
- Expandir Quick Open para incluir ações/comandos

### Code generation
- Gerar snippets de código a partir de HTTP blocks (cURL, Python, JS, Go)
- Paw e HTTPie suportam múltiplas linguagens
- Pode ser plugin/extensão futura

### Docs / Getting Started
- Página de docs na landing page ou link para README
- Tutorial básico: "Open folder, type /http, hit run"
- Todos os concorrentes têm docs dedicadas

---

## Notas da pesquisa

**O que mata adoção cedo (evitar):**
- Data loss / crashes perdendo trabalho (já temos auto-save)
- Conta obrigatória (não temos — vantagem)
- UI lenta / laggy (Tauri é rápido — vantagem)
- Sem dark mode (já temos — vantagem)
- Sem import (FALTA)
- Sem export (FALTA)

**Vantagens competitivas do httui (já implementadas):**
- Local-first sem cloud (Insomnia perdeu confiança por forçar login)
- Arquivos .md git-friendly (como Bruno com .bru, mas markdown padrão)
- Block references {{alias.response.path}} (ninguém tem)
- AI integrado com permissões (ninguém tem nativamente)
- Tauri ~15MB vs Electron centenas de MB
- SQL blocks no mesmo doc (ninguém tem)

**Fontes:**
- Bruno (usebruno.com), Hoppscotch (hoppscotch.io), Insomnia (insomnia.rest)
- HTTPie (httpie.io), Paw (paw.cloud)
- "The API Tooling Crisis" (efp.asia, 2025)
- "6 Things Developer Tools Must Have" (Evil Martians, 2026)
