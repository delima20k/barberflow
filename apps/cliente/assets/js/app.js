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
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
  }

  // ── Auth ──────────────────────────────────────────────────

  fazerLogin() {
    AuthService.login(
      document.getElementById('login-email'),
      document.getElementById('login-senha'),
      document.getElementById('login-erro'),
      (tela) => this.nav(tela)
    );
  }

  fazerCadastro() {
    AuthService.cadastro({
      nome:     document.getElementById('cad-nome')?.value,
      email:    document.getElementById('cad-email')?.value,
      telefone: document.getElementById('cad-tel')?.value,
      senha:    document.getElementById('cad-senha')?.value,
      senha2:   document.getElementById('cad-senha2')?.value,
      role:     'client',
    }, document.getElementById('cad-erro'), (tela) => this.nav(tela));
  }

  fazerRecuperacao() {
    AuthService.recuperarSenha(
      document.getElementById('rec-email')?.value,
      document.getElementById('rec-erro'),
      (tela) => this.nav(tela)
    );
  }
}

/* ── Instância global ───────────────────────────────────────── */
const App = new BarberFlowCliente();

function initMapToggle() {
  const section = document.getElementById('section-mapa');
  if (!section) return;

  const btn = section.querySelector('[data-map-toggle-btn]');
  const panel = section.querySelector('[data-map-toggle-panel]');
  if (!btn || !panel) return;

  const setExpanded = (expanded) => {
    section.classList.toggle('mapa-fechado', !expanded);
    panel.hidden = !expanded;
    btn.setAttribute('aria-expanded', String(expanded));
    btn.textContent = expanded ? 'Fechar mapa' : 'Abrir mapa';

    if (expanded) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 260);
    }
  };

  setExpanded(true);

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });
}

/* ── Inicializa widgets de geolocalização ───────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMapToggle();
  // Mapa interativo Leaflet com FAB flutuante
  MapWidget.init('mapa-container');
  // Lista de barbearias próximas (abaixo do mapa)
  NearbyBarbershopsWidget.init('nearby-map-widget');
  // Solicita GPS silenciosamente na primeira abertura
  GeoService.solicitarNaPrimeiraVez();
});

/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[BarberFlow Cliente] SW registrado', reg.scope))
      .catch(err => console.warn('[BarberFlow Cliente] SW erro', err));
  });
}