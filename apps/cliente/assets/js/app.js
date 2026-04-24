'use strict';

// =============================================================
// app.js — App Cliente (BarberFlow)
//
// Extende o Router base e orquestra as Pages por domínio.
// Responsabilidades:
//   - Declarar telasComNav
//   - Instanciar Pages (UI) — cada uma gerencia seu próprio bind
//   - Iniciar listener e sessão de autenticação
//   - NÃO contém lógica de negócio nem queries de dados
//
// Estrutura de camadas:
//   UI   →  pages/  (LoginPage, HomePage, ProfilePage…)
//   Logic→  shared/js/  (AuthService, BarbershopService…)
//   Data →  shared/js/  (BarbershopRepository, ProfileRepository…)
// =============================================================

/**
 * Aplicação cliente do BarberFlow.
 * Orquestra as Pages e delega ao Router toda a navegação SPA.
 */
class BarberFlowCliente extends Router {

  // Telas que exibem o footer completo (usuário logado)
  static #TELAS_COM_NAV = new Set([
    'inicio',
    'pesquisa',
    'mensagens',
    'favoritas',
    'perfil',
    'sair',
    'destaques',
    'barbeiros',
    'barbearias',
    'barbearia',
  ]);

  get telasComNav() { return BarberFlowCliente.#TELAS_COM_NAV; }

  // ── Pages (UI por tela) ──────────────────────────────────
  #loginPage;
  #registerPage;
  #forgotPage;
  #homePage;
  #searchPage;
  #favoritesPage;
  #profilePage;
  #logoutPage;
  #destaquesPage;
  #barbeirosPage;
  #barbeariasPage;
  #barbeariaPage;

  constructor() {
    super('inicio');

    const nav = (tela) => this.nav(tela);

    // Instancia cada Page — bind de eventos sem lógica de negócio
    this.#loginPage    = new LoginPage(nav);
    this.#registerPage = new RegisterPage(nav);
    this.#forgotPage   = new ForgotPasswordPage(nav);
    this.#homePage     = new HomePage();
    this.#searchPage   = new SearchPage();
    this.#favoritesPage = new FavoritesPage();
    this.#profilePage  = new ProfilePage();
    this.#logoutPage   = new LogoutPage();
    this.#destaquesPage  = new DestaquesPage();
    this.#barbeirosPage  = new BarbeirosPage();
    this.#barbeariasPage = new BarbeariasPage();
    this.#barbeariaPage  = new BarbeariaPage();

    // Registra todos os listeners de DOM
    this.#loginPage.bind();
    this.#registerPage.bind();
    this.#forgotPage.bind();
    this.#homePage.bind();
    this.#searchPage.bind();
    this.#favoritesPage.bind();
    this.#profilePage.bind();
    this.#logoutPage.bind();
    this.#destaquesPage.bind();
    this.#barbeirosPage.bind();
    this.#barbeariasPage.bind();
    this.#barbeariaPage.bind();

    // Inicia sessão de autenticação
    AuthService.iniciarListener();
    AuthService.inicializarSessao();
  }

  /** Navega para o login — chamado pelo header avatar quando deslogado. */
  irParaLogin() { this.nav('login'); }
}

/* ── Ponto de entrada ──────────────────────────────────────── */
const App = new BarberFlowCliente();
document.addEventListener('DOMContentLoaded', () => AppBootstrap.init());