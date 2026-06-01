'use strict';

// =============================================================
// ClienteController.js — Binding de UI para o perfil do cliente.
// Registra os listeners de formulários e botões do app cliente,
// delegando toda a lógica ao ClienteService.
//
// Responsabilidade única: capturar eventos do DOM e delegar.
// Sem regras de negócio — sem queries diretas.
//
// Dependências: ClienteService.js
// =============================================================

class ClienteController {

  #navFn;   // (tela: string) => void — função de navegação injetada

  /**
   * @param {function(string): void} navFn — ex: (tela) => App.nav(tela)
   */
  constructor(navFn) {
    this.#navFn = navFn;
  }

  /**
   * Registra todos os listeners da camada cliente.
   * Chamar uma vez após instanciar (DOM já disponível).
   */
  bind() {
    this.#bindFormPerfil();
  }

  // ── Privados ──────────────────────────────────────────────

  /**
   * Listener no formulário de edição de perfil (#form-editar-perfil).
   * Lê os campos, delega ao ClienteService e navega de volta.
   */
  #bindFormPerfil() {
    const form = document.getElementById('form-editar-perfil');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userId = form.dataset.userId;
      if (!userId) return;

      const dados = {
        full_name:  document.getElementById('perfil-nome')?.value?.trim()      || undefined,
        phone:      document.getElementById('perfil-telefone')?.value?.trim()  || undefined,
        address:    document.getElementById('perfil-endereco')?.value?.trim()  || undefined,
        zip_code:   document.getElementById('perfil-cep')?.value?.trim()       || undefined,
        birth_date: document.getElementById('perfil-nascimento')?.value        || undefined,
        gender:     document.getElementById('perfil-genero')?.value            || undefined,
      };

      // Remove campos undefined para não enviar strings vazias ao banco
      Object.keys(dados).forEach((k) => dados[k] === undefined && delete dados[k]);

      const erroEl = document.getElementById('perfil-erro');
      try {
        await ClienteService.atualizarPerfil(userId, dados);
        if (erroEl) erroEl.textContent = '';
        this.#navFn('perfil');
      } catch (err) {
        if (erroEl) erroEl.textContent = err?.message ?? 'Erro ao salvar perfil.';
      }
    });
  }
}
