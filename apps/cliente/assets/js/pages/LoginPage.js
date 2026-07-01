'use strict';

// =============================================================
// LoginPage.js — Página de Login do app cliente.
// Responsabilidade: bind do formulário de login e delegação ao AuthService.
// Sem lógica de negócio — apenas captura de evento e coordenação.
//
// Dependências: AuthService.js, InputValidator.js
// =============================================================

// Gerencia a tela de login: captura o submit e delega ao AuthService.
class LoginPage {

  #navFn;  // (tela: string) => void

  /**
   * @param {function(string): void} navFn — função de navegação do App
   */
  constructor(navFn) {
    this.#navFn = navFn;
  }

  /**
   * Registra listeners no formulário de login.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#bindForm();
    this.#bindSocialAuth();
  }

  // ── Privado ──────────────────────────────────────────────

  /**
   * Liga os botões de login/cadastro social (Google/Facebook).
   * Cobre os botões [data-auth-provider] das telas de login E cadastro em uma
   * única passada. Guard global evita bind duplicado (login + register + forgot
   * chamam bind()). Espelha AuthController.#bindSocialAuth (usado no app pro).
   */
  #bindSocialAuth() {
    if (window.__clienteSocialAuthBound) return;
    window.__clienteSocialAuthBound = true;

    document.querySelectorAll('[data-auth-provider]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const provider = btn.dataset.authProvider;
        const form   = btn.closest('form');
        const erroEl = form?.querySelector('.form-erro');
        const botoes = Array.from(form?.querySelectorAll('button') || []);

        AuthUI.setLoading(true, botoes);
        await AuthService.loginSocial(
          provider,
          (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo),
        );
        AuthUI.setLoading(false, botoes);
      });
    });
  }

  #bindForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById('login-email');
      const senhaEl = document.getElementById('login-senha');
      const erroEl  = document.getElementById('login-erro');
      AuthUI.setLoading(true, [emailEl, senhaEl]);
      await AuthService.login(
        emailEl?.value,
        senhaEl?.value,
        this.#navFn,
        (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo)
      );
      AuthUI.setLoading(false, [emailEl, senhaEl]);
    });
  }
}
