'use strict';

// =============================================================
// MessagesWidget — Tela de Mensagens P2P (POO, Singleton)
//
// Responsabilidades:
//   - Renderiza lista de conversas disponíveis
//   - Abre tela de chat ao clicar em um card
//   - Exibe status de conexão: conectando / seguro / desconectado / offline
//   - Inicia conexão P2P via P2PMessageConnectionService
//   - Envia mensagens criptografadas (bloqueia envio sem canal seguro)
//   - Recebe e exibe mensagens descriptografadas do peer
//   - Ao receber offer de outro usuário: aceita conexão P2P
//
// Mensagens NÃO são salvas em banco de dados.
// A criptografia é gerenciada por P2PMessageConnectionService + MessageCryptoService.
//
// Uso:
//   MessagesWidget.init('msgs-lista', 'cliente')
//   MessagesWidget.init('msgs-lista', 'profissional')
// =============================================================

class MessagesWidget {

  static #lista     = null;
  static #role      = 'cliente';
  static #conversa  = null;  // conversa aberta no momento ({ id, nome, sub, avatar })
  static #notifDig  = null;
  static #citadoId  = null;

  // Estado de conversas (carregado de agendamentos ou lista vazia)
  static #conversas = [];

  // ─── Status labels ───────────────────────────────────────────
  static #STATUS_LABEL = {
    'connecting':   '⏳ Conectando...',
    'key-exchange': '🔑 Trocando chaves...',
    'secure':       '🔒 Seguro',
    'disconnected': '⚠️ Desconectado',
    'failed':       '❌ Destinatário offline',
    'none':         '',
  };

  /** Anima entre telas via AnimationService. */
  static #animar(saindo, entrando, classeSaida, classeEntrada) {
    if (typeof AnimationService !== 'undefined') {
      AnimationService.animar(saindo, entrando, classeSaida, classeEntrada);
    } else {
      saindo?.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
      if (saindo) saindo.style.display = 'none';
      if (entrando) { entrando.style.display = 'flex'; entrando.classList.add('ativa'); }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string} listaId — id do container de cards
   * @param {string} role    — 'cliente' | 'profissional'
   */
  static init(listaId, role = 'cliente') {
    MessagesWidget.#lista = document.getElementById(listaId);
    MessagesWidget.#role  = role;

    if (!MessagesWidget.#lista) return;

    const tela = document.getElementById('tela-mensagens');
    if (tela) {
      new MutationObserver(() => {
        if (tela.classList.contains('ativa')) MessagesWidget.#carregar();
      }).observe(tela, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && MessagesWidget.#conversa) MessagesWidget.fecharModal();
    });

    MessagesWidget.#carregar();
    MessagesWidget.#initNotifDig();
    MessagesWidget.#iniciarEscutaOfertas();
  }

  /** Abre a tela de chat com a conversa informada e inicia conexão P2P. */
  static async abrirModal(convId) {
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', null)) return;

    const conv = MessagesWidget.#conversas.find(c => c.id === convId);
    if (!conv) return;

    MessagesWidget.#conversa = conv;

    // Zera badge
    conv.badge = 0;
    const badgeEl = MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"] .chat-badge`);
    if (badgeEl) badgeEl.remove();
    MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"]`)?.classList.remove('barber-row--unread');
    MessagesWidget.#atualizarNotifDig();

    // Preenche header do modal
    const avEl   = document.getElementById('chat-modal-avatar-inner');
    const nomeEl = document.getElementById('chat-modal-nome');
    const subEl  = document.getElementById('chat-modal-sub');
    if (nomeEl) nomeEl.textContent = conv.nome;
    if (subEl)  subEl.textContent  = conv.sub;
    if (avEl) {
      avEl.textContent = '';
      avEl.dataset.texto = '';
      if (conv.avatar) {
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        img.alt     = conv.nome;
        img.onerror = () => { img.remove(); avEl.textContent = MessagesWidget.#iniciais(conv.nome); };
        img.src     = conv.avatar;
        avEl.appendChild(img);
      } else {
        avEl.textContent = MessagesWidget.#iniciais(conv.nome);
      }
    }

    // Limpa área de mensagens e mostra status inicial
    const area = document.getElementById('chat-mensagens');
    if (area) area.innerHTML = '';
    MessagesWidget.#mostrarStatus('connecting');

    // Abre tela-chat
    const telaMensagens = document.getElementById('tela-mensagens');
    const telaChat      = document.getElementById('tela-chat');
    MessagesWidget.#animar(telaMensagens, telaChat, 'saindo-direita', 'entrando-lento');
    document.getElementById('footer-nav')?.style.setProperty('display', 'none');
    document.getElementById('footer-nav-offline')?.style.setProperty('display', 'none');

    // Registra callbacks antes de iniciar a conexão
    P2PMessageConnectionService.onStatusChange(convId, status => {
      MessagesWidget.#mostrarStatus(status);
    });

    P2PMessageConnectionService.onMessage(convId, ({ texto, hora }) => {
      const area = document.getElementById('chat-mensagens');
      if (area) {
        area.appendChild(MessagesWidget.#criarBolha({ de: 'outro', texto, hora }, conv.nome));
        area.scrollTop = area.scrollHeight;
      }
      conv.badge  += 1;
      conv.preview = texto;
      MessagesWidget.#renderConversas(MessagesWidget.#conversas);
      MessagesWidget.#atualizarNotifDig();
    });

    // Obtém ID do usuário local
    const localUserId = await MessagesWidget.#obterUid();
    if (!localUserId) {
      MessagesWidget.#mostrarStatus('failed');
      return;
    }

    // Fecha conexão anterior com este peer antes de iniciar nova
    const statusAtual = P2PMessageConnectionService.getStatus(convId);
    if (statusAtual !== 'secure' && statusAtual !== 'connecting' && statusAtual !== 'key-exchange') {
      await P2PMessageConnectionService.initiateConnection(localUserId, convId);
    }

    setTimeout(() => {
      if (area) area.scrollTop = area.scrollHeight;
    }, 380);
  }

  /** Fecha tela de chat e encerra conexão P2P com o peer atual. */
  static fecharModal() {
    const conv = MessagesWidget.#conversa;
    MessagesWidget.#conversa = null;

    if (conv) {
      P2PMessageConnectionService.close(conv.id);
    }

    const telaChat      = document.getElementById('tela-chat');
    const telaMensagens = document.getElementById('tela-mensagens');
    MessagesWidget.#animar(telaChat, null, 'saindo', 'ativa');
    if (telaMensagens) {
      telaMensagens.style.display = 'flex';
      telaMensagens.classList.add('ativa');
    }
    const router = window.App ?? window.Pro ?? null;
    if (router?._atualizarUI) router._atualizarUI(router._telaAtual ?? 'mensagens');
  }

  /**
   * Envia a mensagem digitada no input via P2P criptografado.
   * Bloqueia envio se não houver canal seguro estabelecido.
   */
  static async enviar() {
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', null)) return;

    const input = document.getElementById('chat-input');
    if (!input || !MessagesWidget.#conversa) return;

    const texto = input.value.trim();
    if (!texto) return;

    const status = P2PMessageConnectionService.getStatus(MessagesWidget.#conversa.id);
    if (status !== 'secure') {
      MessagesWidget.#exibirAvisoEnvio(status);
      return;
    }

    input.value = '';
    input.focus();

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const area = document.getElementById('chat-mensagens');
    let bolhaEl = null;

    if (area) {
      bolhaEl = MessagesWidget.#criarBolha({ de: 'eu', texto, hora }, MessagesWidget.#conversa.nome);
      area.appendChild(bolhaEl);
      area.scrollTop = area.scrollHeight;
    }

    try {
      await P2PMessageConnectionService.sendMessage(MessagesWidget.#conversa.id, texto);
      MessagesWidget.#conversa.preview = texto;
      MessagesWidget.#renderConversas(MessagesWidget.#conversas);
    } catch {
      if (bolhaEl) {
        bolhaEl.style.opacity = '0.55';
        bolhaEl.title = 'Falha ao enviar — verifique se o destinatário está online';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Carregamento de conversas
  // ═══════════════════════════════════════════════════════════

  static async #carregar() {
    MessagesWidget.#conversas = await MessagesWidget.#buscarConversas();
    MessagesWidget.#renderConversas(MessagesWidget.#conversas);
  }

  /**
   * Busca lista de conversas possíveis (baseada em agendamentos).
   * Retorna array vazio se não houver dados disponíveis.
   *
   * Nota de esquema:
   *   appointments.client_id       → profiles(id)       — FK direta
   *   appointments.professional_id → professionals(id)  — NÃO profiles
   *   professionals.id             → profiles(id)       — chave compartilhada
   *
   * Por isso o caso 'cliente' (precisa do perfil do profissional) usa 2 etapas:
   *   1. busca professional_ids dos agendamentos
   *   2. busca profiles.in('id', ids) — professionals.id === profiles.id
   */
  static async #buscarConversas() {
    try {
      const uid = await MessagesWidget.#obterUid();
      if (!uid) return [];
      if (typeof SupabaseService === 'undefined') return [];

      if (MessagesWidget.#role === 'cliente') {
        // Etapa 1: IDs dos profissionais com quem o cliente tem agendamento
        const { data: appts } = await SupabaseService.client
          .from('appointments')
          .select('professional_id')
          .eq('client_id', uid)
          .limit(30);

        if (!appts?.length) return [];

        // Etapa 2: perfis pelo mesmo UUID (professionals.id = profiles.id)
        const ids = [...new Set(appts.map(a => a.professional_id))];
        const { data: perfis } = await SupabaseService.client
          .from('profiles')
          .select('id, full_name, avatar_path, role')
          .in('id', ids);

        return MessagesWidget.#mapearPerfis(perfis ?? []);
      }

      // role === 'profissional': client_id → profiles (FK direta, PostgREST infere)
      const { data } = await SupabaseService.client
        .from('appointments')
        .select(`
          client_id,
          profiles (
            id,
            full_name,
            avatar_path,
            role
          )
        `)
        .eq('professional_id', uid)
        .limit(30);

      if (!data?.length) return [];
      return MessagesWidget.#mapearPerfis(data.map(row => row.profiles).filter(Boolean));
    } catch {
      return [];
    }
  }

  /**
   * Converte array de perfis Supabase em conversas deduplicadas.
   * @param {Array<{id:string, full_name:string|null, avatar_url:string|null, role:string|null}>} perfis
   * @returns {Array}
   */
  static #mapearPerfis(perfis) {
    const vistos = new Set();
    const conversas = [];
    for (const perfil of perfis) {
      if (!perfil || vistos.has(perfil.id)) continue;
      vistos.add(perfil.id);
      const tipoLabel = perfil.role === 'professional' ? '✂️ Profissional' : '👤 Cliente';
      conversas.push({
        id:      perfil.id,
        tipo:    perfil.role ?? 'usuario',
        nome:    perfil.full_name ?? 'Usuário',
        sub:     tipoLabel,
        avatar:  perfil.avatar_path ?? null,
        badge:   0,
        hora:    '',
        preview: 'Toque para iniciar conversa segura',
      });
    }
    return conversas;
  }

  /**
   * Inicia escuta de ofertas WebRTC de outros usuários.
   * Quando recebe uma offer: aceita a conexão P2P automaticamente.
   */
  static async #iniciarEscutaOfertas() {
    const localUserId = await MessagesWidget.#obterUid();
    if (!localUserId) return;

    MessageSignalingService.subscribeToSignals(localUserId, async (sinal) => {
      if (sinal.type !== 'offer') return;

      const remoteId = sinal.from;

      // Registra callbacks antes de aceitar
      P2PMessageConnectionService.onStatusChange(remoteId, status => {
        // Se a conversa com este peer estiver aberta, atualiza status
        if (MessagesWidget.#conversa?.id === remoteId) {
          MessagesWidget.#mostrarStatus(status);
        }
      });

      P2PMessageConnectionService.onMessage(remoteId, ({ texto, hora }) => {
        // Entrega mensagem se a conversa estiver aberta
        if (MessagesWidget.#conversa?.id === remoteId) {
          const area = document.getElementById('chat-mensagens');
          const conv = MessagesWidget.#conversas.find(c => c.id === remoteId);
          if (area) {
            area.appendChild(MessagesWidget.#criarBolha({ de: 'outro', texto, hora }, conv?.nome ?? 'Contato'));
            area.scrollTop = area.scrollHeight;
          }
        }
        // Atualiza badge e preview na lista
        const conv = MessagesWidget.#conversas.find(c => c.id === remoteId);
        if (conv) {
          conv.badge  += 1;
          conv.preview = texto;
          MessagesWidget.#renderConversas(MessagesWidget.#conversas);
          MessagesWidget.#atualizarNotifDig();
        }
      });

      await P2PMessageConnectionService.acceptConnection(localUserId, remoteId, sinal.payload);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Status de conexão
  // ═══════════════════════════════════════════════════════════

  static #mostrarStatus(status) {
    const el = document.getElementById('chat-status-badge');
    if (!el) return;
    el.textContent = MessagesWidget.#STATUS_LABEL[status] ?? '';
    el.dataset.status = status;
  }

  /** Exibe aviso inline quando o envio é bloqueado por falta de canal seguro. */
  static #exibirAvisoEnvio(status) {
    const area = document.getElementById('chat-mensagens');
    if (!area) return;

    const aviso = document.createElement('div');
    aviso.className = 'chat-aviso-sistema';

    if (status === 'failed' || status === 'none') {
      aviso.textContent = 'O destinatário precisa estar online para receber mensagens P2P.';
    } else if (status === 'connecting' || status === 'key-exchange') {
      aviso.textContent = 'Aguarde — estabelecendo conexão segura...';
    } else {
      aviso.textContent = 'Sem conexão segura. Tente novamente.';
    }

    area.appendChild(aviso);
    area.scrollTop = area.scrollHeight;

    setTimeout(() => aviso.remove(), 4000);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Notif DigText
  // ═══════════════════════════════════════════════════════════

  static #initNotifDig() {
    const el = document.getElementById('msgs-notif-dig');
    if (!el) return;
    MessagesWidget.#atualizarNotifDig();
  }

  static #atualizarNotifDig() {
    const el = document.getElementById('msgs-notif-dig');
    if (!el) return;

    if (MessagesWidget.#notifDig) {
      MessagesWidget.#notifDig.parar();
      MessagesWidget.#notifDig = null;
    }
    MessagesWidget.#limparPulso();

    const naoLidos = MessagesWidget.#conversas.filter(c => c.badge > 0);

    if (!naoLidos.length) {
      el.classList.remove('dig-visivel');
      return;
    }

    el.classList.add('dig-visivel');
    const textos = naoLidos.map(c => `${c.nome} te enviou uma mensagem`);

    const onTick = (textoAtual) => {
      const citada = naoLidos.find(c => textoAtual.includes(c.nome));
      if (citada) MessagesWidget.#pulsarCard(citada.id);
      else        MessagesWidget.#limparPulso();
    };

    if (typeof DigText !== 'undefined') {
      MessagesWidget.#notifDig = new DigText(el, textos, {
        velocidade: 36,
        loop:       true,
        pausaFinal: 2400,
        onTick,
      });
      MessagesWidget.#notifDig.iniciar();
    }
  }

  static #pulsarCard(convId) {
    if (MessagesWidget.#citadoId === convId) return;
    MessagesWidget.#limparPulso();
    MessagesWidget.#citadoId = convId;
    MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"]`)?.classList.add('card-citado');
  }

  static #limparPulso() {
    if (!MessagesWidget.#citadoId) return;
    MessagesWidget.#lista?.querySelector(`[data-conv-id="${MessagesWidget.#citadoId}"]`)?.classList.remove('card-citado');
    MessagesWidget.#citadoId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Renderização de lista
  // ═══════════════════════════════════════════════════════════

  static #renderConversas(lista) {
    const el = MessagesWidget.#lista;
    if (!el) return;
    el.innerHTML = '';

    if (!lista.length) {
      const empty = document.createElement('div');
      empty.className = 'msgs-empty';
      const icon = document.createElement('span');
      icon.textContent = '💬';
      const t1 = document.createElement('p');
      t1.textContent = 'Nenhuma conversa ainda';
      const t2 = document.createElement('p');
      t2.textContent = 'Agende um serviço para iniciar';
      empty.appendChild(icon);
      empty.appendChild(t1);
      empty.appendChild(t2);
      el.appendChild(empty);
      return;
    }

    lista.forEach(conv => el.appendChild(MessagesWidget.#criarCard(conv)));
  }

  static #criarCard(conv) {
    const row = document.createElement('div');
    row.className = conv.badge > 0 ? 'barber-row barber-card barber-row--unread' : 'barber-row barber-card';
    row.dataset.convId = conv.id;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.addEventListener('click',   () => MessagesWidget.abrirModal(conv.id));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') MessagesWidget.abrirModal(conv.id);
    });

    const av = document.createElement('div');
    av.className = 'avatar gold';
    av.style.cssText = 'flex-shrink:0;width:48px;height:48px;font-size:.9rem;font-weight:800;';
    if (conv.avatar) {
      const img = document.createElement('img');
      img.src     = conv.avatar;
      img.alt     = conv.nome;
      img.style   = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      img.onerror = () => { img.remove(); av.textContent = MessagesWidget.#iniciais(conv.nome); };
      av.appendChild(img);
    } else {
      av.textContent = MessagesWidget.#iniciais(conv.nome);
    }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = conv.nome;

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = conv.sub;

    const preview = document.createElement('p');
    preview.className   = 'chat-preview';
    preview.textContent = conv.preview;

    info.appendChild(nome);
    info.appendChild(sub);
    info.appendChild(preview);

    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    if (conv.hora) {
      const hora = document.createElement('span');
      hora.className   = 'chat-time';
      hora.textContent = conv.hora;
      meta.appendChild(hora);
    }

    if (conv.badge > 0) {
      const badge = document.createElement('span');
      badge.className   = 'chat-badge';
      badge.textContent = conv.badge;
      meta.appendChild(badge);
    }

    row.appendChild(av);
    row.appendChild(info);
    row.appendChild(meta);
    return row;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Bolhas de chat
  // ═══════════════════════════════════════════════════════════

  static #criarBolha(msg, nomeOutro) {
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble-wrap ${msg.de === 'eu' ? 'chat-bubble-eu' : 'chat-bubble-outro'}`;

    const av = document.createElement('div');
    av.className = `chat-bubble-avatar${msg.de === 'eu' ? ' chat-bubble-avatar-eu' : ''}`;
    av.textContent = msg.de === 'eu' ? 'EU' : MessagesWidget.#iniciais(nomeOutro);
    av.title = msg.de === 'eu' ? 'Você' : nomeOutro;

    const col = document.createElement('div');
    col.className = 'chat-bubble-col';

    const label = document.createElement('span');
    label.className   = 'chat-bubble-label';
    label.textContent = msg.de === 'eu' ? 'Você' : nomeOutro;

    const balao = document.createElement('div');
    balao.className   = 'chat-balao';
    balao.textContent = msg.texto; // textContent — previne XSS

    const horaEl = document.createElement('span');
    horaEl.className   = 'chat-bubble-hora';
    horaEl.textContent = msg.hora;

    col.appendChild(label);
    col.appendChild(balao);
    col.appendChild(horaEl);

    if (msg.de === 'eu') {
      wrap.appendChild(col);
      wrap.appendChild(av);
    } else {
      wrap.appendChild(av);
      wrap.appendChild(col);
    }

    return wrap;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Helpers
  // ═══════════════════════════════════════════════════════════

  static #iniciais(nome) {
    return (nome ?? '?')
      .split(' ')
      .slice(0, 2)
      .map(p => p[0] ?? '')
      .join('')
      .toUpperCase();
  }

  static async #obterUid() {
    try {
      if (typeof SupabaseService !== 'undefined') {
        const user = await SupabaseService.getUser();
        return user?.id ?? null;
      }
      return null;
    } catch {
      return null;
    }
  }
}
