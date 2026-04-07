'use strict';

/**
 * BarberFlow — App Cliente
 * Extende o Router base de ../../shared/js/Router.js
 */
class BarberFlowCliente extends Router {

  static #TELAS_COM_NAV = new Set([
    'inicio',
    'pesquisa',
    'mensagens',
    'favoritas',
    'perfil',
    'sair',
  ]);

  get telasComNav() {
    return BarberFlowCliente.#TELAS_COM_NAV;
  }

  constructor() {
    super('inicio');
  }
}

/* ── Instância global ───────────────────────────────────────── */
const App = new BarberFlowCliente();
/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[BarberFlow Cliente] SW registrado', reg.scope))
      .catch(err => console.warn('[BarberFlow Cliente] SW erro', err));
  });
}