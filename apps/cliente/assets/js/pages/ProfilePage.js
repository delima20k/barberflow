'use strict';

// =============================================================
// ProfilePage.js — Página de Perfil do app cliente.
// Responsabilidade: bind dos botões de edição de perfil (PerfilEditor)
// e do fluxo de upload de avatar. Delega ao PerfilEditor e ao
// ProfileRepository — sem lógica de UI própria.
//
// Dependências: PerfilEditor.js, ProfileRepository.js, SupabaseService.js
// =============================================================

// Gerencia a tela de perfil: edição inline de dados e upload de avatar.
class ProfilePage {

  constructor() {}

  /**
   * Registra todos os listeners da tela de perfil.
   * Chame uma vez após instanciar (DOM já está disponível).
   */
  bind() {
    this.#bindEditarModo();
    this.#bindCamposLapis();
    this.#bindAvatarInput();
  }

  // ── Privado ──────────────────────────────────────────────

  /**
   * Bind no botão "Editar perfil" → PerfilEditor.alternarModo(btn).
   * O PerfilEditor espera receber o próprio botão como argumento.
   */
  #bindEditarModo() {
    const btn = document.getElementById('btn-perfil-editar');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof PerfilEditor !== 'undefined') PerfilEditor.alternarModo(btn);
    });
  }

  /**
   * Bind via event delegation nos botões-lápis de cada campo.
   * O HTML usa data-perfil-campo="address|birth_date|gender|zip_code".
   */
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

  /**
   * Bind no input de arquivo para avatar — preview imediato + upload em background.
   * O input é acionado por data-action="avatar-upload" no menu-avatar (tratado pelo Router).
   */
  #bindAvatarInput() {
    const input = document.getElementById('menu-avatar-input');
    if (!input) return;

    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this.#previewAvatar(file);
      this.#uploadAvatar(file);
    });
  }

  /**
   * Exibe preview imediato do avatar selecionado (antes do upload).
   * @param {File} file
   */
  #previewAvatar(file) {
    const localUrl = URL.createObjectURL(file);
    ['menu-avatar-img', 'header-avatar-img'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.src = localUrl;
      el.style.filter  = 'none';
      el.style.opacity = '1';
    });
  }

  /**
   * Comprime e faz upload do avatar via ProfileRepository.
   * Substitui o preview local pela URL pública definitiva após o upload.
   * @param {File} file
   */
  async #uploadAvatar(file) {
    try {
      const user = await SupabaseService.getUser();
      if (!user) return;

      // Comprime para máx 512 KB antes de enviar
      const blob = await this.#comprimirImagem(file, 512);

      const publicUrl = await ProfileRepository.updateAvatar(user.id, blob);

      // Substitui o preview local pela URL pública definitiva
      ['menu-avatar-img', 'header-avatar-img'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.src = publicUrl;
      });

      // Persiste no cache local para carregamento rápido no próximo acesso
      if (typeof SessionCache !== 'undefined') SessionCache.salvarAvatar(publicUrl);

    } catch (e) {
      console.warn('[ProfilePage] Erro no upload do avatar:', e?.message);
    }
  }

  /**
   * Comprime imagem via Canvas para máx maxKB antes do upload.
   * @param {File} file
   * @param {number} maxKB
   * @returns {Promise<Blob>}
   */
  #comprimirImagem(file, maxKB) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const max = 600;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => resolve(b || file), 'image/jpeg', 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }
}
