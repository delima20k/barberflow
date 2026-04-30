'use strict';

/**
 * AvatarService — SRP: responsável EXCLUSIVAMENTE pelo avatar do usuário.
 *
 * Responsabilidades:
 *  - preview instantâneo antes do upload (Blob URL local, zero latência)
 *  - upload via BFF /api/media/upload-image?contexto=avatars
 *    → ImageProcessor processa server-side: crop 1:1, 200×200, WebP ≤20KB, sem EXIF
 *  - atualização do profile no banco
 *  - cache local via SessionCache
 *
 * REMOVIDO: compressão por canvas local (substituída pelo ImageProcessor no BFF)
 * REMOVIDO: upload direto ao Supabase Storage (tudo passa pelo BFF agora)
 *
 * API pública (inalterada):
 *   AvatarService.preview(input)
 *   AvatarService.abrirUpload(routerInstance)
 */
const AvatarService = (() => {
  'use strict';

  /** IDs dos elementos de avatar que devem ser atualizados em tela. */
  const AVATAR_IDS = ['menu-avatar-img', 'header-avatar-img', 'perfil-avatar-img'];

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
   * Faz o upload do avatar via BFF com processamento server-side.
   *
   * O BFF executa: ImageProcessor.processAvatar()
   *   → crop 1:1 central → resize 200×200 → WebP ≤20KB → strip EXIF
   * Depois salva em Supabase Storage (bucket media-images) e persiste em media_files.
   *
   * @param {File} file
   */
  async function _uploadViaBFF(file) {
    try {
      if (typeof AuthService === 'undefined') return;

      const token = AuthService.getToken?.() ?? AuthService.getPerfil?.()?.access_token;
      if (!token) return;

      // Envia o buffer raw — o BFF faz todo o processamento
      const arrayBuffer = await file.arrayBuffer();
      const resp = await fetch('/api/media/upload-image?contexto=avatars', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/octet-stream',
          'Authorization': `Bearer ${token}`,
        },
        body: arrayBuffer,
      });

      if (!resp.ok) {
        const { error } = await resp.json().catch(() => ({}));
        throw new Error(error ?? `BFF retornou ${resp.status}`);
      }

      const { publicUrl } = await resp.json();

      // Substituir o Blob URL local pela URL pública definitiva
      _aplicarSrc(publicUrl);

      if (typeof SessionCache !== 'undefined') SessionCache.salvarAvatar(publicUrl);
      if (typeof ProfileRepository !== 'undefined' && typeof UserService !== 'undefined') {
        const user = UserService.getUser?.();
        if (user?.id) await ProfileRepository.update(user.id, { avatar_path: publicUrl });
      }

      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('✅ Avatar atualizado', '', NotificationService.TIPOS.SISTEMA);
      }
    } catch (e) {
      if (typeof LoggerService !== 'undefined') LoggerService.warn('[AvatarService] Erro no upload:', e.message);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Erro ao salvar avatar', e?.message ?? 'Tente novamente.', NotificationService.TIPOS.SISTEMA);
      }
    }
  }

  /**
   * Exibe preview instantâneo do arquivo selecionado e inicia o upload em background.
   * @param {HTMLInputElement} input
   */
  function preview(input) {
    if (!input.files || !input.files[0]) return;
    const file     = input.files[0];
    const localUrl = URL.createObjectURL(file);
    // Preview imediato (Blob URL local — zero latência)
    _aplicarSrc(localUrl, { filter: 'none', opacity: '1' });
    // Upload em background — sem bloquear a UI
    _uploadViaBFF(file).then(() => URL.revokeObjectURL(localUrl));
  }

  /**
   * Verifica se o usuário está logado e, se sim, dispara o input de arquivo.
   * Caso não logado: fecha o menu e navega para a tela de login.
   * @param {object} router — instância do Router
   */
  function abrirUpload(router) {
    const logado = typeof AppState !== 'undefined'
      ? AppState.get('isLogado') === true
      : (typeof UserService !== 'undefined' ? !!UserService.getPerfil() : false);

    if (!logado) {
      if (typeof MenuService !== 'undefined') MenuService.fechar();
      router.nav('login');
      return;
    }

    document.getElementById('menu-avatar-input')?.click();
  }

  return Object.freeze({ preview, abrirUpload });
})();
