'use strict';

/**
 * FooterScrollManager
 * Gerencia visibilidade do footer e exibe dica animada (gota) quando oculto.
 *
 * Ciclo da dica:
 *  - Ativa somente quando footer está oculto
 *  - Aparece a cada 3s, por 3x máx por sessão de home
 *  - Reinicia o contador ao navegar para outra tela e voltar ao início
 */
class FooterScrollManager {

  static #THRESHOLD_PC   = 0.30;  // 30% da viewport para ocultar footer
  static #COOLDOWN_MS    = 3000;  // cooldown após abrir pelo botão
  static #DICA_INTERVALO = 3000;  // espera entre dicas
  static #DICA_DURACAO   = 2500;  // quanto tempo cada dica fica visível
  static #DICA_MAX       = 3;     // máximo de dicas por entrada na home

  static #footers    = [];
  static #btn        = null;
  static #dicaEl     = null;
  static #oculto     = false;
  static #cooldown   = false;
  static #timer      = null;
  static #dicaCount  = 0;
  static #timerDica  = null;

  static init() {
    this.#footers = ['footer-nav', 'footer-nav-offline']
                      .map(id => document.getElementById(id))
                      .filter(Boolean);
    this.#btn    = document.getElementById('btn-abrir-footer');
    this.#dicaEl = document.getElementById('footer-dica');

    // Escuta scroll em TODAS as telas — ignora inativas via #ehTelaAtiva
    document.querySelectorAll('.tela').forEach(tela => {
      tela.addEventListener('scroll', () => this.#avaliar(tela), { passive: true });
    });

    // MutationObserver: quando o Router troca .ativa, reavalia o footer imediatamente
    document.querySelectorAll('.tela').forEach(tela => {
      new MutationObserver(() => this.#aoMudarTela())
        .observe(tela, { attributes: true, attributeFilter: ['class'] });
    });

    // Reinicia contador da dica ao clicar em "início" no footer
    document.querySelectorAll('.nav-btn[data-tela="inicio"]').forEach(btn => {
      btn.addEventListener('click', () => this.#resetarDica());
    });
  }

  /** Tela que está no topo agora: .tela.ativa se existir, senão tela-inicio */
  static #ehTelaAtiva(tela) {
    const ativa = document.querySelector('.tela.ativa');
    return ativa ? ativa === tela : tela.id === 'tela-inicio';
  }

  /** Chamado pelo MutationObserver ao mudar classe em qualquer .tela */
  static #aoMudarTela() {
    const ativa    = document.querySelector('.tela.ativa');
    const telaTopo = ativa ?? document.getElementById('tela-inicio');
    if (!telaTopo) return;
    this.#avaliar(telaTopo);
    // Voltou para o início → reseta ciclo de dica
    if (!ativa) this.#resetarDica();
  }

  /* Avalia scroll e decide estado do footer — ignora telas inativas */
  static #avaliar(tela) {
    if (!this.#ehTelaAtiva(tela)) return;
    if (this.#cooldown) return;
    const limiar = window.innerHeight * this.#THRESHOLD_PC;
    if (tela.scrollTop > limiar && !this.#oculto) {
      this.#ocultar();
    } else if (tela.scrollTop <= limiar && this.#oculto) {
      this.#exibir();
    }
  }

  static #ocultar() {
    this.#oculto = true;
    this.#footers.forEach(f => f.classList.add('oculto'));
    this.#btn?.classList.add('visivel');
    this.#agendarDica();
  }

  static #exibir() {
    this.#oculto = false;
    this.#footers.forEach(f => f.classList.remove('oculto'));
    this.#btn?.classList.remove('visivel');
    this.#pararDica();
  }

  /* Botão gota: reabre footer com cooldown */
  static abrirPorBotao() {
    this.#exibir();
    this.#cooldown = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.#cooldown = false; }, this.#COOLDOWN_MS);
  }

  /* ── Dica ────────────────────────────────────────────────── */

  /* Agenda a próxima dica se ainda não atingiu o máximo */
  static #agendarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;
    clearTimeout(this.#timerDica);
    this.#timerDica = setTimeout(() => this.#ciclarDica(), this.#DICA_INTERVALO);
  }

  /* Exibe a dica com animação, depois agenda a próxima */
  static #ciclarDica() {
    if (!this.#oculto || this.#dicaCount >= this.#DICA_MAX || !this.#dicaEl) return;

    // Reinicia animação CSS (reflow force)
    this.#dicaEl.classList.remove('animando', 'visivel');
    void this.#dicaEl.offsetWidth;
    this.#dicaEl.classList.add('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'false');
    this.#dicaCount++;

    // Depois de DICA_DURACAO: esconde e agenda próxima se necessário
    this.#timerDica = setTimeout(() => {
      this.#dicaEl.classList.remove('visivel', 'animando');
      this.#dicaEl.setAttribute('aria-hidden', 'true');
      this.#agendarDica(); // só agenda se dicaCount < DICA_MAX
    }, this.#DICA_DURACAO);
  }

  /* Para todos os timers e oculta a dica */
  static #pararDica() {
    clearTimeout(this.#timerDica);
    if (!this.#dicaEl) return;
    this.#dicaEl.classList.remove('visivel', 'animando');
    this.#dicaEl.setAttribute('aria-hidden', 'true');
  }

  /* Reinicia o ciclo (chamado ao voltar para o início) */
  static #resetarDica() {
    this.#dicaCount = 0;
    this.#pararDica();
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