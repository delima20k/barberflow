'use strict';

/**
 * AvatarService — SRP: responsável EXCLUSIVAMENTE pelo avatar do usuário.
 *
 * Responsabilidades:
 *  - preview instantâneo antes do upload (Blob URL local, zero latência)
 *  - upload direto ao Supabase Storage via ProfileRepository.updateAvatar()
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
   * Faz o upload do avatar direto ao Supabase Storage via ProfileRepository.
   * O bucket 'avatars' é acessível pelo SDK do cliente com RLS (owner = auth.uid()).
   * @param {File} file
   */
  async function _uploadViaBFF(file) {
    try {
      const user = UserService.getUser?.() ?? UserService.getUserId?.();
      const userId = typeof user === 'string' ? user : user?.id;
      if (!userId) return;

      const publicUrl = await ProfileRepository.updateAvatar(userId, file);

      _aplicarSrc(publicUrl);
      if (typeof SessionCache !== 'undefined') {
        SessionCache.salvarAvatar(publicUrl);
        // Atualiza avatar_path no perfil em cache para que o próximo reload use o path novo
        const { perfil } = SessionCache.restaurar();
        if (perfil) {
          perfil.avatar_path = publicUrl;
          perfil.updated_at  = new Date().toISOString();
          SessionCache.salvar(perfil, null);
        }
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
