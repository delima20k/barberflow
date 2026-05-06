'use strict';

// =============================================================
// QueueConfirmService.js — Confirmação de presença na cadeira (POO, Singleton)
//
// Responsabilidades:
//   - CLIENTE: ouve updates em queue_entries via Realtime.
//     Quando status muda para 'in_service', exibe modal pedindo
//     confirmação de presença. Se recusar → INSERT notification
//     para o barbeiro (type: queue_client_absent).
//
//   - PROFISSIONAL: ouve evento DOM 'barberflow:notificacao-nova'.
//     Quando chega notif do tipo 'queue_client_absent', toca som
//     e exibe modal perguntando se quer pular a vez ou aguardar.
//
// Dependências: SupabaseService.js, NotificationService.js (already loaded)
// =============================================================

class QueueConfirmService {

  // ── Internos ─────────────────────────────────────────────────
  static #role         = null;   // 'client' | 'professional'
  static #userId       = null;
  static #canalFila    = null;   // Realtime channel (cliente)
  static #entryAtiva   = null;   // queue_entry atual do cliente
  static #audioCtx     = null;   // Web Audio API context

  // ── IDs dos modais ───────────────────────────────────────────
  static #ID_MODAL_CLIENTE   = 'modal-cadeira-cliente';
  static #ID_MODAL_BARBEIRO  = 'modal-ausente-barbeiro';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o serviço para o usuário logado.
   * @param {string} userId
   * @param {'client'|'professional'} role
   */
  static iniciar(userId, role) {
    if (!userId || !role) return;
    QueueConfirmService.#userId = userId;
    QueueConfirmService.#role   = role;

    if (role === 'client') {
      QueueConfirmService.#iniciarListenerFila(userId);
    } else if (role === 'professional') {
      QueueConfirmService.#iniciarListenerBarbeiro();
    }
  }

