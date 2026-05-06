'use strict';

// =============================================================
// QueuePoller.js — Polling periódico da fila + alertas sonoros.
//
// Responsabilidade única: verificar a posição do cliente na fila
// a cada 20 segundos e emitir som (Web Audio API) quando a fila
// avança ou quando é a sua vez.
//
// Dependências (carregadas antes via <script>):
//   - BackendApiService (GET /api/fila/:id/estado)
//   - NotificationService (mostrarToast)
//   - LoggerService
//
// Uso:
//   QueuePoller.iniciar(barbershopId, clientId, onUpdate);
//   QueuePoller.parar();
//   QueuePoller.tocarSom(); // chamado externamente por NotificationService
// =============================================================

class QueuePoller {
  // ── Estado estático ─────────────────────────────────────────────────────

  /** @type {number|null} ID retornado por setInterval */
  static #timer = null;

  /** @type {string|null} Último ultimaMudanca recebido do servidor */
  static #ultimaMudanca = null;

  /** @type {string|null} */
  static #barbershopId = null;

  /** @type {string|null} */
  static #clientId = null;

  /** @type {Function|null} Callback chamado com a fila atualizada */
  static #onUpdate = null;

  /** @type {number|null} Posição anterior do cliente na fila */
  static #posicaoAnterior = null;

  /** @type {boolean} Se o poller está ativo */
  static #ativo = false;

  /** Intervalo de polling em ms */
  static #INTERVALO_MS = 20_000;

  // ── API pública ─────────────────────────────────────────────────────────

  /**
   * Inicia o polling para o barbershop e cliente especificados.
   * Chama imediatamente um primeiro poll, depois a cada 20s.
   * Pausa automaticamente quando a aba fica em background.
   *
   * @param {string}   barbershopId
   * @param {string}   clientId    — UUID do perfil do cliente
   * @param {Function} onUpdate    — chamado com (fila: object[]) quando a fila muda
   */
  static iniciar(barbershopId, clientId, onUpdate) {
    if (!barbershopId || !clientId) return;

    QueuePoller.parar();

    QueuePoller.#barbershopId    = barbershopId;
    QueuePoller.#clientId        = clientId;
    QueuePoller.#onUpdate        = onUpdate ?? null;
    QueuePoller.#ultimaMudanca   = null;
    QueuePoller.#posicaoAnterior = null;
    QueuePoller.#ativo           = true;

    QueuePoller.#poll();
    QueuePoller.#timer = setInterval(() => {
      if (!document.hidden) QueuePoller.#poll();
    }, QueuePoller.#INTERVALO_MS);

