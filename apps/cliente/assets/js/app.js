'use strict';

/**
 * BarberFlow — App Cliente
 * Extende o Router base de ../../shared/js/Router.js
 *
 * Responsabilidades desta classe:
 *   - Declarar telasComNav
 *   - Instanciar AuthController (binding de auth sem onsubmit no HTML)
 *   - Métodos de navegação chamados pelo HTML (nav/push/voltar vêm do Router)
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

  get telasComNav() { return BarberFlowCliente.#TELAS_COM_NAV; }

  #auth;

  constructor() {
    super('inicio');
    this.#auth = new AuthController((tela) => this.nav(tela), 'client');
    this.#auth.bind();
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
  }

  /** Navega para o login — chamado pelo header avatar quando deslogado. */
  irParaLogin() { this.nav('login'); }
}

/* ── Ponto de entrada ──────────────────────────────────────── */
const App = new BarberFlowCliente();
document.addEventListener('DOMContentLoaded', () => AppBootstrap.init());