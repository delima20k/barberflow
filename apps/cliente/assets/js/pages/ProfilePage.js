'use strict';

// =============================================================
// ProfilePage.js - Pagina de Perfil do app cliente.
// Responsabilidade: bind dos botoes de edicao de perfil e do
// fluxo de avatar, delegando upload/preview ao AvatarService.
// =============================================================

class ProfilePage {

  constructor() {}

  bind() {
    this.#bindEditarModo();
    this.#bindCamposLapis();
    this.#bindAvatarInput();
  }

  #bindEditarModo() {
    const btn = document.getElementById('btn-perfil-editar');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof PerfilEditor !== 'undefined') PerfilEditor.alternarModo(btn);
    });
  }

  #bindCamposLapis() {
    const lista = document.getElementById('perfil-lista');
    if (!lista) return;

    lista.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-perfil-campo]');
      if (!btn) return;
      if (typeof PerfilEditor !== 'undefined') {
        PerfilEditor.editarCampo(btn, btn.dataset.perfilCampo);
      }
    });
  }

  #bindAvatarInput() {
    const input = document.getElementById('menu-avatar-input');
    if (!input) return;

    input.addEventListener('change', (e) => {
      if (!e.target.files?.[0]) return;
      if (typeof AvatarService !== 'undefined') AvatarService.preview(input);
    });
  }
}
