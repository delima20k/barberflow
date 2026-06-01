'use strict';

// =============================================================
// NavigationViewService.js — Camada de apresentação do Router SPA
//
// Responsabilidade ÚNICA: toda manipulação de DOM relacionada
// à navegação entre telas (footers, nav buttons, animações,
// toasts, boot-lock).
//
// O Router delega aqui qualquer acesso ao document/window —
// ele mesmo só conhece estado (tela atual, histórico, auth).
//
// Dependências: nenhuma (usa apenas DOM nativo)
// Injetável via services.view no constructor de Router
//   → permite mockar em testes sem DOM real.
// =============================================================

class NavigationViewService {

  // Refs DOM resolvidos em init() — undefined antes disso
  #footer        = null;
  #footerOffline = null;
  #navBtns       = [];

  // Cache de elementos estáticos — evita querySelectorAll/getElementById repetidos
  #telaEls      = [];   // todos os .tela  (para resetarParaHome + init)
  #menuNavItems = [];   // .menu-nav-item[data-tela]  (para sincronizarUI)
  #telaCache    = new Map(); // getElementById('tela-X') — 1 lookup por nome de tela

  // Refs do header/menu — resolvidos em init(), reutilizados em bindLoginEvent
  #elUsernameMenu = null;
  #elHeaderLabel  = null;
  #elAvatarBtn    = null;
  #elMenuAvatar   = null;

  // ═══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════

