'use strict';

// =============================================================
// AppBootstrap.js — App Cliente
//
// Inicializa todos os widgets e o Service Worker com lifecycle
// declarativo e isolamento de erros por widget.
// Extraído do static boot() em BarberFlowCliente.
// =============================================================

class AppBootstrap {

  static #WIDGETS = [
    { label: 'MapPanel',                fn: () => MapPanel.init('section-mapa')                              },
    { label: 'FooterScrollManager',     fn: () => FooterScrollManager.init()                                 },
    { label: 'MapWidget',               fn: () => MapWidget.init('mapa-container')                           },
    { label: 'NearbyBarbershops.init',  fn: () => NearbyBarbershopsWidget.init('nearby-map-widget')          },
    { label: 'NearbyBarbershops.cards', fn: () => NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista') },
    { label: 'NearbyBarbershops.dest',  fn: () => NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista') },
    { label: 'NearbyBarbershops.barbs', fn: () => NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista') },
    { label: 'GeoService.solicit',      fn: () => GeoService.solicitarNaPrimeiraVez()                        },
    { label: 'MapOrientationModule',    fn: () => MapOrientationModule.init()                                },
    { label: 'MessagesWidget',          fn: () => MessagesWidget.init('msgs-lista', 'cliente')               },
  ];

  static init() {
    AppBootstrap.#WIDGETS.forEach(({ label, fn }) => {
      try {
        fn();
      } catch (e) {
        console.warn(`[AppBootstrap] ${label} falhou:`, e?.message);
      }
    });
    AppBootstrap.#registrarSW();
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
