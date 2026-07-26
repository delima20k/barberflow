'use strict';

// =============================================================
// AppBootstrap.js — App Cliente
//
// Inicializa widgets de infraestrutura (mapa, GPS) após
// DOMContentLoaded. As Pages de UI já registraram seus listeners
// em app.js — o Bootstrap cuida apenas de widgets assíncronos
// e do registro do Service Worker.
//
// Estrutura declarativa: cada entrada é isolada — uma falha
// não impede as demais.
//
// GRUPOS:
//   #WIDGETS_PARALELO   — disparo simultâneo (rápido). Alguns chamam Supabase auth
//                         (MessagesWidget, NotificationService, Push, GeoService);
//                         isso é seguro porque SupabaseService.getSession()/getUser()
//                         deduplicam chamadas concorrentes em uma única aquisição de
//                         lock (vide caches de auth em SupabaseService.js).
//   #WIDGETS_SEQUENCIAL — queries Supabase de dados (PostgREST), executam em série
//                         para evitar concorrência pesada no boot.
// =============================================================

class AppBootstrap {

  static #initialized = false; // guard: evita dupla inicialização

  // Widgets sem dependência Supabase — disparo paralelo (fire-and-forget)
  static #WIDGETS_PARALELO = [
    { label: 'ClienteStartupSplash', fn: () => ClienteStartupSplash.init()         },
    { label: 'PWAInstallBanner',     fn: () => {
      PWAInstallBanner.iconSrc = '/shared/img/icon-192-cliente.png';
      PWAInstallBanner.nomeApp = 'BarberFlow';
      PWAInstallBanner.init();
    }},
    { label: 'MapPanel',            fn: () => MapPanel.init('section-mapa')        },
    { label: 'FooterScrollManager', fn: () => FooterScrollManager.init()           },
    { label: 'HeaderScrollBehavior', fn: () => HeaderScrollBehavior.init()          },
    { label: 'MapWidget',           fn: () => MapWidget.init('mapa-container')     },
    { label: 'GeoService.solicit',  fn: () => GeoService.solicitarNaPrimeiraVez() },
    { label: 'MapOrientationModule',fn: () => MapOrientationModule.init()          },
    { label: 'MessagesWidget',      fn: () => MessagesWidget.init('msgs-lista', 'cliente')     },
    { label: 'NotificationService', fn: () => NotificationService.init()                        },
    { label: 'FilaPosicaoNotif',    fn: () => AppBootstrap.#iniciarNotificacoesPosicaoFila()    },
    { label: 'NotifPermissao',      fn: () => NotificationService.solicitarPushPermissao()     },
    { label: 'PushSubscription',    fn: () => AppBootstrap.#iniciarPushSubscription()           },
    { label: 'StoriesWidget.home',  fn: () => StoriesWidget.iniciarHome(document.getElementById('tela-inicio')) },
  ];

  // Widgets que fazem queries Supabase de dados (PostgREST) — execução SEQUENCIAL
  static #WIDGETS_SEQUENCIAL = [
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')               },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista')   },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista')  },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista')},
    { label: 'NearbyBarbershops.todas', fn: () => NearbyBarbershopsWidget.initHomeTodas('home-todas-lista')       },
  ];

  static init() {
    if (AppBootstrap.#initialized) return;
    AppBootstrap.#initialized = true;

    // 1. Widgets sem Supabase: disparo simultâneo (não bloqueiam a UI)
    AppBootstrap.#WIDGETS_PARALELO.forEach(({ label, fn }) => {
      try { fn(); } catch (e) { LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message); }
    });

    // 2. Widgets Supabase: execução sequencial — evita múltiplos locks concorrentes
    AppBootstrap.#_executarSequencial();

    // 3. LGPD: verifica consentimento quando o estado de auth mudar
    AppBootstrap.#iniciarConsentimentoLGPD();

    // 4. E2EE: registra a chave pública do usuário logado (independe de abrir o chat)
    AppBootstrap.#iniciarChavesE2E();

    AppBootstrap.#registrarSW();
  }

  /**
   * Registra a chave pública E2EE assim que o usuário está logado — em qualquer
   * tela, sem precisar abrir o chat. Garante que outros usuários consigam
   * criptografar mensagens para este destinatário mesmo com o chat fechado.
   * @private
   */
  static #iniciarChavesE2E() {
    if (typeof ConversationKeyService === 'undefined') return;

    // Registra imediatamente se já estiver logado na abertura da página
    if (typeof AppState !== 'undefined' && AppState.get('isLogado')) {
      ConversationKeyService.inicializar().catch(() => {});
    }

    // Registra ao logar; limpa o cache ao deslogar
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(isLogado => {
        if (isLogado) {
          ConversationKeyService.inicializar().catch(() => {});
        } else if (typeof ConversationKeyService.limpar === 'function') {
          ConversationKeyService.limpar();
        }
      });
    }
  }

  /**
   * Liga a notificação visual de mudança de posição na fila — uma vez por sessão.
   *
   * Interceptor: converte notificações queue_update (INSERT no banco → Realtime
   * do NotificationService → 'barberflow:notificacao-nova') no evento
   * 'barberflow:fila-posicao-atualizada' consumido pela modal.
   *
   * Presenter global (sem identidade): garante que a modal FluxoDeFila abre com
   * o app em QUALQUER tela (ícone 💈 padrão). Ao abrir a página da barbearia,
   * BarbeariaPage re-chama iniciar(nome, logo) — idempotente, só enriquece.
   * @private
   */
  static #iniciarNotificacoesPosicaoFila() {
    if (typeof QueuePositionNotificationService !== 'undefined') {
      QueuePositionNotificationService.iniciar();
    }
    if (typeof QueuePositionPresenter !== 'undefined') {
      QueuePositionPresenter.iniciar();
    }
  }

  /**
   * Registra (ou renova) a Web Push subscription após o SW estar pronto.
   * Observa mudanças de auth para inicializar no login e revogar no logout.
   * @private
   */
  static #iniciarPushSubscription() {
    if (!('serviceWorker' in navigator)) return;
    if (typeof PushSoundService !== 'undefined') PushSoundService.preparar();

    // Inicializa imediatamente se já estiver logado
    if (typeof AppState !== 'undefined' && AppState.get('isLogado')) {
      const userId = AppState.getUserId?.();
      if (userId) PushSubscriptionService.init(userId, 'cliente').catch(() => {});
    }

    // Escuta mudanças futuras de auth (login / logout)
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(isLogado => {
        if (isLogado) {
          const userId = AppState.getUserId?.();
          if (userId) PushSubscriptionService.init(userId, 'cliente').catch(() => {});
        } else {
          PushSubscriptionService.revogar().catch(() => {});
        }
      });
    }

    // Quando o usuário concede permissão nesta sessão, registra a subscription.
    // Resolve o race condition: init() era chamado antes de requestPermission() completar,
    // saindo cedo porque Notification.permission era 'default'.
    document.addEventListener('bf:push-permission-granted', () => {
      if (typeof AppState === 'undefined' || !AppState.get('isLogado')) return;
      const userId = AppState.getUserId?.();
      if (userId) PushSubscriptionService.init(userId, 'cliente').catch(() => {});
    }, { once: true });

    // Ouve mensagens enviadas pelo SW (app aberto)
    navigator.serviceWorker.addEventListener('message', e => {
      // Janela aberta tenta o MP3 customizado e a vibração da página.
      if (e.data?.type === 'BF_PUSH_SOUND') {
        if (typeof PushSoundService !== 'undefined') PushSoundService.alertar(e.data?.vibrate);
        return;
      }
      if (e.data?.type !== 'PUSH_NAVIGATE') return;
      const { barbershopId, entradaId } = e.data;
      if (!barbershopId) return;
      document.dispatchEvent(
        new CustomEvent('barberflow:push-deep-link', { detail: { barbershopId, entradaId } }),
      );
    });

    // Lida com deep-link via URL params (app fechado → openWindow com ?push_barbershop=X)
    AppBootstrap.#processarPushDeepLink();

    // Deep-link de compartilhamento (?barbearia=<id>) — link enviado via WhatsApp
    // pelo card da página minha-barbearia (rota /b/:id do BFF redireciona p/ cá).
    AppBootstrap.#processarBarbeariaDeepLink();
  }

  // Chave sessionStorage que sobrevive ao location.reload() do controllerchange do SW.
  static #DL_KEY = 'bf_dl_barbearia';

  /**
   * Lê ?barbearia=<id> da URL (ou sessionStorage, para sobreviver ao reload do SW)
   * e abre a página pública da barbearia.
   *
   * Race condition resolvida: o SW chama skipWaiting()+clients.claim() → dispara
   * controllerchange → location.reload() APÓS history.replaceState já ter removido
   * ?barbearia= da URL. Salvamos o ID em sessionStorage antes de limpar a URL;
   * no reload o ID é lido de lá e a chave é removida.
   * @private
   */
  static #processarBarbeariaDeepLink() {
    const params  = new URLSearchParams(location.search);
    const fromUrl = params.get('barbearia');

    // Após reload do SW o param não está mais na URL — busca no sessionStorage.
    const fromStorage = !fromUrl
      ? (sessionStorage.getItem(AppBootstrap.#DL_KEY) ?? null)
      : null;

    const barbershopId = fromUrl ?? fromStorage;
    if (!barbershopId) return;

    if (fromUrl) {
      // Persiste antes de limpar a URL — garante sobrevivência ao reload do SW.
      try { sessionStorage.setItem(AppBootstrap.#DL_KEY, barbershopId); } catch (_) {}

      // Remove o parâmetro mantendo o restante da URL (sem recarregar).
      try {
        params.delete('barbearia');
        const qs = params.toString();
        history.replaceState(history.state ?? null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
      } catch (_) {}
    } else {
      // Lido do sessionStorage (reload do SW): remove a chave para não persistir.
      try { sessionStorage.removeItem(AppBootstrap.#DL_KEY); } catch (_) {}
    }

    document.dispatchEvent(
      new CustomEvent('barberflow:abrir-barbearia', { detail: { barbershopId } }),
    );
  }

  /**
   * Lê parâmetros de push deep-link da URL e dispara o evento de navegação.
   * Usado quando o usuário clica na notificação com o app fechado.
   * @private
   */
  static #processarPushDeepLink() {
    const params       = new URLSearchParams(location.search);
    const barbershopId = params.get('push_barbershop');
    const entradaId    = params.get('push_entrada');
    if (!barbershopId) return;

    // AppBootstrap.init() é chamado de dentro de DOMContentLoaded (app.js).
    // bind() de BarbeariaPage já foi registrado antes — no constructor de BarberFlowCliente
    // instanciado sincronamente antes do DOMContentLoaded.
    // Usar addEventListener('DOMContentLoaded') aqui é noop: o evento já disparou.
    document.dispatchEvent(
      new CustomEvent('barberflow:push-deep-link', { detail: { barbershopId, entradaId } }),
    );
  }

  /**
   * Executa #WIDGETS_SEQUENCIAL um a um, aguardando cada Promise antes de iniciar o próximo.
   * Erros são capturados individualmente — uma falha não impede os demais.
   * @private
   */
  static async #_executarSequencial() {
    for (const { label, fn } of AppBootstrap.#WIDGETS_SEQUENCIAL) {
      try {
        await fn();
      } catch (e) {
        LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message);
      }
    }
  }

  /**
   * Registra listener de auth para exibir o overlay de consentimento LGPD
   * na primeira sessão autenticada.
   * Chamado uma única vez em init().
   * @private
   */
  static #iniciarConsentimentoLGPD() {
    // Verifica estado imediato (usuário já logado na abertura da página)
    if (typeof AppState !== 'undefined' && AppState.get('isLogado')) {
      const userId = AppState.getUserId?.();
      if (userId) AppBootstrap.#verificarEExibirConsentimento(userId);
    }

    // Escuta mudanças futuras (login/logout)
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(async isLogado => {
        if (!isLogado) return;
        const userId = AppState.getUserId?.();
        if (userId) AppBootstrap.#verificarEExibirConsentimento(userId);
      });
    }
  }

  /**
   * Registra o consentimento LGPD silenciosamente ao autenticar.
   * Os termos ficam disponíveis no menu lateral (TermsPage) a qualquer momento.
   * @param {string} userId
   * @private
   */
  static async #verificarEExibirConsentimento(userId) {
    if (typeof LgpdService === 'undefined') return;
    try {
      const consentiu = await LgpdService.verificarConsentimentoCliente(userId);
      if (!consentiu) await LgpdService.registrarConsentimentoCliente(userId);
    } catch (e) {
      LoggerService.warn('[AppBootstrap] Falha ao registrar consentimento LGPD:', e?.message);
    }
  }

  static #registrarSW() {
    if (typeof PwaUpdateManager === 'undefined') return;
    PwaUpdateManager.registrar({
      scriptUrl: './sw.js',
      scope: './',
      nomeApp: 'BarberFlow Cliente',
    });
  }
}
