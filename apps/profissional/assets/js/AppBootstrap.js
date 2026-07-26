'use strict';

// =============================================================
// AppBootstrap.js — App Profissional
//
// Inicializa todos os widgets e o Service Worker com lifecycle
// declarativo e isolamento de erros por widget.
//
// GRUPOS:
//   #WIDGETS_PARALELO   — sem Supabase, disparo simultâneo (rápido)
//   #WIDGETS_SEQUENCIAL — usam Supabase, executam em série para evitar
//                         "AbortError: Lock broken by another request with the steal option"
//                         causado por múltiplas chamadas concorrentes ao SDK do Supabase
//                         (Web Locks API interna do supabase-js v2).
// =============================================================

class AppBootstrap {

  static #initialized = false; // guard: evita dupla inicialização

  // Widgets sem dependência Supabase — disparo paralelo (fire-and-forget)
  static #WIDGETS_PARALELO = [
    { label: 'ProfissionalStartupSplash', fn: () => ProfissionalStartupSplash.init()   },
    { label: 'PWAInstallBanner',      fn: () => {
      PWAInstallBanner.iconSrc = '/shared/img/icon-192-pro.png';
      PWAInstallBanner.nomeApp = 'BarberFlow Pro';
      PWAInstallBanner.init();
    }},
    { label: 'MapPanel',             fn: () => MapPanel.init('section-mapa')            },
    { label: 'FooterScrollManager',  fn: () => FooterScrollManager.init()               },
    { label: 'HeaderScrollBehavior',  fn: () => HeaderScrollBehavior.init()              },
    { label: 'MapWidget',            fn: () => MapWidget.init('mapa-container')         },
    { label: 'GeoService.solicit',   fn: () => GeoService.solicitarNaPrimeiraVez()      },
    { label: 'MapOrientationModule', fn: () => MapOrientationModule.init()              },
    { label: 'MessagesWidget',       fn: () => MessagesWidget.init('msgs-lista', 'profissional')  },
    { label: 'NotificationService',  fn: () => NotificationService.init()                         },
    { label: 'NotifPermissao',       fn: () => NotificationService.solicitarPushPermissao()        },
    { label: 'PushSubscription',     fn: () => AppBootstrap.#iniciarPushSubscription()             },
    { label: 'StoriesWidget.home',   fn: () => StoriesWidget.iniciarHome(document.getElementById('tela-inicio')) },
  ];

