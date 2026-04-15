'use strict';

/**
 * FooterScrollManager
 * Gerencia a visibilidade do footer baseado no scroll da tela início.
 * - Oculta o footer quando o usuário rola > 30% da viewport
 * - Exibe o botão flutuante pingo d'água para reabrir
 * - Cooldown de 3s após reabrir manualmente para evitar re-ocultamento imediato
 */
class FooterScrollManager {

  static #THRESHOLD_PC = 0.30;   // 30% da viewport
  static #COOLDOWN_MS  = 3000;   // ms de cooldown após abertura manual

  static #tela    = null;
  static #footers = [];
  static #btn     = null;
  static #oculto  = false;
  static #cooldown = false;
  static #timer   = null;

  static init() {
    this.#tela    = document.getElementById('tela-inicio');
    this.#footers = ['footer-nav', 'footer-nav-offline']
                      .map(id => document.getElementById(id))
                      .filter(Boolean);
    this.#btn     = document.getElementById('btn-abrir-footer');

    if (!this.#tela) return;

    this.#tela.addEventListener('scroll', () => this.#avaliar(), { passive: true });
  }

  /* Avalia posição de scroll e decide estado do footer */
  static #avaliar() {
    if (this.#cooldown) return;
    const limiar = window.innerHeight * this.#THRESHOLD_PC;
    if (this.#tela.scrollTop > limiar && !this.#oculto) {
      this.#ocultar();
    } else if (this.#tela.scrollTop <= limiar && this.#oculto) {
      this.#exibir();
    }
  }

  static #ocultar() {
    this.#oculto = true;
    this.#footers.forEach(f => f.classList.add('oculto'));
    this.#btn?.classList.add('visivel');
  }

  static #exibir() {
    this.#oculto = false;
    this.#footers.forEach(f => f.classList.remove('oculto'));
    this.#btn?.classList.remove('visivel');
  }

  /* Chamado pelo botão flutuante — reabre o footer com cooldown */
  static abrirPorBotao() {
    this.#exibir();
    this.#cooldown = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#cooldown = false; }, this.#COOLDOWN_MS);
  }
}

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
  MapPanel.init('section-mapa');
}

/* ── Inicializa widgets de geolocalização ───────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initMapToggle();
  // Footer inteligente: oculta ao rolar 30% da viewport na home
  FooterScrollManager.init();
  // Mapa interativo Leaflet com FAB flutuante
  MapWidget.init('mapa-container');
  // Lista de barbearias próximas (abaixo do mapa)
  NearbyBarbershopsWidget.init('nearby-map-widget');
  // Cards de barbearias na home (dinâmico, sem GPS obrigatório)
  NearbyBarbershopsWidget.initHomeCards('home-barbearias-lista');
  // Cards em destaque (scroll horizontal)
  NearbyBarbershopsWidget.initHomeDestaque('home-destaque-lista');
  // Cards de barbeiros populares na home
  NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista');
  // Solicita GPS silenciosamente na primeira abertura
  GeoService.solicitarNaPrimeiraVez();
  // Bússola e orientação do mapa
  MapOrientationModule.init();
});

/* ── Service Worker (PWA / TWA) ──────────────────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('[BarberFlow Cliente] SW registrado', reg.scope))
      .catch(err => console.warn('[BarberFlow Cliente] SW erro', err));
  });
}