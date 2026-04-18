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
  }

  // ── Privado ──────────────────────────────────────────────

  #bindForm() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      AuthService.login(
        document.getElementById('login-email'),
        document.getElementById('login-senha'),
        document.getElementById('login-erro'),
        this.#navFn
      );
    });
  }
}
