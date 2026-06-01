'use strict';

// =============================================================
// ForgotPasswordPage.js — Página de Recuperação de Senha do app cliente.
// Responsabilidade: bind do formulário de recuperação e delegação ao AuthService.
// Sem lógica de negócio — apenas captura de evento e coordenação.
//
// Dependências: AuthService.js
// =============================================================

// Gerencia a tela de recuperação de senha: captura o submit e delega ao AuthService.
class ForgotPasswordPage {

  #navFn;  // (tela: string) => void

  /**
   * @param {function(string): void} navFn — função de navegação do App
   */
  constructor(navFn) {
    this.#navFn = navFn;
  }

  /**
   * Registra listeners no formulário de recuperação de senha.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#bindForm();
  }

  // ── Privado ──────────────────────────────────────────────

  #bindForm() {
    const form = document.getElementById('rec-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const erroEl = document.getElementById('rec-erro');
      AuthService.recuperarSenha(
        document.getElementById('rec-email')?.value,
        this.#navFn,
        (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo)
      );
    });
  }
}
