'use strict';

// =============================================================
// PWAInstallBanner.js — Banner de instalação do PWA.
//
// Responsabilidade ÚNICA: exibir um convite para instalar o app
// toda vez que o usuário estiver na tela inicial (tela-inicio),
// enquanto o app ainda não estiver instalado (standalone).
//
// CAMADA: interfaces — injeta DOM, escuta eventos do browser.
//
// Funcionamento:
//   • Captura `beforeinstallprompt` (Android/Chrome) e exibe botão "Instalar"
//   • Detecta iOS/Safari e exibe instrução de atalho (sem prompt nativo)
//   • Usa MutationObserver nas .tela para saber quando home está ativa
//   • Após instalar, esconde permanentemente via appinstalled
//
// Configuração (definir ANTES de init):
//   PWAInstallBanner.iconSrc = '/shared/img/icon-192-cliente.png';
//   PWAInstallBanner.nomeApp = 'BarberFlow';
//
// Uso:
//   PWAInstallBanner.init();   // chamado no DOMContentLoaded de cada app
// =============================================================

class PWAInstallBanner {

  static #BANNER_ID = 'pwa-install-banner';

  /** Deferred prompt do browser (Android/Chrome). */
  static #deferred = null;

  /** Referência ao elemento DOM do banner. */
  static #banner = null;

  /** MutationObserver nas telas para detectar retorno à home. */
  static #observer = null;

  /** Instalado com sucesso — não exibir mais. */
  static #instalado = false;

  // ── Configuráveis por app ─────────────────────────────────
  /** Caminho do ícone exibido no banner (definir antes de init). */
  static iconSrc = '/shared/img/icon-192-cliente.png';

  /** Nome do app exibido no banner (definir antes de init). */
  static nomeApp = 'BarberFlow';

