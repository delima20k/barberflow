'use strict';

// =============================================================
// QueuePoller.js — Polling periódico da fila + alertas visuais.
//
// Responsabilidade única: verificar a posição do cliente na fila
// a cada 20 segundos e emitir alertas visuais quando a fila avança
// ou quando é a sua vez.
//
// Dependências (carregadas antes via <script>):
//   - BackendApiService (GET /api/fila/:id/estado)
//   - NotificationService (mostrarToast)
//   - LoggerService
//
// Uso:
//   QueuePoller.iniciar(barbershopId, clientId, onUpdate);
//   QueuePoller.parar();
//   QueuePoller.tocarSom(); // compatibilidade: silencioso por padrão
// =============================================================

class QueuePoller {
  // ── Estado estático ─────────────────────────────────────────────────────

  /** @type {number|null} ID retornado por setInterval */
  static #timer = null;

  /** @type {string|null} @deprecated não usado após migração para QueueRepository */
  static #ultimaMudanca = null;

  /** @type {string|null} */
  static #barbershopId = null;

  /** @type {string|null} */
  static #clientId = null;

  /** @type {Function|null} Callback chamado com a fila atualizada */
  static #onUpdate = null;

  /** @type {number|null} Posição anterior do cliente na fila */
  static #posicaoAnterior = null;

  /** @type {string|null} Status anterior do cliente — evita re-notificar
   *  "é a sua vez" a cada poll enquanto o cliente segue in_service. */
  static #statusAnterior = null;

  /** @type {boolean} Se o poller está ativo */
  static #ativo = false;

  /** Intervalo de polling em ms */
  static #INTERVALO_MS = 20_000;

  /** Som de fila desativado por padrão: alertas continuam visuais/nativos com vibração. */
  static #SOM_HABILITADO = false;

  /**
   * Elemento <audio> reutilizável para o chime MP3.
   * Desbloqueado no primeiro gesto do usuário para garantir playback
   * em iOS/Android mesmo sem gesto no momento da notificação.
   * @type {HTMLAudioElement|null}
   */
  static #audioEl = null;

