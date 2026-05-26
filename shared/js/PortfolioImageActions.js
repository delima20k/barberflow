'use strict';

class PortfolioImageActions {
  static #delegado = false;
  static #curtidas = new Set();

  static criar(item, { professionalId = null } = {}) {
    PortfolioImageActions.instalarDelegacao();

    const wrap = document.createElement('div');
    wrap.className = 'portfolio-actions';

    const like = document.createElement('button');
    like.type = 'button';
    like.className = 'portfolio-action portfolio-action--like';
    like.dataset.action = 'portfolio-like';
    like.dataset.portfolioImageId = item.id ?? '';
    like.setAttribute('aria-label', 'Curtir imagem do portfolio');
    like.setAttribute('aria-pressed', String(PortfolioImageActions.#curtidas.has(item.id)));
    like.innerHTML = `<span class="portfolio-action__icon" aria-hidden="true">♡</span><span class="portfolio-action__count">${Math.max(0, Number(item.likesCount ?? 0))}</span>`;

    const msg = document.createElement('button');
    msg.type = 'button';
    msg.className = 'portfolio-action portfolio-action--message';
    msg.dataset.action = 'portfolio-message';
    msg.dataset.professionalId = professionalId || item.professionalId || '';
    msg.dataset.portfolioImageId = item.id ?? '';
    msg.setAttribute('aria-label', 'Enviar mensagem sobre esta imagem');
    msg.innerHTML = `<span class="portfolio-action__icon" aria-hidden="true">💬</span>`;

    wrap.append(like, msg);
    PortfolioImageActions.#sincronizarBotao(item.id, PortfolioImageActions.#curtidas.has(item.id));
    return wrap;
  }

  static async hidratar(items = []) {
    const ids = items.map(item => item?.id).filter(Boolean);
    if (!ids.length || typeof SupabaseService === 'undefined' || typeof ApiService === 'undefined') return;
    try {
      const user = await SupabaseService.getUser?.();
      if (!user?.id) return;
      const { data, error } = await ApiService.from('likes')
        .select('content_id')
        .eq('user_id', user.id)
        .eq('content_type', 'portfolio_image')
        .in('content_id', ids);
      if (error) return;
      (data ?? []).forEach(row => {
        if (row?.content_id) PortfolioImageActions.#curtidas.add(row.content_id);
      });
      ids.forEach(id => PortfolioImageActions.#sincronizarBotao(id, PortfolioImageActions.#curtidas.has(id)));
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioImageActions] hydrate falhou:', err?.message ?? err);
      }
    }
  }

  static instalarDelegacao() {
    if (PortfolioImageActions.#delegado) return;
    PortfolioImageActions.#delegado = true;
    document.addEventListener('click', event => {
      const btn = event.target.closest('[data-action="portfolio-like"], [data-action="portfolio-message"]');
      if (!btn) return;

      event.preventDefault();
      event.stopPropagation();

      const action = btn.dataset.action;
      const router = (typeof App !== 'undefined' && App) || (typeof Pro !== 'undefined' && Pro) || null;
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao(action, router)) return;

      if (action === 'portfolio-like') PortfolioImageActions.#alternarCurtida(btn);
      if (action === 'portfolio-message') PortfolioImageActions.#enviarMensagem(btn);
    }, true);
  }

  static async #alternarCurtida(btn) {
    const imageId = btn.dataset.portfolioImageId;
    if (!imageId || typeof SupabaseService === 'undefined' || typeof ApiService === 'undefined') return;

    const estavaAtivo = PortfolioImageActions.#curtidas.has(imageId) || btn.classList.contains('ativo');
    const novoAtivo = !estavaAtivo;
    const atual = Number(btn.querySelector('.portfolio-action__count')?.textContent ?? 0);
    const proximoTotal = Math.max(0, atual + (novoAtivo ? 1 : -1));

    if (novoAtivo) PortfolioImageActions.#curtidas.add(imageId);
    else PortfolioImageActions.#curtidas.delete(imageId);
    PortfolioImageActions.#sincronizarBotao(imageId, novoAtivo, proximoTotal);

    try {
      const user = await SupabaseService.getUser?.();
      if (!user?.id) throw new Error('Usuario nao autenticado.');
      if (novoAtivo) {
        const { error } = await ApiService.from('likes').insert({
          user_id: user.id,
          content_id: imageId,
          content_type: 'portfolio_image',
        });
        if (error) throw error;
      } else {
        const { error } = await ApiService.from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', imageId)
          .eq('content_type', 'portfolio_image');
        if (error) throw error;
      }
    } catch (err) {
      if (estavaAtivo) PortfolioImageActions.#curtidas.add(imageId);
      else PortfolioImageActions.#curtidas.delete(imageId);
      PortfolioImageActions.#sincronizarBotao(imageId, estavaAtivo, atual);
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioImageActions] curtida falhou:', err?.message ?? err);
      }
    }
  }

  static async #enviarMensagem(btn) {
    const professionalId = btn.dataset.professionalId;
    if (!professionalId || typeof BffApiService === 'undefined') return;
    try {
      btn.disabled = true;
      const { error } = await BffApiService.profissionais.iniciarMensagemBarbearia(professionalId);
      if (error) throw error;
      const router = (typeof App !== 'undefined' && App) || (typeof Pro !== 'undefined' && Pro) || null;
      router?.nav?.('mensagens');
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioImageActions] mensagem falhou:', err?.message ?? err);
      }
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Nao foi possivel abrir a conversa', err?.message || 'Tente novamente.', NotificationService.TIPOS?.ERRO || NotificationService.TIPOS?.SISTEMA);
      }
    } finally {
      btn.disabled = false;
    }
  }

  static #sincronizarBotao(imageId, ativo, total = null) {
    if (!imageId) return;
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(imageId) : imageId;
    document.querySelectorAll(`[data-action="portfolio-like"][data-portfolio-image-id="${safeId}"]`).forEach(btn => {
      btn.classList.toggle('ativo', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
      const icon = btn.querySelector('.portfolio-action__icon');
      if (icon) icon.textContent = ativo ? '♥' : '♡';
      const count = btn.querySelector('.portfolio-action__count');
      if (count && total !== null) count.textContent = String(Math.max(0, Number(total) || 0));
    });
  }
}