  // Widgets que fazem queries Supabase — execução SEQUENCIAL para evitar lock contention
  static #WIDGETS_SEQUENCIAL = [
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')               },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista')   },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista')  },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista')},
    { label: 'NearbyBarbershops.todas', fn: () => NearbyBarbershopsWidget.initHomeTodas('home-todas-lista')        },
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

    // 3. E2EE: registra a chave pública do usuário logado (independe de abrir o chat)
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
   * Registra (ou renova) a Web Push subscription do profissional.
   * Observa mudanças de auth para inicializar no login e revogar no logout.
   * Também escuta mensagens PUSH_NAVIGATE vindas do SW (app aberto)
   * e processa deep-links via URL params (app fechado → openWindow).
   * @private
   */
  static #iniciarPushSubscription() {
    if (!('serviceWorker' in navigator)) return;
    if (typeof PushSoundService !== 'undefined') PushSoundService.preparar();

    // Inicializa imediatamente se já estiver logado
    if (typeof AppState !== 'undefined' && AppState.get('isLogado')) {
      const userId = AppState.getUserId?.();
      if (userId) PushSubscriptionService.init(userId, 'profissional').catch(() => {});
    }

    // Escuta mudanças futuras de auth (login / logout)
    if (typeof AppState !== 'undefined') {
      AppState.onAuth(isLogado => {
        if (isLogado) {
          const userId = AppState.getUserId?.();
          if (userId) PushSubscriptionService.init(userId, 'profissional').catch(() => {});
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
      if (userId) PushSubscriptionService.init(userId, 'profissional').catch(() => {});
    }, { once: true });

    // Ouve mensagens do SW quando o app está aberto.
    navigator.serviceWorker.addEventListener('message', e => {
      // Janela aberta tenta o MP3 customizado e a vibração da página.
      if (e.data?.type === 'BF_PUSH_SOUND') {
        if (typeof PushSoundService !== 'undefined') PushSoundService.alertar(e.data?.vibrate);
        return;
      }

      if (e.data?.type === 'PUSH_NAVIGATE') {
        const { barbershopId, entradaId } = e.data;
        if (!barbershopId) return;
        document.dispatchEvent(
          new CustomEvent('barberflow:push-deep-link', { detail: { barbershopId, entradaId } }),
        );
        return;
      }

      if (e.data?.type === 'PUSH_ACTION') {
        document.dispatchEvent(new CustomEvent('barberflow:push-action', {
          detail: {
            acao:        e.data.acao        ?? null,
            entradaId:   e.data.entradaId   ?? null,
            barbershopId: e.data.barbershopId ?? null,
            pushType:    e.data.pushType    ?? null,
            clienteNome: e.data.clienteNome ?? null,
            statusLabel: e.data.statusLabel ?? null,
            cadeira:     e.data.cadeira     ?? null,
            cliente:     e.data.cliente     ?? null,
          },
        }));
        return;
      }

      if (e.data?.type === 'PUSH_SHOW_MODAL') {
        document.dispatchEvent(new CustomEvent('barberflow:push-show-modal', {
          detail: {
            pushType:    e.data.pushType     ?? null,
            entradaId:   e.data.entradaId    ?? null,
            barbershopId: e.data.barbershopId ?? null,
            clienteNome: e.data.clienteNome  ?? null,
            statusLabel: e.data.statusLabel  ?? null,
            cadeira:     e.data.cadeira      ?? null,
            cliente:     e.data.cliente      ?? null,
          },
        }));
      }
    });

    // Lida com deep-link via URL params quando o app foi aberto pelo SW (app fechado).
    AppBootstrap.#processarPushDeepLink();
  }

  /**
   * Lê parâmetros de push deep-link da URL e dispara o evento de navegação.
   * Usado quando o usuário clica na notificação com o app fechado e o SW abre
   * uma nova janela com query params (ex: ?push_barbershop=X&push_entrada=X).
   * @private
   */
  static #processarPushDeepLink() {
    const params       = new URLSearchParams(location.search);
    const barbershopId = params.get('push_barbershop');
    const entradaId    = params.get('push_entrada');
    const pushAction   = params.get('push_action');
    const pushType     = params.get('push_type');
    const pushEntry    = params.get('push_entry');
    const pushShop     = params.get('push_shop');
    const pushNome     = params.get('push_nome');
    const pushStatus   = params.get('push_status');
    const pushChair    = params.get('push_chair');

    // Botão de ação clicado com app fechado (Android)
    if (pushAction && pushEntry) {
      document.dispatchEvent(new CustomEvent('barberflow:push-action', {
        detail: {
          acao:        pushAction,
          entradaId:   pushEntry,
          barbershopId: pushShop ?? null,
          pushType:    pushType  ?? null,
          clienteNome: pushNome  ? decodeURIComponent(pushNome) : null,
          statusLabel: pushStatus ? decodeURIComponent(pushStatus) : null,
          cadeira:     pushChair  ? decodeURIComponent(pushChair)  : null,
        },
      }));
      return;
    }

    // Toque no corpo da notificação com app fechado (iOS + Android)
    if (pushType && pushEntry) {
      if (typeof Pro !== 'undefined') Pro.nav('minha-barbearia');
      document.dispatchEvent(new CustomEvent('barberflow:push-show-modal', {
        detail: {
          pushType,
          entradaId:   pushEntry,
          barbershopId: pushShop ?? null,
          clienteNome: pushNome  ? decodeURIComponent(pushNome) : null,
          statusLabel: pushStatus ? decodeURIComponent(pushStatus) : null,
          cadeira:     pushChair  ? decodeURIComponent(pushChair)  : null,
        },
      }));
      return;
    }

    // Deep-link de navegação legado (PUSH_NAVIGATE)
    if (!barbershopId) return;
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

  static #registrarSW() {
    if (typeof PwaUpdateManager === 'undefined') return;
    PwaUpdateManager.registrar({
      scriptUrl: './sw.js',
      scope: './',
      nomeApp: 'BarberFlow Profissional',
    });
  }
}
