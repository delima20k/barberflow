'use strict';

// =============================================================
// ChatModal.js — Camada: interfaces
//
// Controlador do chat ao vivo (tela-chat).
// Gerencia o estado da conversa aberta, histórico de mensagens,
// envio via P2P (quando seguro) com fallback BFF, recebimento
// via Realtime Supabase e filtro de moderação client-side.
//
// E2E storage: mensagens novas são cifradas com MessageStorageCipher
// antes de persistir no BFF. O banco nunca vê texto puro para
// mensagens novas. Histórico com body legado é exibido normalmente.
//
// Preserva todos os IDs DOM existentes em #tela-chat.
//
// Dependências: ChatApiClient.js, MessageModerationService.js,
//               P2PMessageConnectionService.js, SupabaseService.js,
//               LoggerService.js, InputValidator.js,
//               MessageStorageCipher.js, ConversationKeyService.js
// =============================================================

class ChatModal {

  // ── Estado ────────────────────────────────────────────────

  // Conversa aberta: { convId, peerId, nome, sub, avatar }
  static #conversa    = null;
  static #uid         = null;   // UUID do usuário logado
  static #modoP2P     = false;  // true quando canal DataChannel está 'secure'
  static #listenerRegistrado = false; // guarda do listener chatflow:mensagem-nova
  static #paginaAnterior = null; // tela que abriu o chat (para voltar)
  static #mensagensRenderizadas = new Set(); // message.id canonico ja renderizado

  // Deduplicação P2P × Realtime: mensagem entregue pelo DataChannel é
  // registrada aqui para suprimir a cópia que chega via realtime (~100-500ms depois).
  // Map<fingerprint, expiryMs> — janela de 8s é mais que suficiente.
  static #recentP2PReceived = new Map();
  static #P2P_DEDUP_MS = 8_000;

