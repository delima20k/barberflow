'use strict';

/**
 * AvatarService — SRP: responsável EXCLUSIVAMENTE pelo avatar do usuário.
 *
 * Responsabilidades:
 *  - preview instantâneo antes do upload
 *  - compressão local (canvas)
 *  - upload para Supabase Storage
 *  - atualização do profile no banco
 *  - cache local via SessionCache
 *
 * API pública:
 *   AvatarService.preview(input)
 *   AvatarService.abrirUpload(routerInstance)
 */
const AvatarService = (() => {
  'use strict';

  /** IDs dos elementos de avatar que devem ser atualizados em tela. */
  const AVATAR_IDS = ['menu-avatar-img', 'header-avatar-img'];

  /**
   * Aplica o src informado em todos os elementos de avatar da página.
   * @param {string} src
   * @param {object} [styles] — estilos inline opcionais (ex: { filter: 'none', opacity: '1' })
   */
  function _aplicarSrc(src, styles = {}) {
    AVATAR_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.src = src;
      Object.assign(el.style, styles);
    });
  }

  /**
   * Comprime uma imagem para no máximo `maxKB` kilobytes.
   * Redimensiona para máx 600px em qualquer dimensão.
   * @param {File} file
   * @param {number} maxKB
   * @returns {Promise<Blob>}
   */
  function _comprimir(file, maxKB) {
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

  /**
   * Faz o upload do arquivo para Supabase Storage e atualiza o profile.
   * Substitui o preview local pela URL pública após o upload.
   * @param {File} file
   */
  async function _upload(file) {
    try {
      if (typeof SupabaseService === 'undefined') return;

      const user = await SupabaseService.getUser();
      if (!user) return;

      const blob = await _comprimir(file, 512);
      const ext  = file.name.split('.').pop().toLowerCase().replace('jpg', 'jpeg');
      const path = `${user.id}/avatar.${ext}`;

      const { error: upErr } = await SupabaseService.client.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: blob.type });

      if (upErr) throw upErr;

      await SupabaseService.client
        .from('profiles')
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      const { data } = SupabaseService.client.storage.from('avatars').getPublicUrl(path);
      const publicUrl = data.publicUrl + '?t=' + Date.now(); // cache-bust

      _aplicarSrc(publicUrl);

      if (typeof SessionCache !== 'undefined') SessionCache.salvarAvatar(publicUrl);

    } catch (e) {
      console.warn('[AvatarService] Erro no upload:', e.message);
    }
  }

  /**
   * Exibe preview instantâneo do arquivo selecionado e inicia o upload em background.
   * @param {HTMLInputElement} input
   */
  function preview(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const localUrl = URL.createObjectURL(file);
    _aplicarSrc(localUrl, { filter: 'none', opacity: '1' });
    _upload(file);
  }

  /**
   * Verifica se o usuário está logado e, se sim, dispara o input de arquivo.
   * Caso não logado: fecha o menu e navega para a tela de login.
   *
   * @param {object} router — instância do Router (para fecharMenu e nav se não logado)
   */
  function abrirUpload(router) {
    const logado = !!(typeof AuthService !== 'undefined'
      ? AuthService.getPerfil()
      : router._logado);

    if (!logado) {
      MenuService.fechar();
      router.nav('login');
      return;
    }

    document.getElementById('menu-avatar-input')?.click();
  }

  return Object.freeze({ preview, abrirUpload });
})();
