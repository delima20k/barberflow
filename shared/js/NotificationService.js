'use strict';

// =============================================================
// NotificationService.js — Sistema de notificações (POO, Singleton)
//
// Responsabilidades:
//   - Gerenciar histórico local de notificações (localStorage)
//   - Exibir toasts visuais não-bloqueantes
//   - Sincronizar com banco via Supabase Realtime
//   - Solicitar permissão de Push Notification de forma amigável
//   - Atualizar badge no header
//   - Navegar para a tela relevante ao clicar
//
// Tipos: AGENDAMENTO, BARBEARIA, SISTEMA, ENGAJAMENTO
//
// Dependências: SupabaseService.js (opcional — app funciona offline)
// NÃO depende do Router — navega via evento DOM customizado
// =============================================================

class NotificationService {

  // ── Tipos de notificação ────────────────────────────────────
  static TIPOS = Object.freeze({
    AGENDAMENTO: 'agendamento',
    BARBEARIA:   'barbearia',
    SISTEMA:     'sistema',
    ENGAJAMENTO: 'engajamento',
  });

  // ── Ícones por tipo ──────────────────────────────────────────
  static #ICONES = {
    agendamento: '📅',
    barbearia:   '💈',
    sistema:     '⚙️',
    engajamento: '📍',
  };

  // ── Cores por tipo ───────────────────────────────────────────
  static #CORES = {
    agendamento: '#D4A017',
    barbearia:   '#5C3317',
    sistema:     '#0D1F3C',
    engajamento: '#52c97a',
  };

  // ── Internos ─────────────────────────────────────────────────
  static #MAX_LOCAL  = 50;          // máximo de itens no localStorage
  static #TOAST_DUR  = 4500;        // ms antes de desaparecer
  static #KEY_LOCAL  = 'bf_notificacoes';
  static #canal      = null;        // canal Supabase Realtime ativo
  static #toastTimer = null;        // debounce para toasts em sequência
  static #iniciado   = false;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o serviço: cria container de toasts, atualiza badge.
   * Deve ser chamado no DOMContentLoaded.
   */
  static init() {
    if (NotificationService.#iniciado) return;
    NotificationService.#iniciado = true;

    NotificationService.#criarToastContainer();
    NotificationService.#atualizarBadge();

    // Reage a novas notificações via evento DOM (desacoplado do Realtime)
    document.addEventListener('barberflow:notificacao-nova', () => {
      NotificationService.#atualizarBadge();
    });

    // Conecta/desconecta Realtime junto com a sessão Supabase
    try {
      SupabaseService.getSession().then(({ data: { session } }) => {
        if (session?.user) NotificationService.iniciarRealtime(session.user.id);
      }).catch(() => {});
    } catch (_) {
      // SupabaseService não disponível — continua offline
    }
  }

  /**
   * Inicia o canal Realtime do Supabase para o usuário logado.
   * Chamado pelo AuthService após login bem-sucedido.
   * @param {string} userId
   */
  static iniciarRealtime(userId) {
    if (!userId) return;
    if (NotificationService.#canal) return; // já conectado

    try {
      NotificationService.#canal = SupabaseService.channel(`notificacoes:${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => NotificationService.#onRealtimeInsert(payload.new)
        )
        .subscribe();
    } catch (_) {
      // Realtime indisponível — app continua funcionando normalmente
    }
  }

  /**
   * Para o canal Realtime (logout).
   */
  static pararRealtime() {
    if (NotificationService.#canal) {
      try {
      SupabaseService.removeChannel(NotificationService.#canal);
      } catch (_) {}
      NotificationService.#canal = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — CRUD local
  // ═══════════════════════════════════════════════════════════

  /**
   * Cria uma notificação local (sem gravar no banco).
   * Útil para notificações de sistema/engajamento offline.
   * @param {string} tipo — NotificationService.TIPOS.*
   * @param {string} titulo
   * @param {string} [body]
   * @param {object} [dados] — ex: { tela: 'mensagens', id: 'xxx' }
   * @returns {object} notif criada
   */
  static criar(tipo, titulo, body = '', dados = {}) {
    const notif = {
      id:         `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      tipo,
      titulo,
      body,
      dados,
      is_read:    false,
      created_at: new Date().toISOString(),
    };

    NotificationService.#salvarLocal(notif);
    NotificationService.mostrarToast(titulo, body, tipo);
    NotificationService.#atualizarBadge();
    NotificationService.#dispararEvento(notif);

    return notif;
  }

  /**
   * Retorna todas as notificações salvas localmente, da mais recente à mais antiga.
   * @returns {object[]}
   */
  static listar() {
    return NotificationService.#lerLocal();
  }

  /**
   * Retorna o número de notificações não lidas.
   * @returns {number}
   */
  static contarNaoLidas() {
    return NotificationService.#lerLocal().filter(n => !n.is_read).length;
  }

  /**
   * Marca uma notificação como lida (local + Supabase se online).
   * @param {string} id
   */
  static async marcarLida(id) {
    const lista = NotificationService.#lerLocal().map(n =>
      n.id === id ? { ...n, is_read: true } : n
    );
    NotificationService.#gravarLocal(lista);
    NotificationService.#atualizarBadge();

    // Sincroniza com banco se for ID real (uuid, não local_*)
    if (!id.startsWith('local_')) {
      try {
        await SupabaseService.notifications()
          .update({ is_read: true })
          .eq('id', id);
      } catch (_) {}
    }
  }

  /**
   * Marca todas as notificações como lidas.
   */
  static async marcarTodasLidas() {
    const lista = NotificationService.#lerLocal().map(n => ({ ...n, is_read: true }));
    NotificationService.#gravarLocal(lista);
    NotificationService.#atualizarBadge();

    // IDs reais (não locais) para sincronizar com o banco
    const ids = lista
      .map(n => n.id)
      .filter(id => !id.startsWith('local_'));

    if (ids.length > 0) {
      try {
        await SupabaseService.notifications()
          .update({ is_read: true })
          .in('id', ids);
      } catch (_) {}
    }
  }

  /**
   * Remove uma notificação do histórico local.
   * @param {string} id
   */
  static remover(id) {
    const lista = NotificationService.#lerLocal().filter(n => n.id !== id);
    NotificationService.#gravarLocal(lista);
    NotificationService.#atualizarBadge();
  }

  /**
   * Limpa todo o histórico local.
   */
  static limpar() {
    NotificationService.#gravarLocal([]);
    NotificationService.#atualizarBadge();
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Toast visual
  // ═══════════════════════════════════════════════════════════

  /**
   * Exibe um toast visual não-bloqueante no topo da tela.
   * @param {string} titulo
   * @param {string} [body]
   * @param {string} [tipo] — NotificationService.TIPOS.*
   * @param {function|null} [onClick]
   */
  static mostrarToast(titulo, body = '', tipo = NotificationService.TIPOS.SISTEMA, onClick = null) {
    const container = document.getElementById('notif-toast-container');
    if (!container) return;

    const icone = NotificationService.#ICONES[tipo] ?? '🔔';
    const cor   = NotificationService.#CORES[tipo]  ?? 'var(--gold)';

    // Toca chime em toda notificação visual
    if (typeof QueuePoller !== 'undefined') {
      try { QueuePoller.tocarSom(); } catch (_) {}
    }

    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <div class="notif-toast-icone" style="color:${cor}">${icone}</div>
      <div class="notif-toast-corpo">
        <p class="notif-toast-titulo">${NotificationService.#escapar(titulo)}</p>
        ${body ? `<p class="notif-toast-body">${NotificationService.#escapar(body)}</p>` : ''}
      </div>
      <button class="notif-toast-fechar" aria-label="Fechar">✕</button>
    `;

    // Fechar manual
    toast.querySelector('.notif-toast-fechar').addEventListener('click', (e) => {
      e.stopPropagation();
      NotificationService.#fecharToast(toast);
    });

    // Clicar no corpo
    if (onClick) {
      toast.addEventListener('click', (e) => {
        if (!e.target.classList.contains('notif-toast-fechar')) onClick();
      });
      toast.style.cursor = 'pointer';
    }

    container.appendChild(toast);

    // Força reflow para animação CSS funcionar
    void toast.offsetWidth;
    toast.classList.add('notif-toast--visivel');

    // Auto-dismiss
    const timer = setTimeout(
      () => NotificationService.#fecharToast(toast),
      NotificationService.#TOAST_DUR
    );

    // Cancela dismiss ao hover
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => {
      setTimeout(() => NotificationService.#fecharToast(toast), 1500);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Push Notification (browser)
  // ═══════════════════════════════════════════════════════════

  /**
   * Solicita permissão de notificação push do browser.
   *
   * Comportamento:
   *  - Permissão já definida (granted/denied) → noop.
   *  - Banner dispensado há menos de 7 dias → noop.
   *  - Caso contrário: tenta chamar Notification.requestPermission() diretamente,
   *    forçando o diálogo nativo do SO. Em browsers que exigem gesto do usuário
   *    (iOS Safari), a API lança exceção — o banner de consentimento é exibido
   *    como fallback para que o usuário dê o gesto e a permissão seja solicitada.
   */
  static async solicitarPushPermissao() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    // Não insistir se o usuário dispensou nos últimos 7 dias
    try {
      const dispensado = Number(localStorage.getItem('bf_push_dispensado') ?? 0);
      if (dispensado && Date.now() - dispensado < 7 * 24 * 60 * 60 * 1000) return;
    } catch { /* storage indisponível */ }

    try {
      // Tenta forçar o diálogo nativo diretamente (Chrome, Firefox, Android WebView)
      const resultado = await Notification.requestPermission();
      if (resultado === 'granted') {
        NotificationService.criar(
          NotificationService.TIPOS.SISTEMA,
          'Notificações ativadas! 🔔',
          'Você receberá alertas de fila mesmo com o app em segundo plano.',
          {}
        );
      }
    } catch {
      // iOS Safari exige gesto do usuário — exibe banner como fallback
      const banner = document.getElementById('notif-push-banner');
      if (banner) banner.hidden = false;
    }
  }

  /**
   * Confirma a solicitação de push (chamado pelo botão "Ativar" no banner).
   */
  static async confirmarPush() {
    const banner = document.getElementById('notif-push-banner');
    if (banner) banner.hidden = true;

    if (!('Notification' in window)) return;

    try {
      const resultado = await Notification.requestPermission();
      if (resultado === 'granted') {
        NotificationService.criar(
          NotificationService.TIPOS.SISTEMA,
          'Notificações ativadas! 🔔',
          'Você receberá novidades das barbearias próximas.',
          {}
        );
      }
    } catch (_) {}
  }

  /**
   * Descarta o banner de push sem solicitar permissão.
   */
  static dispensarPush() {
    const banner = document.getElementById('notif-push-banner');
    if (banner) banner.hidden = true;

    // Não mostrar novamente por 7 dias
    try {
      localStorage.setItem('bf_push_dispensado', Date.now().toString());
    } catch (_) {}
  }

  /**
   * Renderiza a lista de notificações na tela-notificacoes.
   * @param {string} [filtro] — tipo para filtrar, ou 'todos'
   */
  static renderizarLista(filtro = 'todos') {
    const container = document.getElementById('notif-lista');
    if (!container) return;

    const lista = NotificationService.#lerLocal().filter(n =>
      filtro === 'todos' || n.tipo === filtro
    );

    if (lista.length === 0) {
      container.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icone">🔔</div>
          <p class="notif-empty-titulo">Nenhuma notificação</p>
          <p class="notif-empty-sub">Você está em dia com tudo!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = lista.map(n => `
      <div class="notif-item${n.is_read ? ' lida' : ''}"
           data-id="${NotificationService.#escapar(n.id)}"
           data-tela="${NotificationService.#escapar(n.dados?.tela ?? '')}"
           onclick="NotificationService.clicarItem(this)">
        <div class="notif-item-icone" style="color:${NotificationService.#CORES[n.tipo] ?? 'var(--gold)'}">
          ${NotificationService.#ICONES[n.tipo] ?? '🔔'}
        </div>
        <div class="notif-item-corpo">
          <p class="notif-item-titulo">${NotificationService.#escapar(n.titulo)}</p>
          ${n.body ? `<p class="notif-item-body">${NotificationService.#escapar(n.body)}</p>` : ''}
          <p class="notif-item-tempo">${NotificationService.#tempoRelativo(n.created_at)}</p>
        </div>
        ${!n.is_read ? '<span class="notif-item-ponto" aria-label="Não lida"></span>' : ''}
      </div>
    `).join('');
  }

  /**
   * Chamado ao clicar em um item da lista de notificações.
   * @param {HTMLElement} el
   */
  static clicarItem(el) {
    const id   = el.dataset.id;
    const tela = el.dataset.tela;

    NotificationService.marcarLida(id);
    el.classList.add('lida');
    el.querySelector('.notif-item-ponto')?.remove();

    if (tela) {
      NotificationService.#navegar({ tela });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Supabase Realtime
  // ═══════════════════════════════════════════════════════════

  static #onRealtimeInsert(notifBanco) {
    const notif = {
      id:         notifBanco.id,
      tipo:       NotificationService.#normalizarTipo(notifBanco.type),
      titulo:     notifBanco.title,
      body:       notifBanco.body ?? '',
      dados:      notifBanco.data ?? {},
      is_read:    notifBanco.is_read ?? false,
      created_at: notifBanco.created_at,
    };

    NotificationService.#salvarLocal(notif);

    NotificationService.mostrarToast(
      notif.titulo,
      notif.body,
      notif.tipo,
      notif.dados?.tela ? () => NotificationService.#navegar(notif.dados) : null
    );
    NotificationService.#atualizarBadge();
    NotificationService.#dispararEvento(notif);
  }

  static #normalizarTipo(type) {
    if (!type) return NotificationService.TIPOS.SISTEMA;
    if (type.startsWith('appointment') || type.startsWith('queue')) return NotificationService.TIPOS.AGENDAMENTO;
    if (type.startsWith('story') || type.startsWith('promo'))       return NotificationService.TIPOS.BARBEARIA;
    if (type.startsWith('message') || type.startsWith('new_message')) return NotificationService.TIPOS.ENGAJAMENTO;
    return NotificationService.TIPOS.SISTEMA;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — DOM
  // ═══════════════════════════════════════════════════════════

  static #criarToastContainer() {
    if (document.getElementById('notif-toast-container')) return;
    const el = document.createElement('div');
    el.id        = 'notif-toast-container';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    document.body.appendChild(el);
  }

  static #fecharToast(toast) {
    if (!toast.isConnected) return;
    toast.classList.remove('notif-toast--visivel');
    toast.classList.add('notif-toast--saindo');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }

  static #atualizarBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const count = NotificationService.contarNaoLidas();
    badge.textContent  = count > 99 ? '99+' : String(count);
    badge.hidden       = count === 0;
    badge.setAttribute('aria-label', `${count} notificações não lidas`);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Navegação (desacoplado do Router)
  // ═══════════════════════════════════════════════════════════

  static #navegar(dados) {
    if (!dados?.tela) return;
    // Detecta qual instância do app está rodando (cliente ou profissional)
    const roteador = typeof App !== 'undefined' ? App
                   : typeof Pro !== 'undefined' ? Pro
                   : null;
    if (roteador) roteador.nav(dados.tela);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — localStorage
  // ═══════════════════════════════════════════════════════════

  static #lerLocal() {
    try {
      const raw = localStorage.getItem(NotificationService.#KEY_LOCAL);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  static #gravarLocal(lista) {
    try {
      localStorage.setItem(NotificationService.#KEY_LOCAL, JSON.stringify(lista));
    } catch (_) {}
  }

  static #salvarLocal(notif) {
    const lista = NotificationService.#lerLocal();
    // Evita duplicata (mesmo id do banco)
    const existe = lista.some(n => n.id === notif.id);
    if (existe) return;

    lista.unshift(notif); // mais recente primeiro
    // Limita ao máximo definido
    const cortada = lista.slice(0, NotificationService.#MAX_LOCAL);
    NotificationService.#gravarLocal(cortada);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Utilitários
  // ═══════════════════════════════════════════════════════════

  static #escapar(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  static #tempoRelativo(isoString) {
    try {
      const diff    = Date.now() - new Date(isoString).getTime();
      const minutos = Math.floor(diff / 60000);
      if (minutos < 1)  return 'Agora mesmo';
      if (minutos < 60) return `Há ${minutos} min`;
      const horas = Math.floor(minutos / 60);
      if (horas < 24)   return `Há ${horas}h`;
      const dias = Math.floor(horas / 24);
      return `Há ${dias} dia${dias > 1 ? 's' : ''}`;
    } catch (_) {
      return '';
    }
  }

  static #dispararEvento(notif) {
    document.dispatchEvent(
      new CustomEvent('barberflow:notificacao-nova', { detail: { notif } })
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Troca de categoria (chamado pelos botões de tab)
  // ═══════════════════════════════════════════════════════════

  /**
   * Troca a aba ativa na tela de notificações e re-renderiza a lista.
   * @param {HTMLElement} btnAtivo — o botão que foi clicado
   * @param {string} filtro — 'todos' | tipo do TIPOS enum
   */
  static _trocarCategoria(btnAtivo, filtro) {
    // Atualiza estado visual dos botões
    const tabs = btnAtivo.closest('[role="tablist"]');
    if (tabs) {
      tabs.querySelectorAll('.notif-cat-btn').forEach(btn => {
        btn.classList.remove('ativo');
        btn.setAttribute('aria-selected', 'false');
      });
    }
    btnAtivo.classList.add('ativo');
    btnAtivo.setAttribute('aria-selected', 'true');

    // Guarda o filtro atual na tela para o botão "Marcar todas"
    const tela = btnAtivo.closest('.tela');
    if (tela) tela.dataset.filtro = filtro;

    NotificationService.renderizarLista(filtro);
  }
}