  // ── Captura eventos o mais cedo possível (ao definir a classe) ──────
  // beforeinstallprompt pode disparar ANTES do DOMContentLoaded.
  // O static block garante que o listener esteja ativo desde o parsing.
  static {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      PWAInstallBanner.#deferred = e;
      // Atualiza o botão se o banner já foi injetado
      PWAInstallBanner.#atualizarBotao();
    });

    window.addEventListener('appinstalled', () => {
      PWAInstallBanner.#instalado = true;
      PWAInstallBanner.#fechar(true);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o banner. Chamar uma vez no DOMContentLoaded.
   * Não faz nada se o app já estiver instalado (standalone).
   */
  static init() {
    if (PWAInstallBanner.#estaInstalado()) return;

    // Injeta o banner no body (flutuante, fora do fluxo de telas)
    PWAInstallBanner.#injetar();

    // Observa navegação via mudanças de classe nas telas
    PWAInstallBanner.#observarNavegacao();

    // Exibe imediatamente — app abre sempre na home
    PWAInstallBanner.#mostrar();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se o app já está rodando em modo instalado (standalone).
   * Cobre Android/Chrome e iOS/Safari.
   * @returns {boolean}
   */
  static #estaInstalado() {
    return window.matchMedia('(display-mode: standalone)').matches
        || navigator.standalone === true;
  }

  /**
   * Detecta iOS/Safari onde `beforeinstallprompt` não existe.
   * @returns {boolean}
   */
  static #isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        && /safari/i.test(navigator.userAgent)
        && !/crios|fxios|opios/i.test(navigator.userAgent);
  }

  /**
   * Injeta o elemento do banner no document.body.
   * Chamado apenas uma vez.
   */
  static #injetar() {
    if (document.getElementById(PWAInstallBanner.#BANNER_ID)) return;

    const banner = document.createElement('div');
    banner.id        = PWAInstallBanner.#BANNER_ID;
    banner.className = 'pwa-banner';
    banner.hidden    = true;
    banner.setAttribute('role', 'complementary');
    banner.setAttribute('aria-label', 'Instalar aplicativo');

    const icon = document.createElement('img');
    icon.className = 'pwa-banner__icon';
    icon.src       = PWAInstallBanner.iconSrc;
    icon.alt       = PWAInstallBanner.nomeApp;
    icon.loading   = 'lazy';

    const texto = document.createElement('div');
    texto.className = 'pwa-banner__texto';
    const titulo = document.createElement('strong');
    titulo.textContent = 'Instale o App';
    const sub = document.createElement('span');
    sub.className  = 'pwa-banner__sub';
    sub.id         = 'pwa-banner-sub';
    sub.textContent = PWAInstallBanner.#isIOS()
      ? 'Toque em Compartilhar → "Adicionar à Tela de Início"'
      : 'Rápido, offline e sem anúncios';
    texto.appendChild(titulo);
    texto.appendChild(sub);

    const btnInstalar = document.createElement('button');
    btnInstalar.className    = 'pwa-banner__btn';
    btnInstalar.id           = 'pwa-install-btn';
    btnInstalar.textContent  = 'Instalar';
    btnInstalar.addEventListener('click', () => PWAInstallBanner.#instalar());

    // No iOS não há prompt — esconde o botão de instalação
    if (PWAInstallBanner.#isIOS()) {
      btnInstalar.hidden = true;
    }

    const btnFechar = document.createElement('button');
    btnFechar.className   = 'pwa-banner__fechar';
    btnFechar.setAttribute('aria-label', 'Fechar');
    btnFechar.textContent = '✕';
    btnFechar.addEventListener('click', () => PWAInstallBanner.#fechar());

    banner.appendChild(icon);
    banner.appendChild(texto);
    banner.appendChild(btnInstalar);
    banner.appendChild(btnFechar);

    document.body.appendChild(banner);
    PWAInstallBanner.#banner = banner;
  }

  /**
   * Usa MutationObserver nas telas para detectar quando o usuário
   * navega para fora e de volta para a home.
   * Home = nenhuma .tela possui a classe 'ativa'.
   */
  static #observarNavegacao() {
    const telas = Array.from(document.querySelectorAll('.tela'));
    if (!telas.length) return;

    PWAInstallBanner.#observer = new MutationObserver(() => {
      if (PWAInstallBanner.#instalado || PWAInstallBanner.#estaInstalado()) return;
      const algumAtivo = document.querySelector('.tela.ativa');
      if (algumAtivo) {
        PWAInstallBanner.#fechar();
      } else {
        PWAInstallBanner.#mostrar();
      }
    });

    telas.forEach(t => {
      PWAInstallBanner.#observer.observe(t, {
        attributes:      true,
        attributeFilter: ['class'],
      });
    });
  }

  /**
   * Atualiza o texto do botão quando o deferred prompt chegar
   * depois da injeção do banner.
   */
  static #atualizarBotao() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.hidden = false;
  }

  /**
   * Exibe o banner com animação de entrada.
   */
  static #mostrar() {
    const b = PWAInstallBanner.#banner;
    if (!b) return;
    b.hidden = false;
    // requestAnimationFrame garante frame boundary sem forçar reflow síncrono
    requestAnimationFrame(() => b.classList.add('pwa-banner--visivel'));
  }

  /**
   * Esconde o banner com animação de saída.
   * @param {boolean} [permanente=false] — se true, para o observer também
   */
  static #fechar(permanente = false) {
    const b = PWAInstallBanner.#banner;
    if (!b) return;
    b.classList.remove('pwa-banner--visivel');
    const onEnd = () => {
      b.hidden = true;
      b.removeEventListener('transitionend', onEnd);
    };
    b.addEventListener('transitionend', onEnd);
    if (permanente) {
      PWAInstallBanner.#observer?.disconnect();
    }
  }

  /**
   * Aciona o prompt nativo de instalação (Android/Chrome).
   * No iOS não há prompt — o botão não existe.
   */
  static async #instalar() {
    if (!PWAInstallBanner.#deferred) return;
    try {
      await PWAInstallBanner.#deferred.prompt();
      const { outcome } = await PWAInstallBanner.#deferred.userChoice;
      if (outcome === 'accepted') {
        PWAInstallBanner.#instalado = true;
        PWAInstallBanner.#fechar(true);
      }
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PWAInstallBanner] prompt falhou:', err?.message);
      }
    }
    PWAInstallBanner.#deferred = null;
  }
}
