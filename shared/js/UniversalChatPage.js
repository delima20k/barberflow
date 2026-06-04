'use strict';

// =============================================================
// UniversalChatPage.js — Camada: interfaces
//
// Controlador da tela-mensagens: carrega lista de conversas
// (BFF + favoritos), renderiza cards, favoritos e escuta
// ofertas P2P entrantes.
//
// Interface pública: init(listaId, role) — chamado por MessagesWidget.
// abrirModal(convId) — chamado por onclick no HTML.
//
// Dependências: ConversationListService.js, ConversationRepository.js,
//               ChatModal.js, ChatSearchWidget.js, AuthService.js,
//               P2PMessageConnectionService.js, MessageSignalingService.js,
//               ApiService.js, LoggerService.js
// =============================================================

class UniversalChatPage {

  static #lista     = null;
  static #role      = 'cliente';
  static #uid       = null;
  static #conversas = [];     // ConvItem[] — mantido em memória para busca rápida
  static #conversaAbertaId = null;

  // ══════════════════════════════════════════════════════════
  // PÚBLICO
  // ══════════════════════════════════════════════════════════

  /**
   * Inicializa a página de mensagens.
   * Deve ser chamado por MessagesWidget.init(listaId, role).
   * @param {string} listaId — id do container de cards
   * @param {string} role    — 'cliente' | 'profissional'
   */
  static init(listaId, role = 'cliente') {
    UniversalChatPage.#lista = document.getElementById(listaId);
    UniversalChatPage.#role  = role;

    if (!UniversalChatPage.#lista) return;
    UniversalChatPage.#conversas = [];
    UniversalChatPage.#atualizarIndicadorRodape();

    // Inicializa busca de usuários
    ChatSearchWidget.init(role);

    // Observa a tela ficar ativa para carregar/recarregar conversas
    const tela = document.getElementById('tela-mensagens');
    if (tela) {
      new MutationObserver(() => {
        if (tela.classList.contains('ativa')) UniversalChatPage.#carregar();
      }).observe(tela, { attributes: true, attributeFilter: ['class'] });
    }

    // Fecha modal com Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('tela-chat')?.classList.contains('ativa')) {
        ChatModal.fechar();
      }
    });

    // Atualiza badge ao receber mensagem nova
    document.addEventListener('chatflow:mensagem-nova', e => {
      UniversalChatPage.#atualizarBadge(e.detail?.convId, e.detail?.preview, e.detail?.createdAt);
      UniversalChatPage.#notificarMensagemNova(e.detail);
    });
    document.addEventListener('chatflow:conversa-aberta', e => {
      UniversalChatPage.#conversaAbertaId = e.detail?.convId ?? null;
      UniversalChatPage.#marcarConversaComoLida(UniversalChatPage.#conversaAbertaId);
    });
    document.addEventListener('chatflow:conversa-lida', e => {
      UniversalChatPage.#limparIndicadoresConversaLida(e.detail?.convId ?? e.detail?.conversationId);
    });
    document.addEventListener('chatflow:conversa-fechada', () => {
      UniversalChatPage.#conversaAbertaId = null;
    });

    // Inicia escuta de ofertas P2P
    UniversalChatPage.#iniciarEscutaOfertas();

    // Carrega imediatamente
    UniversalChatPage.#carregar();
  }

  /**
   * Abre o chat para a conversa indicada.
   * @param {string} convId — UUID da conversa ou peerId (legado P2P)
   */
  static async abrirModal(convId) {
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', null)) return;

    // Busca na lista em memória (por convId ou peerId)
    const conv = UniversalChatPage.#conversas.find(
      c => c.convId === convId || c.id === convId || c.peerId === convId
    );

    if (conv) {
      await ChatModal.abrir({
        convId:  conv.convId ?? conv.id,
        peerId:  conv.peerId ?? conv.id,
        nome:    conv.nome,
        sub:     conv.sub,
        avatar:  conv.avatar,
      });
      return;
    }

    // Fallback: convId desconhecido — abre com dados mínimos
    await ChatModal.abrir({
      convId,
      peerId: convId,
      nome:   'Contato',
      sub:    '💬 Mensagem',
      avatar: null,
    });
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADOS
  // ══════════════════════════════════════════════════════════

  static async #carregar() {
    if (!UniversalChatPage.#uid) {
      UniversalChatPage.#uid = await UniversalChatPage.#obterUid();
    }
    if (!UniversalChatPage.#uid) {
      UniversalChatPage.#conversas = [];
      UniversalChatPage.#renderVazio();
      UniversalChatPage.#atualizarIndicadorRodape();
      return;
    }

    // Assinatura realtime sempre ativa: a lista atualiza ao vivo mesmo sem
    // conversa aberta (canal único `chat.{uid}` — idempotente).
    if (typeof ChatRealtimeService !== 'undefined') {
      ChatRealtimeService.iniciar(UniversalChatPage.#uid);
    }

    UniversalChatPage.#renderSkeleton();

    let resultado;
    try {
      resultado = await ConversationListService.carregar(
        UniversalChatPage.#role,
        UniversalChatPage.#uid
      );
    } catch (e) {
      LoggerService.warn('[UniversalChatPage] carregar conversas falhou:', e?.message);
      UniversalChatPage.#conversas = [];
      UniversalChatPage.#renderVazio();
      UniversalChatPage.#atualizarIndicadorRodape();
      return;
    }

    const { conversas = [], favoritos = [] } = resultado ?? {};

    UniversalChatPage.#conversas = conversas;
    UniversalChatPage.#renderLista(conversas, favoritos);
    UniversalChatPage.#atualizarIndicadorRodape();
  }

  static #renderSkeleton() {
    const lista = UniversalChatPage.#lista;
    if (!lista) return;
    lista.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const sk = document.createElement('div');
      sk.className = 'barber-row barber-card barber-card--skeleton';
      sk.setAttribute('aria-hidden', 'true');
      lista.appendChild(sk);
    }
  }

  static #renderVazio() {
    const lista = UniversalChatPage.#lista;
    if (!lista) return;
    lista.innerHTML = '';
    const vazio = document.createElement('div');
    vazio.className = 'msgs-empty';
    vazio.textContent = 'Nenhuma conversa ainda. Use a busca para iniciar.';
    lista.appendChild(vazio);
  }

  static #renderLista(conversas, favoritos) {
    const lista = UniversalChatPage.#lista;
    if (!lista) return;
    lista.innerHTML = '';

    // ── Strip de favoritos (quick-start) ─────────────────────
    if (favoritos?.length > 0) {
      const secao = document.createElement('div');

      const titulo = document.createElement('p');
      titulo.className = 'msgs-favoritos-titulo';
      titulo.textContent = 'Iniciar conversa';
      secao.appendChild(titulo);

      const strip = document.createElement('div');
      strip.className = 'msgs-favoritos-strip';

      for (const fav of favoritos) {
        strip.appendChild(UniversalChatPage.#criarFavCard(fav));
      }
      secao.appendChild(strip);
      lista.appendChild(secao);
    }

    // ── Lista de conversas ───────────────────────────────────
    if (!conversas.length) {
      if (!favoritos?.length) UniversalChatPage.#renderVazio();
      return;
    }

    for (const conv of conversas) {
      lista.appendChild(UniversalChatPage.#criarCard(conv));
    }
  }

  static #criarCard(conv) {
    const row = document.createElement('div');
    row.className = `barber-row barber-card${conv.badge > 0 ? ' barber-row--unread' : ''}`;
    row.setAttribute('data-conv-id', conv.convId ?? conv.id ?? '');
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    // Avatar
    const av = document.createElement('div');
    av.className = 'chat-modal-avatar barber-avatar';
    if (conv.avatar) {
      const img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      img.alt     = conv.nome;
      img.onerror = () => { img.remove(); av.textContent = ChatModal.iniciais(conv.nome); };
      img.src     = conv.avatar;
      av.appendChild(img);
    } else {
      av.textContent = ChatModal.iniciais(conv.nome);
    }

    // Conteúdo
    const info = document.createElement('div');
    info.className = 'barber-info';

    const cabecalho = document.createElement('div');
    cabecalho.className = 'barber-row-header';

    const nome = document.createElement('span');
    nome.className = 'barber-nome';
    nome.textContent = conv.nome; // textContent — sem XSS

    const hora = document.createElement('span');
    hora.className = 'chat-time';
    hora.textContent = conv.hora ?? '';

    cabecalho.appendChild(nome);
    cabecalho.appendChild(hora);

    const preview = document.createElement('p');
    preview.className = 'chat-preview barber-esp';
    preview.textContent = conv.preview ?? conv.sub ?? ''; // textContent — sem XSS

    info.appendChild(cabecalho);
    info.appendChild(preview);

    // Badge de não lidas
    if (conv.badge > 0) {
      const badge = document.createElement('span');
      badge.className = 'chat-badge';
      badge.textContent = conv.badge > 99 ? '99+' : String(conv.badge);
      row.appendChild(badge);
    }

    row.appendChild(av);
    row.appendChild(info);

    const targetId = conv.convId ?? conv.id;
    row.addEventListener('click', () => UniversalChatPage.abrirModal(targetId));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') UniversalChatPage.abrirModal(targetId);
    });

    return row;
  }

  static #criarFavCard(fav) {
    const card = document.createElement('div');
    card.className = 'msgs-fav-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', `Conversar com ${fav.nome}`);

    const av = document.createElement('div');
    av.className = 'msgs-fav-avatar';
    if (fav.avatar) {
      const img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      img.alt     = fav.nome;
      img.onerror = () => { img.remove(); av.textContent = ChatModal.iniciais(fav.nome); };
      img.src     = fav.avatar;
      av.appendChild(img);
    } else {
      av.textContent = ChatModal.iniciais(fav.nome);
    }

    const nome = document.createElement('span');
    nome.className = 'msgs-fav-card-nome';
    nome.textContent = fav.nome; // textContent — sem XSS

    card.appendChild(av);
    card.appendChild(nome);

    card.addEventListener('click',   () => UniversalChatPage.#abrirFavorito(fav));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') UniversalChatPage.#abrirFavorito(fav);
    });

    return card;
  }

  static async #abrirFavorito(fav) {
    const { data, error } = await ConversationRepository.buscarOuCriar(fav.peerId);
    if (error || !data?.id) {
      LoggerService.warn('[UniversalChatPage] buscarOuCriar falhou:', error?.message);
      return;
    }
    await ChatModal.abrir({
      convId: data.id,
      peerId: fav.peerId,
      nome:   fav.nome,
      sub:    fav.sub ?? '💬 Mensagem',
      avatar: fav.avatar,
    });
  }

  static #atualizarBadge(convId, preview, createdAt = null) {
    if (!convId || !UniversalChatPage.#lista) return;
    if (convId === UniversalChatPage.#conversaAbertaId) {
      UniversalChatPage.#marcarConversaComoLida(convId);
      return;
    }

    const card = UniversalChatPage.#lista.querySelector(`[data-conv-id="${CSS.escape(convId)}"]`);
    if (!card) return;

    card.classList.add('barber-row--unread');

    const conv = UniversalChatPage.#conversas.find(c => (c.convId ?? c.id) === convId);
    if (conv) {
      conv.badge   = (conv.badge ?? 0) + 1;
      conv.preview = preview ?? conv.preview;
      conv.hora    = createdAt ? UniversalChatPage.#formatarHora(createdAt) : conv.hora;
    }

    // Atualiza badge DOM
    let badge = card.querySelector('.chat-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-badge';
      card.appendChild(badge);
    }
    const atual = parseInt(badge.textContent) || 0;
    badge.textContent = atual < 99 ? String(atual + 1) : '99+';

    // Atualiza preview DOM
    const previewEl = card.querySelector('.chat-preview');
    if (previewEl && preview) previewEl.textContent = preview;

    const horaEl = card.querySelector('.chat-time');
    if (horaEl && createdAt) horaEl.textContent = UniversalChatPage.#formatarHora(createdAt);

    UniversalChatPage.#atualizarIndicadorRodape();
  }

  static async #marcarConversaComoLida(convId) {
    if (!convId) return;
    UniversalChatPage.#limparIndicadoresConversaLida(convId);

    if (typeof ChatApiClient !== 'undefined') {
      const { error } = await ChatApiClient.marcarConversaComoLida(convId);
      if (error) LoggerService.warn('[UniversalChatPage] marcar lida falhou:', error?.message);
    }
  }

  static #limparIndicadoresConversaLida(convId) {
    if (!convId) return;
    const conv = UniversalChatPage.#conversas.find(c => (c.convId ?? c.id) === convId);
    if (conv) conv.badge = 0;

    const card = UniversalChatPage.#lista?.querySelector(`[data-conv-id="${CSS.escape(convId)}"]`);
    if (card) {
      card.classList.remove('barber-row--unread');
      card.querySelector('.chat-badge')?.remove();
    }
    UniversalChatPage.#atualizarIndicadorRodape();
  }

  static #atualizarIndicadorRodape() {
    const totalNaoLidas = UniversalChatPage.#conversas
      .reduce((total, conv) => total + Math.max(0, Number(conv.badge ?? 0)), 0);
    document.querySelectorAll('.nav-btn[data-tela="mensagens"], [data-tela="mensagens"].nav-btn')
      .forEach(btn => {
        btn.classList.toggle('nav-btn--unread', totalNaoLidas > 0);
        if (totalNaoLidas > 0) {
          btn.setAttribute('aria-label', `Mensagens, ${totalNaoLidas} nao lidas`);
        } else {
          btn.removeAttribute('aria-label');
        }
      });
  }

  static #notificarMensagemNova(detail = {}) {
    if (!detail?.convId || !detail?.preview) return;
    if (document.getElementById('tela-chat')?.classList.contains('ativa')) return;
    if (typeof NotificationService === 'undefined') return;

    const sender = detail?.sender ?? {};
    const nome = sender?.name ?? sender?.full_name ?? 'Nova mensagem';
    const preview = String(detail.preview ?? '').slice(0, 90);
    const avatarUrl = UniversalChatPage.#avatarUrl(sender);
    NotificationService.mostrarToast(
      nome,
      preview,
      NotificationService.TIPOS?.ENGAJAMENTO ?? NotificationService.TIPOS?.SISTEMA,
      () => UniversalChatPage.abrirModal(detail.convId),
      null,
      { avatarUrl, initials: ChatModal.iniciais(nome) },
    );
  }

  static #avatarUrl(sender) {
    if (sender?.avatarUrl) return sender.avatarUrl;
    const path = sender?.avatarPath ?? sender?.avatar_path ?? null;
    if (!path) return null;
    if (typeof ApiService !== 'undefined' && typeof ApiService.getAvatarUrl === 'function') {
      return ApiService.getAvatarUrl(path);
    }
    return path;
  }

  static #formatarHora(isoString) {
    try {
      const d = new Date(isoString);
      const agora = new Date();
      const diffDias = Math.floor((agora - d) / 86400000);
      if (diffDias === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (diffDias === 1) return 'ontem';
      if (diffDias < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
  }

  static async #iniciarEscutaOfertas() {
    const uid = UniversalChatPage.#uid ?? await UniversalChatPage.#obterUid();
    if (!uid) return;

    if (typeof MessageSignalingService === 'undefined') return;

    MessageSignalingService.subscribeToSignals(uid, async sinal => {
      if (sinal.type !== 'offer') return;

      const remoteId = sinal.from;

      // Registra callbacks para esta conexão entrante
      if (typeof P2PMessageConnectionService !== 'undefined') {
        P2PMessageConnectionService.onStatusChange(remoteId, status => {
          // ChatModal cuida do status se a conversa estiver aberta
        });
        P2PMessageConnectionService.onMessage(remoteId, ({ texto, hora }) => {
          // Se a conversa com remoteId estiver aberta no ChatModal, ele entregará
          // diretamente via seu próprio callback. Aqui só atualizamos o badge.
          const conv = UniversalChatPage.#conversas.find(
            c => c.peerId === remoteId || c.id === remoteId
          );
          if (conv) {
            UniversalChatPage.#atualizarBadge(conv.convId ?? conv.id, texto);
          }
          document.dispatchEvent(new CustomEvent('chatflow:mensagem-nova', {
            detail: { convId: remoteId, preview: texto }
          }));
        });
        await P2PMessageConnectionService.acceptConnection(uid, remoteId, sinal.payload);
      }
    });
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
}