    document.removeEventListener('visibilitychange', QueuePoller.#onVisibilidade);
    document.addEventListener('visibilitychange', QueuePoller.#onVisibilidade);
  }

  /**
   * Para o polling e limpa todo estado interno.
   * Seguro chamar mesmo se o poller não estiver ativo.
   */
  static parar() {
    if (QueuePoller.#timer !== null) {
      clearInterval(QueuePoller.#timer);
      QueuePoller.#timer = null;
    }

    document.removeEventListener('visibilitychange', QueuePoller.#onVisibilidade);

    QueuePoller.#barbershopId    = null;
    QueuePoller.#clientId        = null;
    QueuePoller.#onUpdate        = null;
    QueuePoller.#ultimaMudanca   = null;
    QueuePoller.#posicaoAnterior = null;
    QueuePoller.#ativo           = false;
  }

  /**
   * Toca o som de alerta de fila.
   * Chamado externamente por NotificationService quando chega
   * uma notification do tipo 'queue_update' via Realtime.
   */
  static tocarSom() {
    QueuePoller.#tocarSom();
  }

  // ── Lógica interna ───────────────────────────────────────────────────────

  /**
   * Executa um ciclo de polling: chama o backend com `since` para
   * obter a fila apenas quando houver mudanças.
   */
  static async #poll() {
    if (!QueuePoller.#ativo || !QueuePoller.#barbershopId) return;

    try {
      const { data, error } = await BackendApiService.buscarEstadoFila(
        QueuePoller.#barbershopId,
        QueuePoller.#ultimaMudanca,
      );

      if (error) {
        if (error.name !== 'AbortError') {
          LoggerService.warn('[QueuePoller] Erro no poll:', error.message);
        }
        return;
      }

      // Sem mudanças desde o último poll → noop
      if (data?.semMudancas) return;

      const { fila, ultimaMudanca } = data ?? {};
      QueuePoller.#ultimaMudanca = ultimaMudanca ?? QueuePoller.#ultimaMudanca;

      QueuePoller.#detectarMudanca(fila ?? []);

      if (typeof QueuePoller.#onUpdate === 'function') {
        QueuePoller.#onUpdate(fila ?? []);
      }
    } catch (err) {
      LoggerService.warn('[QueuePoller] Exceção inesperada no poll:', err?.message);
    }
  }

  /**
   * Verifica se a posição do cliente melhorou ou se é sua vez.
   * Toca som e exibe toast quando aplicável.
   *
   * @param {object[]} fila — lista de queue_entries com status waiting/in_service
   */
  static #detectarMudanca(fila) {
    if (!QueuePoller.#clientId || !Array.isArray(fila)) return;

    const minha = fila.find(
      (e) => (e.client_id ?? e.user_id) === QueuePoller.#clientId,
    );

    if (!minha) return;

    // Rank dinâmico: posição do cliente na fila ativa ordenada por position.
    // Inclui entradas in_service + waiting para que a saída de um
    // in_service (done) reduza o rank de quem está esperando.
    const filaAtiva = fila
      .filter((e) => e.status === 'waiting' || e.status === 'in_service')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const idxAtivo = filaAtiva.findIndex(
      (e) => (e.client_id ?? e.user_id) === QueuePoller.#clientId,
    );
    const posicaoAtual = idxAtivo >= 0 ? idxAtivo + 1 : null;
    const posAnterior  = QueuePoller.#posicaoAnterior;

    const avancou = posAnterior !== null
      && posicaoAtual !== null
      && posicaoAtual < posAnterior;

    const ehSuaVez = minha.status === 'in_service';

    if (avancou || ehSuaVez) {
      QueuePoller.#tocarSom();

      if (typeof NotificationService !== 'undefined') {
        const tipo = NotificationService.TIPOS?.SISTEMA ?? 'sistema';
        if (ehSuaVez) {
          // Delega confirmação de presença ao CadeiraConfirmacaoService (se disponível).
          // Ele exibe o modal interativo e gerencia o grace period de 5 min.
          // O toast abaixo serve apenas como fallback visual caso o modal não abra.
          if (typeof CadeiraConfirmacaoService !== 'undefined') {
            const nomeCliente = minha.client?.full_name ?? minha.guest_name ?? '';
            CadeiraConfirmacaoService.iniciarFluxo(minha.id, nomeCliente).catch(() => {});
          }
          NotificationService.mostrarToast('É a sua vez!', 'O barbeiro está pronto para atendê-lo.', tipo);
        } else if (avancou) {
          const rankWaiting = fila
            .filter((e) => e.status === 'waiting')
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .findIndex((e) => (e.client_id ?? e.user_id) === QueuePoller.#clientId);

          const posDisplay = rankWaiting >= 0 ? rankWaiting + 1 : posicaoAtual;
          NotificationService.mostrarToast(
            'Fila avançou',
            `Você está na posição ${posDisplay} da fila.`,
            tipo,
          );
        }
      }
    }

    QueuePoller.#posicaoAnterior = posicaoAtual;
  }

  /**
   * Emite dois tons curtos usando Web Audio API.
   * Compatível com Chrome, Firefox, Safari (webkit prefix).
   * Não lança exceção — falhas são silenciosas.
   */
  static #tocarSom() {
    let ctx = null;
    try {
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtx) return;

      ctx = new AudioCtx();

      const tocar = (frequencia, inicio, duracao) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();

        osc.connect(env);
        env.connect(ctx.destination);

        osc.type            = 'sine';
        osc.frequency.value = frequencia;

        env.gain.setValueAtTime(0.35, ctx.currentTime + inicio);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);

        osc.start(ctx.currentTime + inicio);
        osc.stop(ctx.currentTime + inicio + duracao + 0.05);
      };

      tocar(440, 0,    0.10); // Lá — 100 ms
      tocar(880, 0.12, 0.08); // Lá (oitava acima) — 80 ms com 120 ms de delay

      // Fecha o contexto após os tons terminarem
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch {
      // Web Audio não disponível ou bloqueado pelo navegador — fecha contexto se aberto
      ctx?.close().catch(() => {});
    }
  }

  /**
   * Handler do evento visibilitychange.
   * Pausa quando a aba fica oculta; retoma (com poll imediato) quando volta.
   */
  static #onVisibilidade() {
    if (!QueuePoller.#ativo) return;

    if (document.hidden) {
      if (QueuePoller.#timer !== null) {
        clearInterval(QueuePoller.#timer);
        QueuePoller.#timer = null;
      }
    } else {
      // Aba voltou ao foco: poll imediato + reinicia intervalo
      QueuePoller.#poll();
      QueuePoller.#timer = setInterval(() => {
        if (!document.hidden) QueuePoller.#poll();
      }, QueuePoller.#INTERVALO_MS);
    }
  }
}