  /**
   * Para todos os listeners (logout).
   */
  static parar() {
    if (QueueConfirmService.#canalFila) {
      try {
        SupabaseService.client.removeChannel(QueueConfirmService.#canalFila);
      } catch (_) {}
      QueueConfirmService.#canalFila = null;
    }

    document.removeEventListener(
      'barberflow:notificacao-nova',
      QueueConfirmService.#onNotifNova
    );

    QueueConfirmService.#role       = null;
    QueueConfirmService.#userId     = null;
    QueueConfirmService.#entryAtiva = null;
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENTE — Listener de fila
  // ═══════════════════════════════════════════════════════════

  static #iniciarListenerFila(userId) {
    if (QueueConfirmService.#canalFila) return;

    try {
      const client = SupabaseService.client;
      if (!client) return;

      QueueConfirmService.#canalFila = client
        .channel(`fila-cliente:${userId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'queue_entries',
            filter: `client_id=eq.${userId}`,
          },
          (payload) => QueueConfirmService.#onFilaUpdate(payload.new)
        )
        .subscribe();
    } catch (_) {
      // Realtime indisponível — sem prejuízo ao resto do app
    }
  }

  /**
   * Chamado quando queue_entry do cliente é atualizada.
   * Se mudou para 'in_service' → exibe modal de confirmação.
   */
  static #onFilaUpdate(entry) {
    if (!entry || entry.status !== 'in_service') return;

    // Evita abrir o modal duas vezes para a mesma entrada
    if (
      QueueConfirmService.#entryAtiva &&
      QueueConfirmService.#entryAtiva.id === entry.id
    ) return;

    QueueConfirmService.#entryAtiva = entry;
    QueueConfirmService.#mostrarModalCliente(entry);
  }

  /**
   * Exibe o modal de confirmação de presença para o cliente.
   * @param {object} entry — queue_entry completa
   */
  static async #mostrarModalCliente(entry) {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_CLIENTE);
    if (!modal) return;

    // Busca nome do barbeiro para exibir no modal
    let nomeBarbeiro = 'seu barbeiro';
    try {
      if (entry.professional_id) {
        const { data } = await SupabaseService.client
          .from('profiles')
          .select('full_name')
          .eq('id', entry.professional_id)
          .single();
        if (data?.full_name) nomeBarbeiro = data.full_name;
      }
    } catch (_) {}

    const nomeEl = modal.querySelector('[data-qcs-barbeiro]');
    if (nomeEl) nomeEl.textContent = nomeBarbeiro;

    modal.dataset.entryId        = entry.id        ?? '';
    modal.dataset.professionalId = entry.professional_id ?? '';

    QueueConfirmService.#abrirModal(modal);
  }

  /**
   * Chamado pelo botão "SIM — Já estou sentado" no modal do cliente.
   */
  static clienteConfirmouPresenca() {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_CLIENTE);
    QueueConfirmService.#fecharModal(modal);
    QueueConfirmService.#entryAtiva = null;
  }

  /**
   * Chamado pelo botão "NÃO — Ainda não estou" no modal do cliente.
   * Insere notificação para o barbeiro.
   */
  static async clienteNaoSentado() {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_CLIENTE);
    if (!modal) return;

    const entryId        = modal.dataset.entryId;
    const professionalId = modal.dataset.professionalId;

    QueueConfirmService.#fecharModal(modal);

    if (!professionalId) return;

    // Busca nome do cliente para incluir na notificação
    let nomeCliente = 'Um cliente';
    try {
      if (QueueConfirmService.#userId) {
        const { data } = await SupabaseService.client
          .from('profiles')
          .select('full_name')
          .eq('id', QueueConfirmService.#userId)
          .single();
        if (data?.full_name) nomeCliente = data.full_name;
      }
    } catch (_) {}

    // Insere notificação para o barbeiro
    try {
      await SupabaseService.client
        .from('notifications')
        .insert({
          user_id: professionalId,
          type:    'queue_client_absent',
          title:   '⚠️ Cliente não está na cadeira',
          body:    `${nomeCliente} informou que ainda não está sentado. Deseja pular a vez ou aguardar?`,
          data: {
            tipo_acao:       'queue_client_absent',
            entry_id:        entryId,
            client_id:       QueueConfirmService.#userId,
            client_nome:     nomeCliente,
            tela:            'inicio',
          },
          is_read: false,
        });
    } catch (e) {
      console.warn('[QueueConfirmService] Falha ao notificar barbeiro:', e?.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PROFISSIONAL — Listener de notificações
  // ═══════════════════════════════════════════════════════════

  static #iniciarListenerBarbeiro() {
    document.addEventListener(
      'barberflow:notificacao-nova',
      QueueConfirmService.#onNotifNova
    );
  }

  /**
   * Handler do evento DOM — filtra apenas notificações de ausência de cliente.
   */
  static #onNotifNova = (evt) => {
    const notif = evt?.detail?.notif;
    if (!notif) return;

    const dados = notif.dados ?? notif.data ?? {};
    if (dados.tipo_acao !== 'queue_client_absent') return;

    QueueConfirmService.#tocarSom();
    QueueConfirmService.#mostrarModalBarbeiro(notif, dados);
  };

  /**
   * Exibe o modal de decisão para o barbeiro.
   */
  static #mostrarModalBarbeiro(notif, dados) {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_BARBEIRO);
    if (!modal) return;

    const nomeEl = modal.querySelector('[data-qcs-cliente]');
    if (nomeEl) nomeEl.textContent = dados.client_nome ?? 'O cliente';

    modal.dataset.entryId  = dados.entry_id  ?? '';
    modal.dataset.clientId = dados.client_id ?? '';

    QueueConfirmService.#abrirModal(modal);
  }

  /**
   * Chamado pelo botão "Pular Vez" no modal do barbeiro.
   * Cancela a entrada na fila.
   */
  static async barbeiroQuerPular() {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_BARBEIRO);
    if (!modal) return;

    const entryId = modal.dataset.entryId;
    QueueConfirmService.#fecharModal(modal);

    if (!entryId) return;

    try {
      await SupabaseService.client
        .from('queue_entries')
        .update({ status: 'cancelled', done_at: new Date().toISOString() })
        .eq('id', entryId);

      NotificationService.criar(
        NotificationService.TIPOS.AGENDAMENTO,
        'Vez pulada',
        'A entrada foi cancelada. O próximo da fila pode ser chamado.',
        {}
      );
    } catch (e) {
      console.warn('[QueueConfirmService] Falha ao pular vez:', e?.message);
    }
  }

  /**
   * Chamado pelo botão "Aguardar" no modal do barbeiro.
   * Apenas fecha o modal, mantém status.
   */
  static barbeiroQuerAguardar() {
    const modal = document.getElementById(QueueConfirmService.#ID_MODAL_BARBEIRO);
    QueueConfirmService.#fecharModal(modal);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Som (Web Audio API)
  // ═══════════════════════════════════════════════════════════

  /**
   * Toca um beep duplo de alerta usando Web Audio API.
   * Fallback: tenta reproduzir /shared/audio/alerta.mp3 primeiro.
   */
  static #tocarSom() {
    // Tenta arquivo MP3 primeiro (se existir)
    try {
      const audio = new Audio('/shared/audio/alerta.mp3');
      audio.volume = 0.8;
      const promise = audio.play();
      if (promise && typeof promise.then === 'function') {
        promise.catch(() => QueueConfirmService.#beepSintetico());
      }
      return;
    } catch (_) {}

    QueueConfirmService.#beepSintetico();
  }

  /**
   * Gera dois beeps curtos via Web Audio API (sem arquivo externo).
   */
  static #beepSintetico() {
    try {
      if (!QueueConfirmService.#audioCtx) {
        QueueConfirmService.#audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = QueueConfirmService.#audioCtx;

      // Beep 1
      QueueConfirmService.#oscilador(ctx, 880, 0.00, 0.15);
      // Beep 2
      QueueConfirmService.#oscilador(ctx, 1100, 0.25, 0.15);
    } catch (_) {}
  }

  /**
   * Cria e dispara um oscilador com envelope simples.
   * @param {AudioContext} ctx
   * @param {number} freq — frequência em Hz
   * @param {number} inicioSeg — offset em segundos (currentTime + inicioSeg)
   * @param {number} duracaoSeg
   */
  static #oscilador(ctx, freq, inicioSeg, duracaoSeg) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type            = 'sine';
    osc.frequency.value = freq;

    const t = ctx.currentTime + inicioSeg;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + duracaoSeg);

    osc.start(t);
    osc.stop(t + duracaoSeg + 0.01);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Modal helper
  // ═══════════════════════════════════════════════════════════

  static #abrirModal(modal) {
    if (!modal) return;
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');
    // Força reflow para animação CSS
    void modal.offsetWidth;
    modal.classList.add('qcs-modal--visivel');
  }

  static #fecharModal(modal) {
    if (!modal) return;
    modal.classList.remove('qcs-modal--visivel');
    modal.classList.add('qcs-modal--saindo');
    modal.addEventListener('animationend', () => {
      modal.classList.remove('qcs-modal--saindo');
      modal.setAttribute('hidden', '');
      modal.setAttribute('aria-hidden', 'true');
    }, { once: true });
  }
}
