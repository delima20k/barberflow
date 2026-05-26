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
    if (!professionalId || typeof BffApiService === 'undefined') return;
    try {
      btn.disabled = true;
      const { data, error } = await BffApiService.profissionais.iniciarMensagemBarbearia(professionalId);
      if (error) throw error;
      const router = (typeof App !== 'undefined' && App) || (typeof Pro !== 'undefined' && Pro) || null;
      router?.nav?.('mensagens');
      if (data?.conversationId) {
        try {
          sessionStorage.setItem('bf_open_conversation_id', data.conversationId);
        } catch { /* best effort */ }
        await PortfolioImageActions.#mostrarMensagensImagem(data.conversationId);
        setTimeout(() => {
          if (typeof MessagesWidget !== 'undefined') MessagesWidget.abrirModal?.(data.conversationId);
        }, 120);
      }
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

  static async #mostrarMensagensImagem(conversationId) {
    if (!conversationId || typeof BffApiService === 'undefined' || !BffApiService.chat?.listarMensagens) return;

    const panel = PortfolioImageActions.#mensagensPanel();
    const list = panel.querySelector('.portfolio-messages-panel__list');
    const status = panel.querySelector('.portfolio-messages-panel__status');
    panel.hidden = false;
    if (status) status.textContent = 'Carregando mensagens...';
    if (list) list.textContent = '';

    try {
      const { data, error } = await BffApiService.chat.listarMensagens(conversationId, { limit: 30 });
      if (error) throw error;
      const items = data?.items ?? [];
      if (status) status.textContent = items.length ? '' : 'Nenhuma mensagem nessa imagem ainda.';
      if (list) {
        list.textContent = '';
        items.forEach(item => list.appendChild(PortfolioImageActions.#mensagemItem(item)));
      }
    } catch (err) {
      if (status) status.textContent = 'Nao foi possivel carregar as mensagens.';
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[PortfolioImageActions] mensagens da imagem falharam:', err?.message ?? err);
      }
    }
  }

  static #mensagensPanel() {
    let panel = document.querySelector('.portfolio-messages-panel');
    if (panel) return panel;

    panel = document.createElement('aside');
    panel.className = 'portfolio-messages-panel';
    panel.hidden = true;

    const header = document.createElement('div');
    header.className = 'portfolio-messages-panel__header';

    const title = document.createElement('strong');
    title.textContent = 'Mensagens da imagem';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'portfolio-messages-panel__close';
    close.setAttribute('aria-label', 'Fechar mensagens');
    close.textContent = 'x';
    close.addEventListener('click', () => { panel.hidden = true; });

    const status = document.createElement('p');
    status.className = 'portfolio-messages-panel__status';

    const list = document.createElement('div');
    list.className = 'portfolio-messages-panel__list';

    header.append(title, close);
    panel.append(header, status, list);
    document.body.appendChild(panel);
    return panel;
  }

  static #mensagemItem(item) {
    const row = document.createElement('article');
    row.className = 'portfolio-messages-panel__item';

    const body = document.createElement('p');
    body.textContent = item?.body ?? item?.texto ?? '';

    const meta = document.createElement('span');
    const created = item?.createdAt ?? item?.created_at ?? '';
    meta.textContent = created ? new Date(created).toLocaleString('pt-BR') : '';

    row.append(body, meta);
    return row;
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
  }
}
