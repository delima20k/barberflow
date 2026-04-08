'use strict';

/**
 * BarberFlow — App Profissional
 * Extende o Router base de ../../shared/js/Router.js
 */
class BarberFlowProfissional extends Router {

  static #TELAS_COM_NAV = new Set([
    'inicio',
    'pesquisa',
    'agenda',
    'mensagens',
    'minha-barbearia',
    'perfil',
    'sair',
  ]);

  static #TELAS_OFFLINE = new Set(['inicio', 'pesquisa']);

  get telasComNav()  { return BarberFlowProfissional.#TELAS_COM_NAV; }
  get telasOffline() { return BarberFlowProfissional.#TELAS_OFFLINE; }

  constructor() {
    super('inicio');
  }
}

/* ── Instância global ───────────────────────────────────────── */
const Pro = new BarberFlowProfissional();
/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[BarberFlow Pro] SW registrado', reg.scope))
      .catch(err => console.warn('[BarberFlow Pro] SW erro', err));
  });
}