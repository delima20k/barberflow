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

  // Widgets sem dependência Supabase — disparo paralelo (fire-and-forget)
  static #WIDGETS_PARALELO = [
    { label: 'ProLandingGate',       fn: () => ProLandingGate.init()                   },
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
    { label: 'MessagesWidget',       fn: () => MessagesWidget.init('msgs-lista', 'profissional') },
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
    // 1. Widgets sem Supabase: disparo simultâneo (não bloqueiam a UI)
    AppBootstrap.#WIDGETS_PARALELO.forEach(({ label, fn }) => {
      try { fn(); } catch (e) { LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message); }
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
        LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message);
      }
    }
  }

  static #registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    // Limpa flag do ciclo anterior — garante que cada nova atualização de SW
    // possa forçar o reload. O flag só precisa existir durante o ciclo de reload.
    sessionStorage.removeItem('sw_reloaded');

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
          // Se já há um SW instalado aguardando, força imediatamente
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Detecta novo SW que chega após o carregamento da página
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                // Novo SW instalado e pronto — força ativação imediata
                sw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });

          reg.update();
          LoggerService.info('[BarberFlow Pro] SW registrado', reg.scope);
        })
        .catch(err => LoggerService.warn('[BarberFlow Pro] SW erro', err));
    });
  }
}
