# Epic 12 — Chat MVP (Texto + Imagens)

Interface de chat conversacional com streaming, input multimodal, markdown rendering e sessoes persistentes.

**Depende de:** Epic 11 (Chat Sidecar & Protocolo)
**Desbloqueia:** Epic 13 (Chat Agente)
**Status:** em progresso

---

## Story 01: Layout do chat ✅

Estrutura visual do painel de chat no app.

### Tasks

- [x] Criar componente `ChatPanel` com layout: session list (topo) + area de conversa + input (bottom)
- [x] Integrar chat como painel lateral direito no AppShell
- [x] Botao toggle no TopBar (icone LuMessageSquare, indicador ativo em azul)
- [x] Atalho de teclado `Cmd+L` para toggle chat
- [x] Resize handle entre editor e chat (largura fixa 380px no MVP)

## Story 02: Input de texto ✅

Campo de entrada para mensagens do usuario.

### Tasks

- [x] Criar componente `ChatInput` com textarea auto-expansivel (min 40px, max 200px)
- [x] Enviar mensagem com `Cmd+Enter` (Enter insere newline)
- [x] Desabilitar envio durante streaming (mostrar botao "stop" em vermelho)
- [x] Botao de enviar (icone LuSend) ao lado do textarea
- [x] Limpar input apos envio bem-sucedido
- [x] stopPropagation em onKeyDown/onMouseDown/onFocus para evitar captura pelo ProseMirror

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

## Story 04: Streaming de respostas ✅

Exibicao em tempo real dos tokens recebidos do Claude.

### Tasks

- [x] Criar hook `useChat(sessionId)` que gerencia estado da conversa
- [x] Escutar eventos Tauri: `chat:delta`, `chat:done`, `chat:error`
- [x] Acumular `text_delta` em estado local durante streaming (via contentRef + requestAnimationFrame)
- [x] No `chat:done`, recarregar mensagens do SQLite (fonte de verdade)
- [x] Implementar indicador visual de "gerando..." (animacao de dots pulsing)
- [x] Tratar `chat:error` com mensagens por categoria (auth, rate_limit, network, invalid_input, internal)

## Story 05: Renderizacao de markdown ✅

Renderizar respostas do Claude como markdown rico.

### Tasks

- [x] Instalar e configurar `react-markdown` com `remark-gfm` e `rehype-sanitize`
- [x] Implementar code blocks com deteccao de linguagem (fence info), scroll horizontal e botao copiar
- [x] Memoizar ChatMarkdown com React.memo
- [x] Sanitizar HTML via rehype-sanitize (bloqueia script, iframe, object, embed)
- [x] Links externos: abrir via `tauri-plugin-shell` `open()` com `rel="noopener noreferrer"`
- [x] Suportar tabelas GFM com scroll horizontal
- [x] Suportar listas de tarefas (`- [ ]` / `- [x]`) como checkboxes disabled
- [x] Syntax highlighting via lowlight (highlight.js) em code blocks

## Story 06: Scroll behavior ✅

Scroll automatico durante streaming sem interromper leitura do usuario.

### Tasks

- [x] Implementar hook `useStickyScroll` que detecta se usuario esta no bottom (threshold 50px)
- [x] Auto-scroll em cada delta somente se usuario esta no bottom
- [x] Se usuario scrollou para cima, nao forcar scroll para baixo
- [x] Mostrar botao "scroll to bottom" flutuante (LuArrowDown) quando nao esta no bottom

## Story 07: Gerenciamento de sessoes ✅

CRUD de sessoes persistentes.

### Tasks

- [x] Listar sessoes na sidebar com titulo e data relativa (ex: "2h atras")
- [x] Criar nova sessao ao clicar botao "+" (estado draft ate primeira mensagem)
- [x] Arquivar sessao (botao trash no hover)
- [ ] Titulo automatico: apos primeiro turno, disparar chat extra pedindo resumo em 5 palavras
- [x] Selecionar sessao na sidebar carrega historico do SQLite
- [x] Retomar sessao apos restart: usar `claude_session_id` persistido para `--resume`
- [ ] Tratar falha de resume: oferecer "continuar como conversa nova" com resumo do historico

## Story 08: Bolha de mensagem e UI de conversa ✅

Componentes visuais para exibir mensagens.

### Tasks

- [x] Criar componente `ChatMessageBubble` com variantes por role (user: alinhado direita, assistant: alinhado esquerda)
- [x] Mensagens do user: texto simples com bg azul sutil
- [x] Mensagens do assistant: markdown renderizado com streaming via ChatMarkdown
- [x] Mostrar timestamp e token count (discreto no footer)
- [x] Estilizar com tokens semanticos do Chakra UI (bg, fg, border) para dark/light mode
- [x] Tratar mensagem parcial (interrompida): mostrar aviso "Response was interrupted"