  /**
   * Resolve refs DOM, oculta footers e configura a tela de boot.
   * Chamado UMA VEZ no constructor do Router, antes de _atualizarUI().
   * @param {string} telaInicial — nome da tela de boot (sem prefixo "tela-")
   */
  init(telaInicial) {
    this.#footer        = document.getElementById('footer-nav');
    this.#footerOffline = document.getElementById('footer-nav-offline');
    this.#navBtns       = Array.from(document.querySelectorAll('.nav-btn'));

    // Cache estático — resolvido uma única vez durante o boot
    this.#telaEls      = Array.from(document.querySelectorAll('.tela'));
    this.#menuNavItems = Array.from(document.querySelectorAll('.menu-nav-item[data-tela]'));

    // Refs do header/menu para bindLoginEvent — evita getElementById no hot path
    this.#elUsernameMenu = document.getElementById('menu-username');
    this.#elHeaderLabel  = document.getElementById('header-user-label');
    this.#elAvatarBtn    = document.getElementById('header-avatar-btn');
    this.#elMenuAvatar   = document.getElementById('menu-avatar');

    // Oculta ambos os footers até o estado de auth ser conhecido
    if (this.#footer)        this.#footer.style.display        = 'none';
    if (this.#footerOffline) this.#footerOffline.style.display = 'none';

    // Garante que apenas a tela inicial tem a classe .ativa
    this.#telaEls.forEach(t => t.classList.remove('ativa'));
    // Home fica sempre visível por CSS; demais precisam de .ativa
    if (telaInicial !== 'inicio') {
      const el = this.telaEl(telaInicial);  // pré-aquece o cache
      if (el) el.classList.add('ativa');
    }
  }

  /**
   * Remove o boot-lock liberando o CSS normal após todo o setup do Router.
   * Separado de init() para ser chamado no momento exato do fluxo do Router.
   */
  removerBootLock() {
    document.getElementById('boot-lock')?.remove();
  }

  // ═══════════════════════════════════════════════════════════
  // RESOLUÇÃO DE ELEMENTOS DE TELA
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna o elemento HTML de uma tela pelo nome.
   * Resultado cacheado em Map — cada ID é resolvido no DOM apenas uma vez.
   * @param {string} nome — sem prefixo "tela-"
   * @returns {HTMLElement|null}
   */
  telaEl(nome) {
    let el = this.#telaCache.get(nome);
    if (!el) {
      el = document.getElementById(`tela-${nome}`);
      if (el) this.#telaCache.set(nome, el);
    }
    return el ?? null;
  }

  // ═══════════════════════════════════════════════════════════
  // RESET — bfcache (pageshow persisted)
  // ═══════════════════════════════════════════════════════════

  /**
   * Cancela animações em curso e reseta todos os elementos .tela para o
   * estado CSS original. Chamado pelo Router quando a página retorna do bfcache.
   */
  resetarParaHome() {
    this.#telaEls.forEach(telaEl => {
      telaEl.getAnimations().forEach(anim => anim.cancel());
      telaEl.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');
      telaEl.style.display       = '';
      telaEl.style.pointerEvents = '';
      telaEl.style.transform     = '';
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SINCRONIZAÇÃO DE UI (footer + nav buttons)
  // ═══════════════════════════════════════════════════════════

  /**
   * Sincroniza a visibilidade dos footers, o estado ativo dos botões de
   * navegação e o bloqueio visual do modo visitante com a tela atual.
   *
   * @param {string}      tela
   * @param {boolean}     logado
   * @param {Set<string>} telasComNav   — telas que exibem o footer logado
   * @param {Set<string>} telasOffline  — telas que exibem o footer visitante
   * @param {object|null} guestMode     — instância GuestMode (ou null)
   */
  sincronizarUI(tela, logado, telasComNav, telasOffline, guestMode) {
    const mostrarCompleto = logado && telasComNav.has(tela);
    const mostrarOffline  = !logado && telasOffline.has(tela);

    if (this.#footer)        this.#footer.style.display        = mostrarCompleto ? 'flex' : 'none';
    if (this.#footerOffline) this.#footerOffline.style.display = mostrarOffline  ? 'flex' : 'none';

    this.#navBtns.forEach(btn =>
      btn.classList.toggle('ativo', btn.dataset.tela === tela)
    );

    this.#menuNavItems.forEach(item =>
      item.classList.toggle('ativo', item.dataset.tela === tela)
    );

    // Atualiza bloqueio visual do modo visitante (adiciona/remove .bloqueado)
    guestMode?.atualizar();
  }

  // ═══════════════════════════════════════════════════════════
  // TOAST DE LOGIN OBRIGATÓRIO
  // ═══════════════════════════════════════════════════════════

  /**
   * Exibe o aviso "Você precisa estar logado" via NotificationService
   * (se disponível) ou via toast DOM manual como fallback.
   */
  exibirToastLoginObrigatorio() {
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Login necessário',
        'Você precisa estar logado',
        'warning'
      );
      return;
    }

    // Fallback nativo — toast leve no rodapé
    const id = '__router-auth-toast';
    if (document.getElementById(id)) return;

    const toast = document.createElement('div');
    toast.id            = id;
    toast.textContent   = 'Você precisa estar logado';
    toast.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(30,20,10,.92)',
      'color:#D4AF37',
      'padding:.55rem 1.25rem',
      'border-radius:2rem',
      'font-size:.88rem',
      'z-index:9999',
      'pointer-events:none',
      'white-space:nowrap',
      'box-shadow:0 2px 12px rgba(0,0,0,.5)',
    ].join(';');
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  // ═══════════════════════════════════════════════════════════
  // EVENTO barberflow:login
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra o listener do evento legado 'barberflow:login'.
   * Atualiza nome no header e no menu lateral com o nome do usuário.
   * Deve ser chamado uma única vez no setup do Router.
   */
  bindLoginEvent() {
    document.addEventListener('barberflow:login', e => {
      const { nome } = e.detail || {};
      if (nome) {
        // Sanitiza contra XSS antes de qualquer inserção no DOM
        const nomeSanitizado = nome.replace(
          /[<>"'&]/g,
          c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c])
        );

        // Usa refs cacheadas em init() — evita getElementById no hot path
        if (this.#elUsernameMenu) {
          this.#elUsernameMenu.textContent = '';
          this.#elUsernameMenu.appendChild(document.createTextNode(nomeSanitizado + ' '));
          const small = document.createElement('small');
          small.id          = 'menu-user-sub';
          small.textContent = 'Bem-vindo(a)!';
          this.#elUsernameMenu.appendChild(small);
        }

        if (this.#elHeaderLabel) {
          const primeiro = nomeSanitizado.split(' ')[0];
          this.#elHeaderLabel.textContent =
            'Olá, ' + primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
        }
      }

      this.#elAvatarBtn?.classList.add('logado');
      this.#elMenuAvatar?.classList.add('logado');
    });
  }
}
