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
//   #WIDGETS_PARALELO   — sem Supabase, disparo simultâneo (rápido)
//   #WIDGETS_SEQUENCIAL — usam Supabase, executam em série para evitar
//                         "AbortError: Lock broken by another request with the steal option"
//                         causado por múltiplas chamadas concorrentes ao SDK do Supabase
//                         (Web Locks API interna do supabase-js v2).
// =============================================================

class AppBootstrap {

  // Widgets sem dependência Supabase — disparo paralelo (fire-and-forget)
  static #WIDGETS_PARALELO = [
    { label: 'MapPanel',            fn: () => MapPanel.init('section-mapa')        },
    { label: 'FooterScrollManager', fn: () => FooterScrollManager.init()           },
    { label: 'MapWidget',           fn: () => MapWidget.init('mapa-container')     },
    { label: 'GeoService.solicit',  fn: () => GeoService.solicitarNaPrimeiraVez() },
    { label: 'MapOrientationModule',fn: () => MapOrientationModule.init()          },
    { label: 'MessagesWidget',      fn: () => MessagesWidget.init('msgs-lista', 'cliente') },
  ];

  // Widgets que fazem queries Supabase — execução SEQUENCIAL para evitar lock contention
  static #WIDGETS_SEQUENCIAL = [
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')               },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista')   },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista')  },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista')},
    { label: 'NearbyBarbershops.todas', fn: () => NearbyBarbershopsWidget.initHomeTodas('home-todas-lista')       },
  ];

  static init() {
    // 1. Widgets sem Supabase: disparo simultâneo (não bloqueiam a UI)
    AppBootstrap.#WIDGETS_PARALELO.forEach(({ label, fn }) => {
      try { fn(); } catch (e) { LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message); }
    });

    // 2. Widgets Supabase: execução sequencial — evita múltiplos locks concorrentes
    AppBootstrap.#_executarSequencial();

    // 3. LGPD: verifica consentimento quando o estado de auth mudar
    AppBootstrap.#iniciarConsentimentoLGPD();

    AppBootstrap.#registrarSW();
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
   * Verifica consentimento e exibe o overlay se ainda não houver.
   * @param {string} userId
   * @private
   */
  static async #verificarEExibirConsentimento(userId) {
    if (typeof LgpdService === 'undefined') return;
    try {
      const consentiu = await LgpdService.verificarConsentimentoCliente(userId);
      if (!consentiu) AppBootstrap.#mostrarOverlayConsentimento(userId);
    } catch (e) {
      LoggerService.warn('[AppBootstrap] Falha ao verificar consentimento LGPD:', e?.message);
    }
  }

  /**
   * Exibe o overlay de consentimento e vincula os botões de aceitar/recusar.
   * @param {string} userId
   * @private
   */
  static #mostrarOverlayConsentimento(userId) {
    const overlay = document.getElementById('lgpd-consent-overlay');
    if (!overlay) return;

    overlay.removeAttribute('hidden');

    document.getElementById('lgpd-aceitar-btn')?.addEventListener('click', async () => {
      const result = await LgpdService.registrarConsentimentoCliente(userId);
      if (result.ok) overlay.setAttribute('hidden', '');
    }, { once: true });

    document.getElementById('lgpd-recusar-btn')?.addEventListener('click', () => {
      // Não aceitou — encerra a sessão e recarrega a página
      AuthService.logout()
        .catch(() => {})
        .finally(() => location.reload());
    }, { once: true });
  }

  static #registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    // Recarrega automaticamente quando um novo SW assumir o controle
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!sessionStorage.getItem('sw_reloaded')) {
        sessionStorage.setItem('sw_reloaded', '1');
        location.reload();
      }
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(reg => {
          LoggerService.info('[BarberFlow Cliente] SW registrado', reg.scope);
          reg.update();
        })
        .catch(err => LoggerService.warn('[BarberFlow Cliente] SW erro', err));
    });
  }
}
