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

  /** Navega para o login — chamado pelo header avatar quando deslogado. */
  irParaLogin() {
    this.nav('login');
  }

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

  // ── Boot ──────────────────────────────────────────────────

  /**
   * Inicializa todos os widgets e o Service Worker.
   * Chamado uma única vez no DOMContentLoaded.
   */
  static boot() {
    MapPanel.init('section-mapa');
    FooterScrollManager.init();
    MapWidget.init('mapa-container');
    NearbyBarbershopsWidget.init('nearby-map-widget');
    NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista');
    NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista');
    NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista');
    GeoService.solicitarNaPrimeiraVez();
    MapOrientationModule.init();
    MessagesWidget.init('msgs-lista', 'cliente');
    BarberFlowCliente.#registrarSW();
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

/* ── Ponto de entrada ──────────────────────────────────────── */
const App = new BarberFlowCliente();
document.addEventListener('DOMContentLoaded', () => BarberFlowCliente.boot());