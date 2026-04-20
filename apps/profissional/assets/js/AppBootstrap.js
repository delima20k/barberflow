'use strict';

// =============================================================
// AppBootstrap.js — App Profissional
//
// Inicializa todos os widgets e o Service Worker com lifecycle
// declarativo e isolamento de erros por widget.
// Extraído do static boot() em BarberFlowProfissional.
// =============================================================

class AppBootstrap {

  static #WIDGETS = [
    { label: 'ProLandingGate',          fn: () => ProLandingGate.init()                                      },
    { label: 'MapPanel',                fn: () => MapPanel.init('section-mapa')                              },
    { label: 'FooterScrollManager',     fn: () => FooterScrollManager.init()                                 },
    { label: 'MapWidget',               fn: () => MapWidget.init('mapa-container')                           },
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')          },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista') },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista') },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista') },
    { label: 'NearbyBarbershops.todas', fn: () => NearbyBarbershopsWidget.initHomeTodas('home-todas-lista')        },
    { label: 'GeoService.solicit',      fn: () => GeoService.solicitarNaPrimeiraVez()                        },
    { label: 'MapOrientationModule',    fn: () => MapOrientationModule.init()                                },
    { label: 'MessagesWidget',          fn: () => MessagesWidget.init('msgs-lista', 'profissional')          },
  ];

  static init() {
    AppBootstrap.#WIDGETS.forEach(({ label, fn }) => {
      try {
        fn();
      } catch (e) {
        LoggerService.warn(`[AppBootstrap] ${label} falhou:`, e?.message);
      }
    });
    AppBootstrap.#registrarSW();
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
          LoggerService.info('[BarberFlow Pro] SW registrado', reg.scope);
          reg.update();
        })
        .catch(err => LoggerService.warn('[BarberFlow Pro] SW erro', err));
    });
  }
}
