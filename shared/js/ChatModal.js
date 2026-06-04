'use strict';

// =============================================================
// ChatModal.js — Camada: interfaces
//
// Controlador do chat ao vivo (tela-chat).
// Gerencia o estado da conversa aberta, histórico de mensagens,
// envio via P2P (quando seguro) com fallback BFF, recebimento
// via Realtime Supabase e filtro de moderação client-side.
//
// Preserva todos os IDs DOM existentes em #tela-chat.
//
// Dependências: ChatApiClient.js, MessageModerationService.js,
//               P2PMessageConnectionService.js, SupabaseService.js,
//               LoggerService.js, InputValidator.js
// =============================================================

class ChatModal {

  // ── Estado ────────────────────────────────────────────────

  // Conversa aberta: { convId, peerId, nome, sub, avatar }
  static #conversa    = null;
  static #uid         = null;   // UUID do usuário logado
  static #modoP2P     = false;  // true quando canal DataChannel está 'secure'
  static #rtChannel   = null;   // subscription Supabase Realtime para BFF msgs
  static #paginaAnterior = null; // tela que abriu o chat (para voltar)

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

    // ── Carrega histórico do BFF (paralelo com P2P setup) ────
    ChatModal.#carregarHistorico(convId).catch(e => {
      LoggerService.warn('[ChatModal] histórico falhou:', e?.message);
    });

    // ── Assina canal Realtime BFF para mensagens novas ───────
    ChatModal.#subscribeRealtime();

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

    ChatModal.#unsubscribeRealtime();

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
   * 2. P2P se seguro, BFF como fallback
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

    const hora           = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

    // ── Caminho P2P (seguro) ─────────────────────────────────
    if (ChatModal.#modoP2P && typeof P2PMessageConnectionService !== 'undefined') {
      try {
        await P2PMessageConnectionService.sendMessage(peerId, texto);
        ChatModal.#atualizarStatusBolha(bolha, 'enviado');
        // Persiste no BFF em background (best-effort — não bloqueia UI)
        // TODO: quando IMessageCipher for implementado, criptografar body antes de persistir
        ChatApiClient.enviarMensagem(convId, { body: texto, clientMessageId }).catch(() => {});
        return;
      } catch (e) {
        LoggerService.warn('[ChatModal] P2P send falhou, usando BFF:', e?.message);
        ChatModal.#modoP2P = false;
      }
    }

    // ── Caminho BFF (fallback / modo padrão) ─────────────────
    const { error } = await ChatApiClient.enviarMensagem(convId, { body: texto, clientMessageId });
    if (error) {
      LoggerService.error('[ChatModal] BFF send falhou:', error?.message);
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

  /** Carrega histórico do BFF e renderiza bolhas (mais antigas primeiro). */
  static async #carregarHistorico(convId) {
    const area = document.getElementById('chat-mensagens');
    if (!area || !ChatModal.#uid) return;

    const { data, error } = await ChatApiClient.listarMensagens(convId, { limit: 30 });
    if (error) {
      LoggerService.warn('[ChatModal] histórico BFF:', error?.message);
      return;
    }

    const items = data?.items ?? [];
    // BFF retorna em ordem DESC (mais recente primeiro); reverter para exibir cronológico
    const ordemCronologica = [...items].reverse();

    // Insere antes das bolhas otimistas já na tela
    const fragment = document.createDocumentFragment();
    for (const msg of ordemCronologica) {
      if (msg.deletedAt) continue;
      const de   = msg.senderId === ChatModal.#uid ? 'eu' : 'outro';
      const hora = ChatModal.#formatarHora(msg.createdAt);
      fragment.appendChild(ChatModal.#renderBolha({
        de,
        texto: msg.body,
        hora,
        status: 'enviado',
        senderId: msg.senderId,
        sender: msg.sender,
        createdAt: msg.createdAt,
      }));
    }
    // Insere no início da área para não sobrepor bolhas otimistas
    area.insertBefore(fragment, area.firstChild);
    area.scrollTop = area.scrollHeight;
  }

  /** Assina canal Realtime BFF `chat.{uid}` para mensagens recebidas. */
  static #subscribeRealtime() {
    ChatModal.#unsubscribeRealtime();
    if (!ChatModal.#uid) return;

    ChatModal.#rtChannel = SupabaseService.client
      .channel(`chat.${ChatModal.#uid}`, { config: { private: true } })
      .on('broadcast', { event: 'events.v1.chat.message_created' }, payload => {
        ChatModal.#onRealtimeMensagem(payload?.payload ?? payload);
      })
      .subscribe();
  }

  static #unsubscribeRealtime() {
    if (ChatModal.#rtChannel) {
      try { SupabaseService.client.removeChannel(ChatModal.#rtChannel); } catch { /* ignora */ }
      ChatModal.#rtChannel = null;
    }
  }

  static #onRealtimeMensagem(payload) {
    const msg   = payload?.message;
    if (!msg || !ChatModal.#conversa) return;

    // Ignora mensagens de outras conversas
    if (msg.conversationId !== ChatModal.#conversa.convId) {
      ChatModal.#despacharNovaMensagem(msg.conversationId, msg.body, msg.sender, msg.createdAt);
      return;
    }

    // Ignora mensagens enviadas por mim (evita duplicata com bolha otimista)
    if (msg.senderId === ChatModal.#uid) return;

    const area = document.getElementById('chat-mensagens');
    if (!area) return;
    const hora = ChatModal.#formatarHora(msg.createdAt);
    area.appendChild(ChatModal.#renderBolha({
      de: 'outro',
      texto: msg.body,
      hora,
      senderId: msg.senderId,
      sender: msg.sender,
      createdAt: msg.createdAt,
    }));
    area.scrollTop = area.scrollHeight;
    ChatModal.#despacharNovaMensagem(msg.conversationId, msg.body, msg.sender, msg.createdAt);
  }

  /**
   * Cria elemento de bolha de mensagem.
   * Usa textContent em todos os campos para prevenir XSS.
   */
  static #renderBolha({ de, texto, hora, status = 'enviado', sender = null, senderId = null, createdAt = null }) {
    const remetente = ChatModal.#remetenteFallback({ de, sender, senderId });
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble-wrap chat-bubble-wrap--${de} chat-message-row chat-message-row--${de}`;
    wrap.dataset.senderId = remetente.id ?? '';

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
}
