# Epic 12 — Chat MVP (Texto + Imagens)

Interface de chat conversacional com streaming, input multimodal, markdown rendering e sessoes persistentes.

**Depende de:** Epic 11 (Chat Sidecar & Protocolo)
**Desbloqueia:** Epic 13 (Chat Agente)
**Status:** backlog

---

## Story 01: Layout do chat

Estrutura visual do painel de chat no app.

### Tasks

- [ ] Criar componente `Chat` com layout: sidebar de sessoes (esquerda) + area de conversa (direita)
- [ ] Sidebar: lista de sessoes com titulo, data, botao "nova conversa"
- [ ] Area de conversa: header (titulo da sessao) + lista de mensagens + input area (bottom)
- [ ] Integrar chat como panel no sistema de panes existente (ou como drawer/sidebar dedicado)
- [ ] Definir rota de acesso ao chat (icone na sidebar principal ou atalho de teclado)

## Story 02: Input de texto

Campo de entrada para mensagens do usuario.

### Tasks

- [ ] Criar componente `ChatInput` com textarea auto-expansivel (min 1 linha, max 10 linhas)
- [ ] Enviar mensagem com `Cmd+Enter` (nao Enter sozinho — Enter insere newline)
- [ ] Desabilitar envio durante streaming (mostrar estado "gerando...")
- [ ] Botao de enviar (icone seta) ao lado do textarea
- [ ] Limpar input apos envio bem-sucedido
- [ ] Focar textarea automaticamente ao abrir sessao

## Story 03: Input multimodal (imagens)

Suporte a anexar imagens via file picker, drag-drop e clipboard paste.

### Tasks

- [ ] Implementar file picker com `@tauri-apps/plugin-dialog` (filtro: png, jpg, jpeg, gif, webp)
- [ ] Implementar drag-drop via `getCurrentWebview().onDragDropEvent()`
- [ ] Implementar clipboard paste no textarea (`onPaste` handler para items image/*)
- [ ] Implementar `save_attachment_tmp` no Rust: salva bytes em `app_data_dir/tmp/<uuid>.<ext>`, retorna path
- [ ] Criar area de preview de anexos abaixo do textarea (thumbnails com botao de remover)
- [ ] Normalizar imagens antes de enviar: redimensionar se lado maior > 2048px, reencodar JPEG Q85
- [ ] Limitar: max 20 imagens por mensagem, max 5MB por imagem
- [ ] Converter attachments para content blocks base64 no Rust antes de enviar ao sidecar

## Story 04: Streaming de respostas

Exibicao em tempo real dos tokens recebidos do Claude.

### Tasks

- [ ] Criar hook `useChat(sessionId)` que gerencia estado da conversa
- [ ] Escutar eventos Tauri: `chat:delta`, `chat:done`, `chat:error`
- [ ] Acumular `text_delta` em estado local durante streaming
- [ ] No `chat:done`, recarregar mensagens do SQLite (fonte de verdade)
- [ ] Implementar indicador visual de "gerando..." (animacao de typing)
- [ ] Tratar `chat:error` com mensagens por categoria (auth, rate_limit, network, invalid_input, internal)

## Story 05: Renderizacao de markdown

Renderizar respostas do Claude como markdown rico.

### Tasks

- [ ] Instalar e configurar `react-markdown` com `remark-gfm` e `rehype-sanitize`
- [ ] Implementar code blocks com deteccao de linguagem (fence info), scroll horizontal e botao copiar
- [ ] Memoizar code blocks para evitar re-highlight a cada delta
- [ ] Durante streaming: re-parse com debounce de 50ms para evitar travamento
- [ ] Sanitizar HTML com schema customizado (bloquear script, iframe, object, embed)
- [ ] Links externos: abrir via `tauri-plugin-shell` `open()` com `rel="noopener noreferrer"`
- [ ] Suportar tabelas GFM com scroll horizontal
- [ ] Suportar listas de tarefas (`- [ ]` / `- [x]`) como checkboxes disabled

## Story 06: Scroll behavior

Scroll automatico durante streaming sem interromper leitura do usuario.

### Tasks

- [ ] Implementar hook `useStickyBottomScroll` que detecta se usuario esta no bottom (threshold 50px)
- [ ] Auto-scroll em cada `chat:delta` somente se usuario esta no bottom
- [ ] Se usuario scrollou para cima, nao forcar scroll para baixo
- [ ] Mostrar botao "scroll to bottom" flutuante quando nao esta no bottom e ha conteudo novo

## Story 07: Gerenciamento de sessoes

CRUD de sessoes persistentes.

### Tasks

- [ ] Listar sessoes na sidebar com titulo e data relativa (ex: "2h atras")
- [ ] Criar nova sessao ao clicar botao "+" (estado draft ate primeira mensagem)
- [ ] Arquivar sessao (swipe ou botao context menu)
- [ ] Titulo automatico: apos primeiro turno, disparar chat extra pedindo resumo em 5 palavras
- [ ] Selecionar sessao na sidebar carrega historico do SQLite
- [ ] Retomar sessao apos restart: usar `claude_session_id` persistido para `--resume`
- [ ] Tratar falha de resume: oferecer "continuar como conversa nova" com resumo do historico

## Story 08: Bolha de mensagem e UI de conversa

Componentes visuais para exibir mensagens.

### Tasks

- [ ] Criar componente `MessageBubble` com variantes por role (user: alinhado direita, assistant: alinhado esquerda)
- [ ] Mensagens do user: texto simples + thumbnails de imagens anexadas
- [ ] Mensagens do assistant: markdown renderizado com streaming
- [ ] Mostrar timestamp e token count (discreto, hover ou footer)
- [ ] Estilizar com tokens semanticos do Chakra UI (bg, fg, border) para dark/light mode
- [ ] Tratar mensagem parcial (interrompida): mostrar aviso e botao "Regerar"