  // Desbloqueia áudio no primeiro toque/clique do usuário.
  // iOS e Android só permitem play() automático se o elemento
  // foi "ativado" durante um gesto. O truque: criar, tocar (volume 0)
  // e pausar imediatamente — depois o play() sem gesto funciona.
  static {
    const desbloquear = () => {
      if (!QueuePoller.#SOM_HABILITADO) return;
      if (QueuePoller.#audioEl) return;
      try {
        const el = new Audio('/shared/sounds/chime.mp3');
        el.preload = 'auto';
        el.volume  = 0;
        el.play()
          .then(() => { el.pause(); el.currentTime = 0; el.volume = 1; })
          .catch(() => { el.volume = 1; });
        QueuePoller.#audioEl = el;
      } catch { /* sem suporte — silencioso */ }
    };
    if (QueuePoller.#SOM_HABILITADO && typeof document !== 'undefined') {
      document.addEventListener('touchstart', desbloquear, { once: true, passive: true });
      document.addEventListener('click',      desbloquear, { once: true });
    }
  }

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

    const mesmaFilaAtiva = QueuePoller.#ativo
      && QueuePoller.#barbershopId === barbershopId
      && QueuePoller.#clientId === clientId;

    if (mesmaFilaAtiva) {
      QueuePoller.#onUpdate = onUpdate ?? QueuePoller.#onUpdate;
      if (QueuePoller.#timer === null) {
        QueuePoller.#timer = setInterval(() => QueuePoller.#poll(), QueuePoller.#INTERVALO_MS);
      }
      document.removeEventListener('visibilitychange', QueuePoller.#onVisibilidade);
      document.addEventListener('visibilitychange', QueuePoller.#onVisibilidade);
      return;
    }

    QueuePoller.parar();

    QueuePoller.#barbershopId    = barbershopId;
    QueuePoller.#clientId        = clientId;
    QueuePoller.#onUpdate        = onUpdate ?? null;
    QueuePoller.#ultimaMudanca   = null;
    QueuePoller.#posicaoAnterior = null;
    QueuePoller.#statusAnterior  = null;
    QueuePoller.#ativo           = true;

    QueuePoller.#poll();
    QueuePoller.#timer = setInterval(() => QueuePoller.#poll(), QueuePoller.#INTERVALO_MS);

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
    QueuePoller.#statusAnterior  = null;
    QueuePoller.#ativo           = false;
  }

  /**
   * Toca o som de alerta de fila.
   * Chamado externamente por NotificationService quando chega
   * uma notification do tipo 'queue_update' via Realtime.
   */
  static tocarSom() {
    if (!QueuePoller.#SOM_HABILITADO) return;
    QueuePoller.#tocarSom();
  }

  // ── Lógica interna ───────────────────────────────────────────────────────

  /**
   * Executa um ciclo de polling: busca a fila ativa diretamente via
   * QueueRepository (Supabase) — sem depender do backend do app profissional.
   */
  static async #poll() {
    if (!QueuePoller.#ativo || !QueuePoller.#barbershopId) return;

    try {
      const fila = await QueueRepository.getByBarbershop(QueuePoller.#barbershopId);

      await QueuePoller.#detectarMudanca(fila);

      if (typeof QueuePoller.#onUpdate === 'function') {
        QueuePoller.#onUpdate(fila);
      }
    } catch (err) {
      LoggerService.warn('[QueuePoller] Exceção inesperada no poll:', err?.message);
    }
  }

  /**
   * Resolve a URL do logo da barbearia ativa.
   * Ordem de prioridade:
   *   1. Cache em memória (CacheManager) — sem rede
   *   2. Fetch via BarbershopRepository.getById — persiste no cache para uso futuro
   *   3. null — silencioso, modal exibe fallback emoji
   *
   * @returns {Promise<string|null>}
   */
  static async #resolverShopLogoUrl() {
    const shopId = QueuePoller.#barbershopId;
    if (!shopId) return null;

    // 1. Cache hit
    if (typeof CacheManager !== 'undefined') {
      const cached = CacheManager.get(`${shopId}:shop`);
      if (cached?.logo_path) return ApiService.getLogoUrl(cached.logo_path);
    }

    // 2. Fetch e popula o cache
    try {
      if (typeof BarbershopRepository !== 'undefined') {
        const shop = await BarbershopRepository.getById(shopId);
        if (shop?.logo_path) {
          if (typeof CacheManager !== 'undefined') {
            CacheManager.set(`${shopId}:shop`, shop, 5 * 60 * 1000);
          }
          return ApiService.getLogoUrl(shop.logo_path);
        }
      }
    } catch { /* rede indisponível — exibe fallback emoji */ }

    return null;
  }

  /**
   * Verifica se a posição do cliente melhorou ou se é sua vez.
   * Toca som e exibe toast quando aplicável.
   *
   * @param {object[]} fila — lista de queue_entries com status waiting/in_service
   */
  static async #detectarMudanca(fila) {
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
    // Só dispara "é a sua vez" na TRANSIÇÃO para in_service. Sem isso, o poll
    // (a cada 20s) re-dispararia toast + notificação nativa sem parar enquanto
    // o cliente continua sentado na cadeira de produção durante o corte.
    const virouSuaVez = ehSuaVez && QueuePoller.#statusAnterior !== 'in_service';

    if (avancou || virouSuaVez) {
      if (typeof NotificationService !== 'undefined') {
        const tipo = NotificationService.TIPOS?.SISTEMA ?? 'sistema';
        if (virouSuaVez) {
          // Delega confirmação de presença ao CadeiraConfirmacaoService (se disponível).
          // Ele exibe o modal interativo e gerencia o grace period de 5 min.
          // O toast abaixo serve apenas como fallback visual caso o modal não abra.
          if (typeof CadeiraConfirmacaoService !== 'undefined') {
            const nomeCliente = minha.client?.full_name ?? minha.guest_name ?? '';
            const shopLogoUrl = await QueuePoller.#resolverShopLogoUrl();
            CadeiraConfirmacaoService.iniciarFluxo(minha.id, nomeCliente, shopLogoUrl).catch(() => {});
            if (document.hidden) {
              // App em segundo plano: notificação nativa + persiste estado para tocar som ao retornar
              QueuePoller.#notificarNativo(nomeCliente);
              try {
                sessionStorage.setItem('bf_sua_vez', JSON.stringify({ ts: Date.now() }));
              } catch { /* storage indisponível */ }
            }
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

    QueuePoller.#statusAnterior  = minha.status;
    QueuePoller.#posicaoAnterior = posicaoAtual;
  }

  /**
   * Toca o chime MP3 reutilizando um único elemento <audio>.
   * Reposiciona currentTime para permitir reprodução imediata mesmo
   * se o som anterior ainda não terminou.
   * Silencioso em caso de bloqueio — navegador decide se permite.
   */
  static #tocarSom() {
    if (!QueuePoller.#SOM_HABILITADO) return;
    try {
      if (!QueuePoller.#audioEl) {
        QueuePoller.#audioEl = new Audio('/shared/sounds/chime.mp3');
        QueuePoller.#audioEl.preload = 'auto';
      }
      QueuePoller.#audioEl.currentTime = 0;
      QueuePoller.#audioEl.play().catch(() => {});
    } catch {
      // Silencioso
    }
  }

  /**
   * Handler do evento visibilitychange.
   * Ao retornar ao foco: toca som de "sua vez" se detectado em background
   * e faz um poll imediato para atualizar a UI.
   */
  static #onVisibilidade() {
    if (!QueuePoller.#ativo) return;

    if (!document.hidden) {
      // Aba voltou ao foco: toca som se havia "sua vez" pendente + poll imediato
      QueuePoller.#verificarRetorno();
      QueuePoller.#poll();
    }
  }

  /**
   * Exibe notificação nativa do SO quando o app está em segundo plano.
   * Requer permissão já concedida pelo usuário (via NotificationService.confirmarPush).
   * @param {string} nomeCliente
   */
  static #notificarNativo(nomeCliente) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      new Notification('É a sua vez! 💈', {
        body: `${nomeCliente || 'Você'} — seu barbeiro está pronto!`,
        icon: '/shared/img/icon-192-cliente.png',
        tag: 'barberflow-sua-vez',
        renotify: true,
      });
    } catch { /* silencioso — sem suporte ou permissão negada */ }
  }

  /**
   * Ao retornar ao foco, toca o chime se havia "sua vez" detectada enquanto
   * o app estava em segundo plano (estado persistido via sessionStorage).
   */
  static #verificarRetorno() {
    try {
      const raw = sessionStorage.getItem('bf_sua_vez');
      if (!raw) return;
      const { ts } = JSON.parse(raw);
      sessionStorage.removeItem('bf_sua_vez');
      if (Date.now() - ts > 10 * 60 * 1000) return; // expirou (>10 min)
      QueuePoller.#tocarSom();
    } catch { /* silencioso */ }
  }
}
