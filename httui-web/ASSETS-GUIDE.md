# httui Landing Page — Guia de Assets (GIFs e Screenshots)

Lista completa de todos os assets visuais necessarios, com specs e instrucoes de captura.

---

## Resumo

| # | Tipo | Nome | Secao | Dimensoes | Formato |
|---|------|------|-------|-----------|---------|
| 1 | GIF/Video | hero-demo | Hero | 1200x750 | GIF ou MP4+WebM |
| 2 | Screenshot | http-block | Core Features | 900x500 | PNG |
| 3 | Screenshot | db-block | Core Features | 900x500 | PNG |
| 4 | GIF | e2e-block | Core Features | 900x500 | GIF |
| 5 | GIF | block-references | Core Features | 900x500 | GIF |
| 6 | Screenshot | multi-pane | Editor Features | 800x400 | PNG |
| 7 | Screenshot | vim-mode | Editor Features | 400x60 | PNG |
| 8 | Screenshot | environments | Editor Features | 600x400 | PNG |
| 9 | Screenshot | search | Editor Features | 600x400 | PNG |
| 10 | Screenshot | mermaid | Editor Features | 500x300 | PNG |
| 11 | GIF | slash-commands | Editor Features | 500x300 | GIF |
| 12 | GIF | ai-chat | AI Integration | 1000x600 | GIF |
| 13 | Screenshot | md-file | Storage | 800x300 | PNG |
| 14 | GIF | getting-started | Getting Started | 1000x600 | GIF |
| 15 | Image | og-image | Meta/SEO | 1200x630 | PNG |

**Total: 6 GIFs + 8 Screenshots + 1 OG Image = 15 assets**

---

## Instrucoes Gerais de Captura

### Configuracao do app
- **Tema:** Dark mode (sempre)
- **Font size:** Default ou ligeiramente aumentado para legibilidade
- **Window size:** Maximizado em tela 1440p ou 1080p
- **Dados:** Use dados realistas, nao "test" ou "lorem ipsum"
  - URLs: `https://api.example.com/v1/users`, `https://api.example.com/v1/orders`
  - JSON: `{ "id": 42, "name": "Alice Johnson", "email": "alice@example.com" }`
  - SQL: `SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id`
  - Aliases: `create-user`, `get-orders`, `auth-token`

### Ferramentas recomendadas
- **Screenshots:** macOS nativo (Cmd+Shift+4) ou CleanShot X
- **GIFs:** Kap (macOS, gratis) ou CleanShot X
- **Video:** OBS (gratis) — converter para GIF com `ffmpeg` ou usar `<video>` tag
- **Edicao:** Figma ou Preview para crop e annotations

### Otimizacao
- **GIFs:** Otimizar com `gifsicle --optimize=3 --lossy=80`
- **PNGs:** Otimizar com `pngquant` ou `optipng`
- **Target:** GIFs < 2MB, PNGs < 500KB
- **Alternativa:** Usar `<video>` com MP4 (H.264) + WebM (VP9) em vez de GIF para hero e assets grandes. Muito menor e melhor qualidade.

---

## Instrucoes Detalhadas por Asset

### 1. hero-demo (GIF/Video)

**O que mostrar:**
1. Editor aberto com um documento markdown (titulo, paragrafo)
2. Cursor no fim do doc, digitar `/http`
3. Menu de slash commands aparece, selecionar HTTP
4. Bloco HTTP aparece — preencher GET `https://api.example.com/v1/users`
5. Clicar no botao Run (play)
6. Response aparece: status 200, JSON com lista de users
7. Abaixo, outro bloco ja referenciando `{{get-users.response[0].id}}`

**Duracao:** 8-12 segundos
**Dicas:**
- Mover o mouse devagar e com intencao
- Pausar 0.5s nos pontos importantes (response aparecendo)
- Comecar e terminar no mesmo frame para loop suave

---

### 2. http-block (Screenshot)

**O que mostrar:**
- Bloco HTTP em split mode (input + output)
- Input: POST method (azul), URL `{{base_url}}/api/users`
- Tab Body selecionada com JSON: `{ "name": "Alice", "email": "alice@example.com" }`
- Output: Status badge "201 Created" (verde), elapsed "142ms", size "86 B"
- Response body JSON formatado com o user criado (com id)

**Enquadramento:** Crop justo no bloco, incluindo o alias label no topo

---

### 3. db-block (Screenshot)

**O que mostrar:**
- Bloco DB em split mode
- Connection selector mostrando "Local PostgreSQL"
- SQL editor: `SELECT u.name, u.email, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id LIMIT 10`
- Tabela de resultados com 5-6 rows, colunas name/email/order_count
- Paginacao visivel no rodape da tabela

**Enquadramento:** Crop justo no bloco

---

### 4. e2e-block (GIF)

**O que mostrar:**
1. Bloco E2E com 3 steps visiveis:
   - Step 1: POST `/api/auth/login` (extrair token)
   - Step 2: GET `/api/users/me` com header `Authorization: Bearer {{token}}`
   - Step 3: PUT `/api/users/me` com body de update
2. Clicar Run
3. Steps mudando de idle -> running -> pass (com animacao)
4. Summary bar: "3/3 passed" com barra verde

**Duracao:** 6-8 segundos

---

### 5. block-references (GIF)

