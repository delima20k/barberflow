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
  ];

  // Widgets que fazem queries Supabase — execução SEQUENCIAL para evitar lock contention
  static #WIDGETS_SEQUENCIAL = [
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')               },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista')   },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista')  },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista')},
  ];

  static init() {
    // 1. Widgets sem Supabase: disparo simultâneo (não bloqueiam a UI)
    AppBootstrap.#WIDGETS_PARALELO.forEach(({ label, fn }) => {
      try { fn(); } catch (e) { console.warn(`[AppBootstrap] ${label} falhou:`, e?.message); }
    });

    // 2. Widgets Supabase: execução sequencial — evita múltiplos locks concorrentes
    AppBootstrap.#_executarSequencial();

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
        console.warn(`[AppBootstrap] ${label} falhou:`, e?.message);
      }
    }
  }

  static #registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(reg => console.log('[BarberFlow Cliente] SW registrado', reg.scope))
        .catch(err => console.warn('[BarberFlow Cliente] SW erro', err));
    });
  }
}