  // Labels de status de conexão P2P
  static #STATUS_LABEL = {
    connecting:   '⏳ Conectando...',
    'key-exchange': '🔑 Trocando chaves...',
    secure:       '🔒 Seguro',
    disconnected: '⚠️ Desconectado',
    failed:       '❌ Destinatário offline',
    none:         '',
  };

  // ══════════════════════════════════════════════════════════
  // PÚBLICO
  // ══════════════════════════════════════════════════════════

  /**
   * Abre o chat com a conversa indicada.
   * @param {{ convId: string, peerId: string, nome: string, sub: string, avatar: string|null }} opts
   * @param {string} [telaOrigem] — id da tela que abriu o modal (para voltar corretamente)
   */
  static async abrir({ convId, peerId, nome, sub, avatar }, telaOrigem = 'tela-mensagens') {
    ChatModal.#conversa     = { convId, peerId, nome, sub, avatar };
    ChatModal.#paginaAnterior = telaOrigem;
    ChatModal.#modoP2P      = false;
    ChatModal.#mensagensRenderizadas.clear();
    ChatModal.#recentP2PReceived.clear();
    ChatModal.#despacharConversaAberta(convId);

    // ── Preenche header do modal ─────────────────────────────
    const avEl   = document.getElementById('chat-modal-avatar-inner');
    const nomeEl = document.getElementById('chat-modal-nome');
    const subEl  = document.getElementById('chat-modal-sub');

    if (nomeEl) nomeEl.textContent = nome;
    if (subEl)  subEl.textContent  = sub ?? '';
    if (avEl) {
      avEl.textContent = '';
      if (avatar) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        img.alt     = nome;
        img.onerror = () => { img.remove(); avEl.textContent = ChatModal.#iniciais(nome); };
        img.src     = avatar;
        avEl.appendChild(img);
      } else {
        avEl.textContent = ChatModal.#iniciais(nome);
      }
    }

    // ── Limpa mensagens e mostra loader ──────────────────────
    const area = document.getElementById('chat-mensagens');
    if (area) area.innerHTML = '';

    // Remove aviso de moderação antigo
    const modAviso = document.getElementById('chat-mod-aviso');
    if (modAviso) { modAviso.textContent = ''; modAviso.style.display = 'none'; }

    ChatModal.#mostrarStatus('connecting');

    // ── Anima para tela-chat ─────────────────────────────────
    const telaOrigem_ = document.getElementById(telaOrigem);
    const telaChat    = document.getElementById('tela-chat');
    ChatModal.#animar(telaOrigem_, telaChat, 'saindo-direita', 'entrando-lento');
    document.getElementById('footer-nav')?.style.setProperty('display', 'none');
    document.getElementById('footer-nav-offline')?.style.setProperty('display', 'none');

    // ── Obtém UID do usuário logado ──────────────────────────
    ChatModal.#uid = await ChatModal.#obterUid();
    if (!ChatModal.#uid) {
      ChatModal.#mostrarStatus('failed');
      return;
    }

    // ── Inicializa chaves E2E em background ──────────────────
    if (typeof ConversationKeyService !== 'undefined') {
      ConversationKeyService.inicializar().catch(e => {
        if (typeof LoggerService !== 'undefined') {
          LoggerService.warn('[ChatModal] ConversationKeyService init falhou:', e?.message);
        }
      });
    }

    // ── Carrega histórico do BFF (paralelo com P2P setup) ────
    ChatModal.#carregarHistorico(convId).catch(e => {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChatModal] histórico falhou:', e?.message);
      }
    });

    // ── Garante assinatura realtime (canal único) + listener de render ───────
    ChatModal.#garantirListener();
    if (typeof ChatRealtimeService !== 'undefined') ChatRealtimeService.iniciar(ChatModal.#uid);

    // ── Inicia/retoma P2P ────────────────────────────────────
    if (typeof P2PMessageConnectionService !== 'undefined') {
      P2PMessageConnectionService.onStatusChange(peerId, status => {
        ChatModal.#modoP2P = status === 'secure';
        ChatModal.#mostrarStatus(status);
      });
      P2PMessageConnectionService.onMessage(peerId, ({ texto, hora }) => {
        const areaMsg = document.getElementById('chat-mensagens');
        if (areaMsg) {
          areaMsg.appendChild(ChatModal.#renderBolha({
            de: 'outro',
            texto,
            hora,
            senderId: peerId,
            sender: ChatModal.#remetenteConversa(),
          }));
          areaMsg.scrollTop = areaMsg.scrollHeight;
        }
        // Registra fingerprint para suprimir a cópia que chega via realtime
        ChatModal.#recentP2PReceived.set(
          ChatModal.#fingerprint(texto),
          Date.now() + ChatModal.#P2P_DEDUP_MS,
        );
        ChatModal.#despacharNovaMensagem(convId, texto, ChatModal.#remetenteConversa());
      });
      const statusAtual = P2PMessageConnectionService.getStatus(peerId);
      if (statusAtual !== 'secure' && statusAtual !== 'connecting' && statusAtual !== 'key-exchange') {
        P2PMessageConnectionService.initiateConnection(ChatModal.#uid, peerId);
      } else if (statusAtual === 'secure') {
        ChatModal.#modoP2P = true;
        ChatModal.#mostrarStatus('secure');
      }
    } else {
      ChatModal.#mostrarStatus('none');
    }

    setTimeout(() => {
      if (area) area.scrollTop = area.scrollHeight;
    }, 380);
  }

  /** Fecha o chat e limpa conexões. */
  static fechar() {
    const conv = ChatModal.#conversa;
    ChatModal.#conversa = null;
    ChatModal.#modoP2P  = false;
    ChatModal.#despacharConversaFechada(conv?.convId);

    if (conv?.peerId && typeof P2PMessageConnectionService !== 'undefined') {
      P2PMessageConnectionService.close(conv.peerId);
    }

    // A assinatura realtime (ChatRealtimeService) permanece ativa em nível de
    // página para a lista continuar atualizando ao vivo sem conversa aberta.

    const telaChat     = document.getElementById('tela-chat');
    const telaOrigem   = document.getElementById(ChatModal.#paginaAnterior ?? 'tela-mensagens');
    ChatModal.#animar(telaChat, null, 'saindo', 'ativa');
    if (telaOrigem) {
      telaOrigem.style.display = 'flex';
      telaOrigem.classList.add('ativa');
    }
    const router = window.App ?? window.Pro ?? null;
    if (router?._atualizarUI) {
      router._atualizarUI(router._telaAtual ?? (ChatModal.#paginaAnterior ?? 'mensagens').replace('tela-', ''));
    }
  }

  /**
   * Envia a mensagem digitada no input.
   * 1. Valida moderação client-side
   * 2. Cifra para storage com MessageStorageCipher (E2E)
   * 3. P2P DataChannel (texto puro — P2P tem criptografia própria) se seguro
   * 4. BFF recebe apenas encrypted_payload; corpo nunca vai em claro para o banco
   */
  static async enviar() {
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', null)) return;

    const input = document.getElementById('chat-input');
    if (!input || !ChatModal.#conversa) return;

    const texto = input.value.trim();
    if (!texto) return;

    // ── Moderação client-side ────────────────────────────────
    const { bloqueado, motivo } = MessageModerationService.verificar(texto);
    if (bloqueado) {
      ChatModal.#exibirAvisoModeracao(motivo);
      return;
    }

    input.value = '';
    input.focus();

    const hora            = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const clientMessageId = crypto.randomUUID();
    const { convId, peerId } = ChatModal.#conversa;

    // ── Renderiza bolha otimista ─────────────────────────────
    const area = document.getElementById('chat-mensagens');
    const bolha = ChatModal.#renderBolha({
      de: 'eu',
      texto,
      hora,
      status: 'enviando',
      senderId: ChatModal.#uid,
      sender: ChatModal.#remetenteLocal(),
      createdAt: new Date().toISOString(),
    });
    if (area) { area.appendChild(bolha); area.scrollTop = area.scrollHeight; }

    // ── Cifra para storage (E2E) — OBRIGATÓRIO ──────────────
    // Sem chave disponível: bloqueia o envio. NÃO usa fallback com body puro.
    if (typeof MessageStorageCipher === 'undefined' || typeof ConversationKeyService === 'undefined') {
      ChatModal.#exibirErroCriptografia();
      ChatModal.#atualizarStatusBolha(bolha, 'falhou');
      return;
    }

    let encryptedPayload;
    try {
      encryptedPayload = await MessageStorageCipher.encryptForStorage(convId, peerId, texto);
    } catch (e) {
      // Peer sem chave registrada, IndexedDB vazio ou outro erro de criptografia.
      // Bloquear envio — nunca enviar body puro como fallback.
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChatModal] Envio bloqueado: criptografia indisponível.');
      }
      ChatModal.#exibirErroCriptografia();
      ChatModal.#atualizarStatusBolha(bolha, 'falhou');
      return;
    }

    const payloadBff = { encrypted_payload: encryptedPayload, clientMessageId };

    // ── Caminho P2P (seguro) ─────────────────────────────────
    // DataChannel transporta texto puro (P2P tem cifragem na camada WebRTC).
    // BFF persiste apenas encrypted_payload (sem duplicar mensagem no banco).
    if (ChatModal.#modoP2P && typeof P2PMessageConnectionService !== 'undefined') {
      try {
        await P2PMessageConnectionService.sendMessage(peerId, texto);
        ChatModal.#atualizarStatusBolha(bolha, 'enviado');
        // Persiste no BFF em background (best-effort — não bloqueia UI)
        ChatApiClient.enviarMensagem(convId, payloadBff).catch(() => {});
        return;
      } catch (e) {
        if (typeof LoggerService !== 'undefined') {
          LoggerService.warn('[ChatModal] P2P send falhou, usando BFF:', e?.message);
        }
        ChatModal.#modoP2P = false;
      }
    }

    // ── Caminho BFF (fallback / modo padrão) ─────────────────
    const { error } = await ChatApiClient.enviarMensagem(convId, payloadBff);
    if (error) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.error('[ChatModal] BFF send falhou:', error?.message);
      }
      ChatModal.#atualizarStatusBolha(bolha, 'falhou');
    } else {
      ChatModal.#atualizarStatusBolha(bolha, 'enviado');
    }
  }

  // ── Helpers acessíveis por UniversalChatPage ──────────────

  /** Gera iniciais a partir do nome completo (máx 2 letras). */
  static iniciais(nome) {
    if (!nome) return '?';
    const partes = String(nome).trim().split(/\s+/).filter(Boolean);
    if (partes.length === 1) return partes[0][0].toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS
  // ══════════════════════════════════════════════════════════

  /**
   * Carrega histórico do BFF e renderiza bolhas (mais antigas primeiro).
   * Mensagens com encrypted_payload são decifradas no browser antes de renderizar.
   * Mensagens com body legado são exibidas diretamente (compatibilidade retroativa).
   */
  static async #carregarHistorico(convId) {
    const area = document.getElementById('chat-mensagens');
    if (!area || !ChatModal.#uid) return;

    const { data, error } = await ChatApiClient.listarMensagens(convId, { limit: 30 });
    if (error) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChatModal] histórico BFF:', error?.message);
      }
      return;
    }

    const items = data?.items ?? [];
    // BFF retorna em ordem DESC (mais recente primeiro); reverter para exibir cronológico
    const ordemCronologica = [...items].reverse();

    // Filtra mensagens já renderizadas (evita duplicação com bolhas otimistas)
    const candidatos = ordemCronologica.filter(msg => {
      if (msg.deletedAt) return false;
      return !ChatModal.#jaRenderizada(msg.id);
    });

    // Decifra em paralelo (AES-GCM após primeira derivação é rápida — usa cache)
    const peerId = ChatModal.#conversa?.peerId ?? null;
    const textos = await Promise.all(
      candidatos.map(async msg => {
        if (!msg.encryptedPayload || !peerId) return msg.body ?? '';
        try {
          const plain = await MessageStorageCipher.decryptFromStorage(convId, peerId, msg.encryptedPayload);
          return plain ?? '🔒 Mensagem cifrada';
        } catch {
          return '🔒 Mensagem cifrada';
        }
      })
    );

    // Insere antes das bolhas otimistas já na tela
    const fragment = document.createDocumentFragment();
    candidatos.forEach((msg, i) => {
      const de   = msg.senderId === ChatModal.#uid ? 'eu' : 'outro';
      const hora = ChatModal.#formatarHora(msg.createdAt);
      fragment.appendChild(ChatModal.#renderBolha({
        messageId: msg.id,
        de,
        texto:     textos[i],
        hora,
        status:    'enviado',
        senderId:  msg.senderId,
        sender:    msg.sender,
        createdAt: msg.createdAt,
      }));
    });

    area.insertBefore(fragment, area.firstChild);
    area.scrollTop = area.scrollHeight;
  }

  /**
   * Registra (uma única vez) o listener de `chatflow:mensagem-nova` emitido
   * pelo ChatRealtimeService. Renderiza a bolha quando a mensagem pertence à
   * conversa aberta. A assinatura do canal é responsabilidade do
   * ChatRealtimeService (canal único `chat.{uid}`), não deste modal.
   */
  static #garantirListener() {
    if (ChatModal.#listenerRegistrado) return;
    ChatModal.#listenerRegistrado = true;
    document.addEventListener('chatflow:mensagem-nova', e => {
      ChatModal.#onMensagemNovaEvento(e.detail);
    });
  }

  /** Processa evento de nova mensagem via realtime (decifra se necessário). */
  static async #onMensagemNovaEvento(detail) {
    // Só mensagens reais vindas do realtime carregam messageId.
    if (!detail?.messageId || !ChatModal.#conversa) return;
    // Pertence a outra conversa → a lista (UniversalChatPage) cuida do badge.
    if (detail.convId !== ChatModal.#conversa.convId) return;
    // Minha própria mensagem já foi renderizada como bolha otimista.
    if (detail.senderId === ChatModal.#uid) return;
    if (ChatModal.#jaRenderizada(detail.messageId)) return;

    const area = document.getElementById('chat-mensagens');
    if (!area) return;

    // Decifra encrypted_payload se presente; exibe body legado caso contrário
    let texto = detail.body ?? '';
    if (detail.encryptedPayload && ChatModal.#conversa?.peerId) {
      try {
        const plain = await MessageStorageCipher.decryptFromStorage(
          detail.convId,
          ChatModal.#conversa.peerId,
          detail.encryptedPayload,
        );
        texto = plain ?? '🔒 Mensagem cifrada';
      } catch {
        texto = '🔒 Mensagem cifrada';
      }
    }

    // Deduplicação P2P × Realtime:
    // Se esta mensagem já foi entregue pelo DataChannel, suprime a cópia do realtime.
    const fp = ChatModal.#fingerprint(texto);
    if (ChatModal.#recentP2PReceived.has(fp) && ChatModal.#recentP2PReceived.get(fp) > Date.now()) {
      ChatModal.#recentP2PReceived.delete(fp);
      // Registra o messageId canônico do BFF para deduplicação futura
      if (detail.messageId) ChatModal.#mensagensRenderizadas.add(detail.messageId);
      return;
    }

    area.appendChild(ChatModal.#renderBolha({
      messageId: detail.messageId,
      de:        'outro',
      texto,
      hora:      ChatModal.#formatarHora(detail.createdAt),
      senderId:  detail.senderId,
      sender:    detail.sender,
      createdAt: detail.createdAt,
    }));
    area.scrollTop = area.scrollHeight;
    // Conversa aberta = lida; sinaliza para limpar indicadores na lista.
    ChatModal.#despacharConversaLida(detail.convId);
  }

  /**
   * Cria elemento de bolha de mensagem.
   * Usa textContent em todos os campos para prevenir XSS.
   */
  static #renderBolha({ de, texto, hora, status = 'enviado', sender = null, senderId = null, createdAt = null, messageId = null }) {
    const remetente = ChatModal.#remetenteFallback({ de, sender, senderId });
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble-wrap chat-bubble-wrap--${de} chat-message-row chat-message-row--${de}`;
    wrap.dataset.senderId = remetente.id ?? '';
    if (messageId) wrap.dataset.messageId = messageId;

    const avatar = document.createElement('div');
    avatar.className = 'chat-message-avatar';
    avatar.setAttribute('aria-label', remetente.name);
    const avatarUrl = ChatModal.#avatarUrl(remetente);
    if (avatarUrl) {
      const img = document.createElement('img');
      img.alt = remetente.name;
      img.src = avatarUrl;
      img.onerror = () => {
        img.remove();
        avatar.textContent = ChatModal.#iniciais(remetente.name);
      };
      avatar.appendChild(img);
    } else {
      avatar.textContent = ChatModal.#iniciais(remetente.name);
    }

    const col = document.createElement('div');
    col.className = 'chat-message-content';

    const meta = document.createElement('div');
    meta.className = 'chat-message-meta';

    const nomeEl = document.createElement('span');
    nomeEl.className = 'chat-message-sender';
    nomeEl.textContent = remetente.name;

    const dataEl = document.createElement('span');
    dataEl.className = 'chat-message-date';
    dataEl.textContent = ChatModal.#formatarDataHora(createdAt, hora);

    meta.appendChild(nomeEl);
    meta.appendChild(dataEl);

    const balao = document.createElement('div');
    balao.className = `chat-balao chat-balao--${de === 'eu' ? 'eu' : 'outro'}`;
    if (status === 'enviando') balao.classList.add('chat-balao--enviando');

    const corpo = document.createElement('span');
    corpo.className = 'chat-balao-body';
    corpo.textContent = texto; // NUNCA innerHTML — prevenção XSS

    const horaEl = document.createElement('span');
    horaEl.className = 'chat-bubble-hora';
    horaEl.textContent = hora ?? '';

    balao.appendChild(corpo);
    balao.appendChild(horaEl);
    col.appendChild(meta);
    col.appendChild(balao);
    if (de === 'eu') {
      wrap.appendChild(col);
      wrap.appendChild(avatar);
    } else {
      wrap.appendChild(avatar);
      wrap.appendChild(col);
    }
    return wrap;
  }

  static #jaRenderizada(messageId) {
    if (!messageId) return false;
    if (ChatModal.#mensagensRenderizadas.has(messageId)) return true;
    ChatModal.#mensagensRenderizadas.add(messageId);
    return false;
  }

  static #atualizarStatusBolha(bolha, status) {
    if (!bolha) return;
    const balao = bolha.querySelector('.chat-balao');
    if (!balao) return;
    balao.classList.remove('chat-balao--enviando', 'chat-balao--falhou');
    if (status === 'falhou') {
      balao.classList.add('chat-balao--falhou');
      balao.title = 'Falha ao enviar — toque para reenviar';
    }
  }

  /** Mostra badge de status de conexão P2P/BFF acima do campo de texto. */
  static #mostrarStatus(status) {
    const el = document.getElementById('chat-modal-sub');
    if (!el) return;
    const label = ChatModal.#STATUS_LABEL[status] ?? '';
    if (label) el.textContent = label;
  }

  /** Exibe erro de criptografia ao usuário. Desaparece em 5s. */
  static #exibirErroCriptografia() {
    let el = document.getElementById('chat-mod-aviso');
    if (!el) {
      el = document.createElement('span');
      el.id = 'chat-mod-aviso';
      el.setAttribute('role', 'alert');
      document.querySelector('.chat-modal-footer')?.prepend(el);
    }
    el.textContent = 'Não foi possível enviar esta mensagem com segurança. Reabra a conversa ou tente novamente.';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  /** Exibe aviso de moderação sem bloquear a UI. Desaparece em 3s. */
  static #exibirAvisoModeracao(_motivo) {
    let el = document.getElementById('chat-mod-aviso');
    if (!el) {
      el = document.createElement('span');
      el.id = 'chat-mod-aviso';
      el.setAttribute('role', 'alert');
      document.querySelector('.chat-modal-footer')?.prepend(el);
    }
    el.textContent = 'Mensagem não enviada. Use uma linguagem respeitosa.';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  /** Despacha CustomEvent para atualizar badge na lista de conversas. */
  static #despacharNovaMensagem(convId, body, sender = null, createdAt = null) {
    document.dispatchEvent(new CustomEvent('chatflow:mensagem-nova', {
      detail: { convId, preview: body, sender, createdAt }
    }));
  }

  static #despacharConversaAberta(convId) {
    document.dispatchEvent(new CustomEvent('chatflow:conversa-aberta', {
      detail: { convId }
    }));
  }

  static #despacharConversaFechada(convId) {
    document.dispatchEvent(new CustomEvent('chatflow:conversa-fechada', {
      detail: { convId }
    }));
  }

  static #despacharConversaLida(convId) {
    document.dispatchEvent(new CustomEvent('chatflow:conversa-lida', {
      detail: { convId }
    }));
  }

  static #remetenteLocal() {
    const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    return {
      id: perfil?.id ?? ChatModal.#uid ?? null,
      name: perfil?.full_name ?? perfil?.name ?? 'Voce',
      avatarPath: perfil?.avatar_path ?? null,
      role: perfil?.role ?? null,
    };
  }

  static #remetenteConversa() {
    return {
      id: ChatModal.#conversa?.peerId ?? null,
      name: ChatModal.#conversa?.nome ?? 'Contato',
      avatarUrl: ChatModal.#conversa?.avatar ?? null,
      role: null,
    };
  }

  static #remetenteFallback({ de, sender, senderId }) {
    const base = de === 'eu' ? ChatModal.#remetenteLocal() : ChatModal.#remetenteConversa();
    return {
      id: sender?.id ?? senderId ?? base.id ?? null,
      name: sender?.name ?? sender?.full_name ?? base.name ?? 'Usuario',
      avatarPath: sender?.avatarPath ?? sender?.avatar_path ?? base.avatarPath ?? null,
      avatarUrl: sender?.avatarUrl ?? sender?.avatar ?? base.avatarUrl ?? null,
      role: sender?.role ?? base.role ?? null,
    };
  }

  static #avatarUrl(remetente) {
    if (remetente?.avatarUrl) return remetente.avatarUrl;
    if (!remetente?.avatarPath) return null;
    if (typeof ApiService !== 'undefined' && typeof ApiService.getAvatarUrl === 'function') {
      return ApiService.getAvatarUrl(remetente.avatarPath);
    }
    return remetente.avatarPath;
  }

  static async #obterUid() {
    try {
      if (typeof AuthService !== 'undefined') {
        const perfil = AuthService.getPerfil?.();
        if (perfil?.id) return perfil.id;
      }
      const { data: { session } } = await SupabaseService.getSession();
      return session?.user?.id ?? null;
    } catch { return null; }
  }

  static #animar(saindo, entrando, classeSaida, classeEntrada) {
    if (typeof AnimationService !== 'undefined') {
      AnimationService.animar(saindo, entrando, classeSaida, classeEntrada);
    } else {
      saindo?.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
      if (saindo) saindo.style.display = 'none';
      if (entrando) { entrando.style.display = 'flex'; entrando.classList.add('ativa'); }
    }
  }

  static #iniciais(nome) { return ChatModal.iniciais(nome); }

  static #formatarHora(isoString) {
    try {
      return new Date(isoString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  static #formatarDataHora(isoString, horaFallback = '') {
    try {
      if (!isoString) return horaFallback ?? '';
      const data = new Date(isoString);
      if (Number.isNaN(data.getTime())) return horaFallback ?? '';
      return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
        + ' '
        + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { return horaFallback ?? ''; }
  }

  // Fingerprint leve para deduplicação P2P × Realtime (não criptográfico).
  // Usa os primeiros 128 chars do texto — suficiente para distinguir mensagens
  // distintas dentro da janela de 8s.
  static #fingerprint(text) {
    return String(text ?? '').slice(0, 128);
  }
}
