'use strict';

// =============================================================
// MessagesWidget — Tela de Mensagens (POO, Singleton)
//
// Responsabilidades:
//   - Renderiza cards de conversas (formato barber-row barber-card)
//   - Suporta tipos: barbearia | barbeiro | cliente
//   - Abre modal de chat ao clicar em um card
//   - Bolhas de chat com avatar + nome de cada participante
//   - Envia mensagens reais via MessageService (fallback mock)
//   - Recebe mensagens em tempo real via Realtime (Supabase)
//
// Uso:
//   MessagesWidget.init('msgs-lista', 'cliente')
//   MessagesWidget.init('msgs-lista', 'profissional')
// =============================================================

class MessagesWidget {

  static #lista     = null;
  static #modal     = null;
  static #role      = 'cliente';
  static #conversa  = null;  // conversa aberta no momento
  static #notifDig  = null;
  static #citadoId  = null;  // id do card atualmente iluminado pelo dig

  // ──────────────────────────────────────────────────────────
  // Mock — substituir por chamadas Supabase quando schema existir
  // ──────────────────────────────────────────────────────────
  static #MOCK = {
    cliente: [
      {
        id: 'c1',
        tipo: 'barbearia',
        nome: 'Barbearia Elite',
        sub: '💈 Barbearia · Avenida Paulista, 123',
        avatar: null,
        badge: 2,
        hora: '14:23',
        preview: 'Seu agendamento foi confirmado para amanhã às 14h 🗓️',
        msgs: [
          { de: 'outro', texto: 'Olá! Seu agendamento foi confirmado para amanhã às 14h.', hora: '14:20' },
          { de: 'outro', texto: 'Não esqueça de chegar 5 minutos antes 😊', hora: '14:21' },
          { de: 'eu',    texto: 'Certo, obrigado! Estarei lá.', hora: '14:23' },
          { de: 'outro', texto: 'Ótimo! Te esperamos 💈', hora: '14:24' },
        ],
      },
      {
        id: 'c2',
        tipo: 'barbeiro',
        nome: 'João Silva',
        sub: '✂️ Barbeiro · Barbearia Elite',
        avatar: null,
        badge: 0,
        hora: 'Ontem',
        preview: 'Tudo certo! Te vejo na sexta então 👍',
        msgs: [
          { de: 'eu',    texto: 'Oi João, posso vir sexta às 10h?', hora: '10:00' },
          { de: 'outro', texto: 'Claro! Pode vir sem problema.', hora: '10:05' },
          { de: 'outro', texto: 'Tudo certo! Te vejo na sexta então 👍', hora: '10:06' },
        ],
      },
      {
        id: 'c3',
        tipo: 'barbearia',
        nome: 'King Cuts',
        sub: '💈 Barbearia · Rua das Flores, 45',
        avatar: null,
        badge: 0,
        hora: 'Seg',
        preview: 'Obrigado pela visita! Avalie seu atendimento',
        msgs: [
          { de: 'outro', texto: 'Obrigado pela visita! Esperamos te ver em breve 🙏', hora: '16:00' },
          { de: 'outro', texto: 'Deixe sua avaliação para nos ajudar a melhorar ⭐', hora: '16:01' },
        ],
      },
    ],
    profissional: [
      {
        id: 'p1',
        tipo: 'cliente',
        nome: 'Lucas Ferreira',
        sub: '👤 Cliente',
        avatar: null,
        badge: 1,
        hora: '14:15',
        preview: 'Pode confirmar o horário das 14:30? 🙏',
        msgs: [
          { de: 'outro', texto: 'Oi! Pode confirmar meu horário das 14:30 de hoje?', hora: '14:10' },
          { de: 'eu',    texto: 'Olá Lucas! Sim, está confirmado 👍', hora: '14:12' },
          { de: 'outro', texto: 'Ótimo! Obrigado 🙏', hora: '14:15' },
        ],
      },
      {
        id: 'p2',
        tipo: 'cliente',
        nome: 'Marcos Oliveira',
        sub: '👤 Cliente',
        avatar: null,
        badge: 0,
        hora: '10:40',
        preview: 'Valeu pelo corte! Ficou incrível 🔥',
        msgs: [
          { de: 'outro', texto: 'Cara, valeu pelo corte! Ficou incrível 🔥', hora: '10:40' },
          { de: 'eu',    texto: 'Fico feliz! Até a próxima ✂️', hora: '10:42' },
        ],
      },
      {
        id: 'p3',
        tipo: 'cliente',
        nome: 'Bruno Santos',
        sub: '👤 Cliente',
        avatar: null,
        badge: 2,
        hora: 'Ontem',
        preview: 'Posso adiantar para 16h?',
        msgs: [
          { de: 'outro', texto: 'Oi! Posso adiantar para 16h hoje?', hora: '09:00' },
          { de: 'outro', texto: 'Preciso sair mais cedo do serviço', hora: '09:01' },
        ],
      },
      {
        id: 'p4',
        tipo: 'cliente',
        nome: 'Rafael Lima',
        sub: '👤 Cliente',
        avatar: null,
        badge: 0,
        hora: 'Seg',
        preview: 'Show! Até semana que vem então 👊',
        msgs: [
          { de: 'eu',    texto: 'Rafael, confirmado para semana que vem!', hora: '15:00' },
          { de: 'outro', texto: 'Show! Até semana que vem então 👊', hora: '15:05' },
        ],
      },
    ],
  };

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string} listaId  — id do container de cards
   * @param {string} role     — 'cliente' | 'profissional'
   */
  static init(listaId, role = 'cliente') {
    MessagesWidget.#lista = document.getElementById(listaId);
    MessagesWidget.#modal = document.getElementById('chat-modal');
    MessagesWidget.#role  = role;

    if (!MessagesWidget.#lista) return;

    // Re-renderiza ao entrar na tela via Router
    const tela = document.getElementById('tela-mensagens');
    if (tela) {
      new MutationObserver(() => {
        if (tela.classList.contains('ativa')) MessagesWidget.#carregar();
      }).observe(tela, { attributes: true, attributeFilter: ['class'] });
    }

    // Fechar modal ao pressionar Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') MessagesWidget.fecharModal();
    });

    MessagesWidget.#carregar();
    MessagesWidget.#initNotifDig();
    MessagesWidget.#iniciarRealtime();
  }

  /** Abre o modal de chat para a conversa com o id informado. */
  static abrirModal(convId) {
    const lista = MessagesWidget.#MOCK[MessagesWidget.#role] ?? [];
    const conv  = lista.find(c => c.id === convId);
    if (!conv || !MessagesWidget.#modal) return;

    MessagesWidget.#conversa = conv;

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
        // DOM API — previne XSS ao usar URL de avatar do banco de dados
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

    // Zera badge visualmente
    conv.badge = 0;
    const card = MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"] .chat-badge`);
    if (card) card.remove();
    const cardEl = MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"]`);
    if (cardEl) cardEl.classList.remove('barber-row--unread');
    MessagesWidget.#atualizarNotifDig();

    MessagesWidget.#renderMensagens(conv.msgs, conv.nome);

    MessagesWidget.#modal.classList.add('chat-modal-aberto');
    MessagesWidget.#modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('chat-modal-lock');

    // Rola para a última mensagem
    setTimeout(() => {
      const area = document.getElementById('chat-mensagens');
      if (area) area.scrollTop = area.scrollHeight;
    }, 60);
  }

  /** Fecha o modal de chat. */
  static fecharModal() {
    if (!MessagesWidget.#modal) return;
    MessagesWidget.#modal.classList.remove('chat-modal-aberto');
    MessagesWidget.#modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('chat-modal-lock');
    MessagesWidget.#conversa = null;
  }

  /**
   * Envia a mensagem digitada no input.
   * Renderização otimista — bolha aparece imediatamente;
   * o INSERT no banco acontece em background via MessageService.
   */
  static enviar() {
    const input = document.getElementById('chat-input');
    if (!input || !MessagesWidget.#conversa) return;

    const texto = input.value.trim();
    if (!texto) return;

    input.value = '';
    input.focus();

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const msg  = { de: 'eu', texto, hora, _enviando: true };

    MessagesWidget.#conversa.msgs.push(msg);
    MessagesWidget.#conversa.preview = texto;

    const area = document.getElementById('chat-mensagens');
    let bolhaEl = null;
    if (area) {
      bolhaEl = MessagesWidget.#criarBolha(msg, MessagesWidget.#conversa.nome);
      area.appendChild(bolhaEl);
      area.scrollTop = area.scrollHeight;
    }

    // Persist no banco em background (não bloqueia UI)
    const conv = MessagesWidget.#conversa;
    if (typeof MessageService !== 'undefined') {
      MessageService.enviarMensagem(conv.recipientId ?? conv.id, texto)
        .then(({ ok }) => {
          if (!ok && bolhaEl) {
            // Indica falha com ícone sutil mas não remove a bolha
            bolhaEl.style.opacity = '0.55';
            bolhaEl.title = 'Falha ao enviar — toque para tentar novamente';
          }
          msg._enviando = false;
        })
        .catch(() => {
          if (bolhaEl) bolhaEl.style.opacity = '0.55';
        });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Carregamento
  // ═══════════════════════════════════════════════════════════

  static #carregar() {
    const lista = MessagesWidget.#MOCK[MessagesWidget.#role] ?? [];
    MessagesWidget.#renderConversas(lista);
  }

  /**
   * Inicia escuta Realtime de novas mensagens recebidas.
   * Ao chegar nova mensagem, atualiza o card do remetente na lista
   * e refresca a animação de não-lidos (DigText).
   */
  static async #iniciarRealtime() {
    if (typeof MessageService === 'undefined') return;

    await MessageService.iniciarRealtime(nova => {
      // Encontra a conversa correspondente ao remetente
      const lista = MessagesWidget.#MOCK[MessagesWidget.#role] ?? [];
      const conv  = lista.find(c => c.id === nova.sender_id || c.recipientId === nova.sender_id);

      if (conv) {
        conv.badge   += 1;
        conv.preview  = nova.content;
        conv.hora     = new Date(nova.created_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit',
        });
        conv.msgs.push({
          de:   'outro',
          texto: nova.content,
          hora:  conv.hora,
        });
      }

      // Re-renderiza lista e atualiza DigText
      MessagesWidget.#carregar();
      MessagesWidget.#atualizarNotifDig();

      // Se o modal dessa conversa estiver aberto, renderiza a nova bolha
      if (MessagesWidget.#conversa?.id === nova.sender_id) {
        const area = document.getElementById('chat-mensagens');
        if (area && conv) {
          const msg = conv.msgs.at(-1);
          area.appendChild(MessagesWidget.#criarBolha(msg, conv.nome));
          area.scrollTop = area.scrollHeight;
        }
      }
    });
  }

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

    const lista    = MessagesWidget.#MOCK[MessagesWidget.#role] ?? [];
    const naoLidos = lista.filter(c => c.badge > 0);

    if (!naoLidos.length) {
      el.classList.remove('dig-visivel');
      return;
    }

    el.classList.add('dig-visivel');
    const textos = naoLidos.map(c => `${c.nome} te enviou uma mensagem`);

    // onTick: a cada letra digitada verifica qual nome está aparecendo
    const onTick = (textoAtual) => {
      const citada = naoLidos.find(c => textoAtual.includes(c.nome));
      if (citada) MessagesWidget.#pulsarCard(citada.id);
      else        MessagesWidget.#limparPulso();
    };

    MessagesWidget.#notifDig = new DigText(el, textos, {
      velocidade: 36,
      loop:       true,
      pausaFinal: 2400,
      onTick,
    });
    MessagesWidget.#notifDig.iniciar();
  }

  /** Ilumina e faz piscar a borda do card da conversa citada. */
  static #pulsarCard(convId) {
    if (MessagesWidget.#citadoId === convId) return; // já ativo
    MessagesWidget.#limparPulso();
    MessagesWidget.#citadoId = convId;
    const cardEl = MessagesWidget.#lista?.querySelector(`[data-conv-id="${convId}"]`);
    cardEl?.classList.add('card-citado');
  }

  /** Remove o efeito pulsante do card atual. */
  static #limparPulso() {
    if (!MessagesWidget.#citadoId) return;
    const cardEl = MessagesWidget.#lista?.querySelector(`[data-conv-id="${MessagesWidget.#citadoId}"]`);
    cardEl?.classList.remove('card-citado');
    MessagesWidget.#citadoId = null;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Renderização de lista de conversas
  // ═══════════════════════════════════════════════════════════

  static #renderConversas(lista) {
    const el = MessagesWidget.#lista;
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

    // ── Avatar ──
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

    // ── Info ──
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = conv.nome;

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = conv.sub;

    const preview = document.createElement('p');
    preview.className = 'chat-preview';
    preview.textContent = conv.preview;

    info.appendChild(nome);
    info.appendChild(sub);
    info.appendChild(preview);

    // ── Meta ──
    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const hora = document.createElement('span');
    hora.className   = 'chat-time';
    hora.textContent = conv.hora;
    meta.appendChild(hora);

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
  // PRIVADO — Modal de chat
  // ═══════════════════════════════════════════════════════════

  static #renderMensagens(msgs, nomeOutro) {
    const area = document.getElementById('chat-mensagens');
    if (!area) return;
    area.innerHTML = '';
    msgs.forEach(m => area.appendChild(MessagesWidget.#criarBolha(m, nomeOutro)));
  }

  static #criarBolha(msg, nomeOutro) {
    const wrap = document.createElement('div');
    wrap.className = `chat-bubble-wrap ${msg.de === 'eu' ? 'chat-bubble-eu' : 'chat-bubble-outro'}`;

    // Avatar da bolha
    const av = document.createElement('div');
    av.className = `chat-bubble-avatar${msg.de === 'eu' ? ' chat-bubble-avatar-eu' : ''}`;
    av.textContent = msg.de === 'eu' ? 'EU' : MessagesWidget.#iniciais(nomeOutro);
    av.title = msg.de === 'eu' ? 'Você' : nomeOutro;

    // Coluna: label + balão + hora
    const col = document.createElement('div');
    col.className = 'chat-bubble-col';

    const label = document.createElement('span');
    label.className   = 'chat-bubble-label';
    label.textContent = msg.de === 'eu' ? 'Você' : nomeOutro;

    const balao = document.createElement('div');
    balao.className   = 'chat-balao';
    balao.textContent = msg.texto;

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
}
