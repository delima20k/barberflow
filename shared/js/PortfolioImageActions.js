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
    like.innerHTML = `<span class="portfolio-action__icon" aria-hidden="true">\uD83D\uDC4D</span><span class="portfolio-action__count">${Math.max(0, Number(item.likesCount ?? 0))}</span>`;

    const msg = document.createElement('button');
    msg.type = 'button';
    msg.className = 'portfolio-action portfolio-action--message';
    msg.dataset.action = 'portfolio-message';
    msg.dataset.professionalId = professionalId || item.professionalId || '';
    msg.dataset.portfolioImageId = item.id ?? '';
    msg.setAttribute('aria-label', 'Enviar mensagem sobre esta imagem');
    msg.innerHTML = `<span class="portfolio-action__icon" aria-hidden="true">\uD83D\uDCAC</span>`;

    wrap.append(like, msg);
    PortfolioImageActions.#sincronizarBotao(item.id, PortfolioImageActions.#curtidas.has(item.id));
    return wrap;
  }

  static async hidratar(items = []) {
    const ids = items.map(item => item?.id).filter(Boolean);
    if (!ids.length || typeof BffApiService === 'undefined' || !BffApiService.profissionais?.listarCurtidasPortfolio) return;
    try {
      const { data, error } = await BffApiService.profissionais.listarCurtidasPortfolio(ids);
      if (error) return;
      (data?.likedIds ?? []).forEach(id => PortfolioImageActions.#curtidas.add(id));
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
    if (!imageId || typeof BffApiService === 'undefined') return;

    const estavaAtivo = PortfolioImageActions.#curtidas.has(imageId) || btn.classList.contains('ativo');
    const novoAtivo = !estavaAtivo;
    const atual = Number(btn.querySelector('.portfolio-action__count')?.textContent ?? 0);
    const proximoTotal = Math.max(0, atual + (novoAtivo ? 1 : -1));

    if (novoAtivo) PortfolioImageActions.#curtidas.add(imageId);
    else PortfolioImageActions.#curtidas.delete(imageId);
    PortfolioImageActions.#sincronizarBotao(imageId, novoAtivo, proximoTotal);

    try {
      const acao = novoAtivo
        ? BffApiService.profissionais?.curtirPortfolioImagem
        : BffApiService.profissionais?.descurtirPortfolioImagem;
      if (typeof acao !== 'function') throw new Error('BFF de curtidas indisponivel.');

      const { data, error } = await acao(imageId);
      if (error) throw error;
      const total = Number(data?.likesCount ?? proximoTotal);
      PortfolioImageActions.#sincronizarBotao(imageId, novoAtivo, total);
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
    const imageId = btn.dataset.portfolioImageId;
    if (!professionalId || typeof BffApiService === 'undefined') return;

    // Barbeiro visualizando próprio portfólio: abre modal de mensagens recebidas
    const isProApp = typeof Pro !== 'undefined';
    const perfilAtual = (typeof AuthService !== 'undefined') ? AuthService.getPerfil?.() : null;
    const ehDono = perfilAtual?.id && perfilAtual.id === professionalId;

    if (isProApp && ehDono && imageId) {
      await PortfolioImageActions.#abrirModalMensagensRecebidas(imageId);
      return;
    }

    // Cliente: inicia ou retoma conversa com o barbeiro
    try {
      btn.disabled = true;
      const { data, error } = await BffApiService.profissionais.iniciarMensagemBarbearia(professionalId);
      if (error) throw error;
      const router = (typeof App !== 'undefined' && App) || (typeof Pro !== 'undefined' && Pro) || null;
      if (data?.conversationId) {
        try {
          sessionStorage.setItem('bf_open_conversation_id', data.conversationId);
        } catch { /* best effort */ }
        setTimeout(() => {
          if (typeof MessagesWidget !== 'undefined') MessagesWidget.abrirModal?.(data.conversationId);
        }, 120);
      }
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

  /**
   * Abre modal com mensagens recebidas em uma imagem de portfólio.
   * Usado exclusivamente pelo barbeiro (app profissional, visualizando o próprio portfólio).
   * @param {string} imageId — UUID da portfolio_image
   */
  static async #abrirModalMensagensRecebidas(imageId) {
    if (!imageId || typeof BffApiService === 'undefined') return;

    const modal = PortfolioImageActions.#criarModalMensagens();
    const list   = modal.querySelector('.pf-msg-modal__list');
    const status = modal.querySelector('.pf-msg-modal__status');

    status.textContent = 'Carregando mensagens...';
    list.innerHTML = '';
    modal.hidden = false;
    document.body.classList.add('pf-msg-modal-open');

    try {
      const { data, error } = await BffApiService.profissionais.listarMensagensPortfolioImagem(imageId);
      if (error) throw error;
      const items = Array.isArray(data) ? data : (data?.messages ?? []);
      status.textContent = items.length ? '' : 'Nenhuma mensagem recebida nesta imagem ainda.';
      items.forEach(msg => list.appendChild(PortfolioImageActions.#itemMensagemModal(msg)));
    } catch (err) {
      status.textContent = 'Nao foi possivel carregar as mensagens.';
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioImageActions] mensagens recebidas falharam:', err?.message ?? err);
      }
    }
  }

  /** Cria (ou retorna) o modal de mensagens recebidas. Singleton no DOM. */
  static #criarModalMensagens() {
    let modal = document.querySelector('.pf-msg-modal');
    if (modal) {
      // Limpa estado anterior
      const list   = modal.querySelector('.pf-msg-modal__list');
      const status = modal.querySelector('.pf-msg-modal__status');
      if (list)   list.innerHTML    = '';
      if (status) status.textContent = '';
      return modal;
    }

    modal = document.createElement('div');
    modal.className = 'pf-msg-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Mensagens recebidas no portfólio');
    modal.hidden = true;

    modal.innerHTML = `
      <div class="pf-msg-modal__box">
        <div class="pf-msg-modal__header">
          <strong class="pf-msg-modal__title">💬 Mensagens do portfólio</strong>
          <button type="button" class="pf-msg-modal__close" aria-label="Fechar">✕</button>
        </div>
        <p class="pf-msg-modal__status"></p>
        <div class="pf-msg-modal__list" role="list"></div>
      </div>
    `;

    const fechar = () => {
      modal.hidden = true;
      document.body.classList.remove('pf-msg-modal-open');
    };

    modal.querySelector('.pf-msg-modal__close').addEventListener('click', fechar);
    modal.addEventListener('click', e => {
      if (e.target === modal) fechar();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !modal.hidden) fechar();
    });

    document.body.appendChild(modal);
    return modal;
  }

  /** Cria um item de mensagem com avatar, nome do remetente e texto. */
  static #itemMensagemModal(msg) {
    const item = document.createElement('article');
    item.className = 'pf-msg-modal__item';
    item.setAttribute('role', 'listitem');

    const avatarUrl = msg?.sender?.avatarUrl ?? null;
    const nome      = String(msg?.sender?.nome ?? 'Usuário').slice(0, 60);
    const corpo     = String(msg?.body ?? '').slice(0, 240);
    const data      = msg?.createdAt ? new Date(msg.createdAt).toLocaleString('pt-BR') : '';

    const avatarEl = document.createElement('img');
    avatarEl.className = 'pf-msg-modal__avatar';
    avatarEl.alt       = nome ? `Avatar de ${nome}` : '';
    avatarEl.loading   = 'lazy';
    if (avatarUrl) {
      avatarEl.src = avatarUrl;
    } else {
      avatarEl.hidden = true;
    }
    avatarEl.onerror = () => { avatarEl.hidden = true; };

    const info = document.createElement('div');
    info.className = 'pf-msg-modal__info';

    const nomeEl = document.createElement('strong');
    nomeEl.className = 'pf-msg-modal__nome';
    nomeEl.textContent = nome;

    const bodyEl = document.createElement('p');
    bodyEl.className = 'pf-msg-modal__body';
    bodyEl.textContent = corpo;

    const dataEl = document.createElement('time');
    dataEl.className = 'pf-msg-modal__data';
    dataEl.textContent = data;

    info.append(nomeEl, bodyEl, dataEl);
    item.append(avatarEl, info);
    return item;
  }

  static #sincronizarBotao(imageId, ativo, total = null) {
    if (!imageId) return;
    const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(imageId) : imageId;
    document.querySelectorAll(`[data-action="portfolio-like"][data-portfolio-image-id="${safeId}"]`).forEach(btn => {
      btn.classList.toggle('ativo', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
      const icon = btn.querySelector('.portfolio-action__icon');
      if (icon) icon.textContent = '\uD83D\uDC4D';
      const count = btn.querySelector('.portfolio-action__count');
      if (count && total !== null) count.textContent = String(Math.max(0, Number(total) || 0));
    });
    if (total !== null) {
      document.querySelectorAll(`[data-portfolio-image-id="${safeId}"] [data-portfolio-meta-count]`).forEach(el => {
        const likesCount = Math.max(0, Number(total) || 0);
        el.textContent = `${likesCount} curtida${likesCount === 1 ? '' : 's'}`;
      });
    }
  }
}
