'use strict';

// =============================================================
// RegisterPage.js — Página de Cadastro do app cliente.
// Responsabilidade: bind do formulário de cadastro e delegação ao AuthService.
// Sem lógica de negócio — apenas captura de evento e coordenação.
//
// Dependências: AuthService.js, InputValidator.js
// =============================================================

// Gerencia a tela de cadastro: captura o submit e delega ao AuthService.
class RegisterPage {

  #navFn;  // (tela: string) => void

  /**
   * @param {function(string): void} navFn — função de navegação do App
   */
  constructor(navFn) {
    this.#navFn = navFn;
  }

  /**
   * Registra listeners no formulário de cadastro.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#bindForm();
  }

  // ── Privado ──────────────────────────────────────────────

  #bindForm() {
    const form = document.getElementById('cad-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dados = {
        nome:     document.getElementById('cad-nome')?.value,
        email:    document.getElementById('cad-email')?.value,
        telefone: document.getElementById('cad-tel')?.value,
        senha:    document.getElementById('cad-senha')?.value,
        senha2:   document.getElementById('cad-senha2')?.value,
        role:     'client',
      };
      AuthService.cadastro(
        dados,
        document.getElementById('cad-erro'),
        this.#navFn
      );
    });
  }
}