**O que mostrar:**
1. Documento com 2 blocos:
   - Bloco HTTP `create-user`: POST que retorna `{ "id": 42, "name": "Alice" }`
   - Bloco DB `verify-user`: `SELECT * FROM users WHERE id = {{create-user.response.id}}`
2. Hover no `{{create-user.response.id}}` mostrando tooltip "42"
3. Executar o bloco DB — mostrar que ele auto-executa o HTTP primeiro
4. Resultado da query mostrando o user com id 42

**Duracao:** 8-10 segundos

---

### 6. multi-pane (Screenshot)

**O que mostrar:**
- 2 ou 3 panes lado a lado
- Pane esquerdo: arquivo `api-docs.md` com blocos HTTP
- Pane direito: arquivo `database-queries.md` com blocos DB
- Tabs visiveis em cada pane
- Sidebar com file tree visivel

**Enquadramento:** Tela inteira do app

---

### 7. vim-mode (Screenshot)

**O que mostrar:**
- Status bar na parte inferior do app
- Badge "NORMAL" ou "INSERT" visivel
- Cursor block (nao pipe) no editor

**Enquadramento:** Crop na status bar + um pedaco do editor mostrando o cursor

---

### 8. environments (Screenshot)

**O que mostrar:**
- TopBar com dropdown de environment aberto (Local, Staging, Production)
- OU: EnvironmentManager drawer aberto com lista de variables
- Variables com nomes tipo `base_url`, `api_key` (com lock icon para secret)
- Uma variable mostrando valor, outra com `*****` (secret)

**Enquadramento:** Foco na area de environments

---

### 9. search (Screenshot)

**O que mostrar:**
- Search panel (Cmd+Shift+F) com uma busca tipo "authentication"
- 3-4 resultados com snippet highlighting
- Resultados de arquivos diferentes

**Enquadramento:** Crop no search panel + resultado

---

### 10. mermaid (Screenshot)

**O que mostrar:**
- Bloco de codigo mermaid no editor
- Diagrama renderizado inline (flowchart ou sequence diagram)
- Algo relevante ao projeto (fluxo de API request, arquitetura, etc.)

**Enquadramento:** Crop mostrando o code + render

---

### 11. slash-commands (GIF)

**O que mostrar:**
1. Cursor num paragrafo vazio
2. Digitar `/`
3. Menu dropdown aparece com opcoes (HTTP, SQL, E2E, Table, etc.)
4. Selecionar uma opcao
5. Bloco aparece

**Duracao:** 3-4 segundos

---

### 12. ai-chat (GIF)

**O que mostrar:**
1. Abrir o chat panel (se nao estiver aberto)
2. Digitar: "Add an HTTP block to test the /api/users endpoint"
3. Claude responde com streaming
4. Tool use aparece (update_note)
5. Diff viewer abre mostrando as mudancas
6. Clicar "Allow" no diff header
7. Mudancas aplicadas no editor

**Duracao:** 10-12 segundos
**Dicas:** Pode acelerar o typing e o streaming em pos-producao

---

### 13. md-file (Screenshot)

**O que mostrar:**
- Composicao side-by-side:
  - Esquerda: arquivo aberto no httui (com blocos renderizados)
  - Direita: mesmo arquivo aberto no VS Code ou terminal (cat) mostrando o markdown raw
- Mostrar que o formato e markdown padrao com fenced code blocks

**Enquadramento:** Crop horizontal, ambos editors visiveis
**Nota:** Pode ser montagem em Figma se nao der pra capturar side-by-side

---

### 14. getting-started (GIF)

**O que mostrar:**
1. App abrindo (splash ou primeira tela)
2. Selecionar/criar um vault (pasta)
3. Criar um novo arquivo
4. Digitar titulo e `/http`
5. Preencher uma URL simples (GET `https://jsonplaceholder.typicode.com/users/1`)
6. Clicar Run
7. Response aparecendo com dados do user

**Duracao:** 12-15 segundos
**Dicas:** Cortar partes lentas em pos-producao, manter ritmo dinamico

---

### 15. og-image (Imagem estatica)

**O que mostrar:**
- Fundo dark (#0d1117)
- Logo do httui (se existir) ou tipografia bold
- Headline: "Your API docs, alive"
- Screenshot miniatura do app (hero screenshot reduzido)
- Tagline: "Open source desktop editor"

**Specs:** 1200x630px, PNG
**Nota:** Criar em Figma. Esse e o preview que aparece no Twitter/LinkedIn/Slack quando alguem compartilha httui.com.

---

## Estrutura de pastas

```
landing-page/
  assets/
    gifs/
      hero-demo.gif        (ou hero-demo.mp4 + hero-demo.webm)
      e2e-block.gif
      block-references.gif
      slash-commands.gif
      ai-chat.gif
      getting-started.gif
    screenshots/
      http-block.png
      db-block.png
      multi-pane.png
      vim-mode.png
      environments.png
      search.png
      mermaid.png
      md-file.png
    og-image.png
```

---

## Checklist de captura

- [ ] Configurar app em dark mode com dados realistas
- [ ] Capturar screenshots (8 prints)
- [ ] Gravar GIFs (6 animacoes)
- [ ] Criar OG image em Figma
- [ ] Otimizar todos os assets (gifsicle, pngquant)
- [ ] Verificar tamanhos finais (GIFs < 2MB, PNGs < 500KB)
- [ ] Testar OG image no Twitter Card Validator
