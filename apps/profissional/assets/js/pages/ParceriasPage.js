'use strict';

// =============================================================
// ParceriasPage.js — Tela "Parcerias" do app profissional.
//
// Exclusiva para barbeiros autônomos (pro_type='barbeiro').
// Seção 1: Barbearias Parceiras   — lista barbearias do sistema
// Seção 2: Convites Recebidos      — convites de barbearias para trabalhar
// Seção 3: Minhas Fotos            — galeria de portfólio do barbeiro
//                                    (máx. 10 fotos; press-hold 600ms p/ excluir)
//
// Dependências: BarbershopRepository, SupabaseService,
//               AuthService, AppState, LoggerService, NotificationService,
//               BffApiService
// =============================================================

class ParceriasPage {

  // ── Refs DOM ──────────────────────────────────────────────
  #telaEl          = null;

  // Seção 1 — Barbearias Parceiras
  #parceirasListaEl = null;

  // Seção 2 — Convites
  #convitesListaEl  = null;
  #convitesVazioEl  = null;

  // Seção 3 — Fotos
  #fotosCarrosselEl  = null;
  #fotosCountEl      = null;
  #fotosUploadInputEl = null;
  #fotosUploadLabelEl = null;

  // ── Estado ───────────────────────────────────────────────
  #carregouParceiras = false;
  #carregouConvites  = false;
  #carregouFotos     = false;
  #fotos             = [];

  constructor() {}

  /** Chame uma vez após o DOM estar disponível. */
  bind() {
    this.#telaEl = document.getElementById('tela-parcerias');
    if (!this.#telaEl) return;

    this.#parceirasListaEl    = document.getElementById('parcerias-barbearias-lista');
    this.#convitesListaEl     = document.getElementById('parcerias-convites-lista');
    this.#convitesVazioEl     = document.getElementById('parcerias-convites-vazio');
    this.#fotosCarrosselEl    = document.getElementById('parcerias-fotos-carrossel');
    this.#fotosCountEl        = document.getElementById('parcerias-fotos-count');
    this.#fotosUploadInputEl  = document.getElementById('parcerias-fotos-input');
    this.#fotosUploadLabelEl  = document.getElementById('parcerias-fotos-upload-label');

    // Selecionar arquivo → upload
    this.#fotosUploadInputEl?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this.#uploadFoto(file);
      if (this.#fotosUploadInputEl) this.#fotosUploadInputEl.value = '';
    });

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ═══════════════════════════════════════════════════════════

  async #aoEntrar() {
    // Carrega em paralelo, cada seção independentemente
    if (!this.#carregouParceiras) this.#carregarParceiras();
    if (!this.#carregouConvites)  this.#carregarConvites();
    if (!this.#carregouFotos)     this.#carregarFotos();
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 1 — BARBEARIAS PARCEIRAS
  // ═══════════════════════════════════════════════════════════

  async #carregarParceiras() {
    this.#carregouParceiras = true;
    if (!this.#parceirasListaEl) return;

    this.#parceirasListaEl.innerHTML = this.#skeletonParceiras(4);

    try {
      const lista = await BarbershopRepository.getAll(20);
      this.#parceirasListaEl.innerHTML = '';

      if (!lista.length) {
        this.#parceirasListaEl.innerHTML = ParceriasPage.#vazioHtml(
          '💈', 'Nenhuma barbearia parceira ainda'
        );
        return;
      }

      lista.forEach(b => this.#parceirasListaEl.appendChild(this.#criarCardParceira(b)));

    } catch (err) {
      LoggerService.error('[ParceriasPage] parceiras:', err);
      this.#parceirasListaEl.innerHTML = ParceriasPage.#erroHtml('barbearias parceiras');
    }
  }

  #criarCardParceira(b) {
    const row = document.createElement('div');
    row.className   = 'parcerias-row';
    row.dataset.id  = b.id;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img = document.createElement('img');
      img.src     = SupabaseService.getLogoUrl(b.logo_path) || '';
      img.alt     = b.name || 'Barbearia';
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className   = 'barber-name';
    nome.textContent = b.name || 'Barbearia';
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, b.font_key);

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = b.address || (b.city || 'BarberFlow');

    const badge = document.createElement('span');
    badge.className   = `badge ${b.is_open ? 'badge-open' : 'badge-closed'}`;
    badge.textContent = b.is_open ? 'Aberta' : 'Fechada';

    info.appendChild(nome);
    info.appendChild(sub);
    info.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const btnAgendar = document.createElement('button');
    btnAgendar.className       = 'btn btn-gold btn-sm';
    btnAgendar.textContent     = 'Atividade';
    btnAgendar.dataset.action  = 'atividade';
    btnAgendar.dataset.tela    = 'producao-parceira';  // caminho preparado: tela a ser construída
    btnAgendar.dataset.barbershop = b.id;
    meta.appendChild(btnAgendar);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(row, b.cover_path);
    return row;
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 2 — CONVITES DE BARBEARIAS
  // ═══════════════════════════════════════════════════════════

  async #carregarConvites() {
    this.#carregouConvites = true;
    if (!this.#convitesListaEl) return;

    this.#convitesListaEl.innerHTML = this.#skeletonConvite(2);

    const { data, error } = await BffApiService.get('/api/v1/profissionais/me/convites');

    this.#convitesListaEl.innerHTML = '';

    if (error) {
      LoggerService.warn('[ParceriasPage] convites:', error?.message ?? error);
      if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
      return;
    }

    if (!data?.length) {
      if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
      return;
    }

    if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = true;
    data.forEach(inv => this.#convitesListaEl.appendChild(this.#criarCardConvite(inv)));
  }

  #criarCardConvite(inv) {
    const card = document.createElement('div');
    card.className  = `parcerias-convite-card parcerias-convite--${inv.status ?? 'pendente'}`;
    card.dataset.id = inv.id;

    const shop    = inv.barbershop ?? {};
    const status  = inv.status ?? 'pendente';
    const dataStr = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('pt-BR')
      : '';

    const statusLabel = { pendente: 'Pendente', aceito: 'Aceito', recusado: 'Recusado' };

    // Resumo da condição para o card
    const msg    = inv.message ?? '';
    const isPct  = msg.startsWith('[% dos Cortes]');
    const isRent = msg.startsWith('[Aluguel de Cadeira]');
    let resumo   = '';
    if (inv.commission_pct != null) {
      const v = Number(inv.commission_pct);
      if (isPct)       resumo = `${v}% dos cortes`;
      else if (isRent) resumo = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/mês (cadeira)';
      else             resumo = `${v}%`;
    }

    card.innerHTML = `
      <div class="parcerias-convite-header">
        <div class="avatar gold" style="width:38px;height:38px;font-size:.9rem;">
          ${shop.logo_path
            ? `<img src="${SupabaseService.getLogoUrl(shop.logo_path)}" alt="${InputValidator.sanitizar(shop.name ?? '')}" loading="lazy" onerror="this.outerHTML='💈'">`
            : '💈'}
        </div>
        <div class="parcerias-convite-info">
          <p class="barber-name">${InputValidator.sanitizar(shop.name ?? 'Barbearia')}</p>
          <p class="barber-sub">${InputValidator.sanitizar(shop.address ?? '')}</p>
        </div>
        <span class="parcerias-convite-status parcerias-convite-status--${status}">
          ${statusLabel[status] ?? status}
        </span>
      </div>
      <div class="parcerias-convite-clausulas">
        ${resumo ? `<span class="parcerias-convite-pct">Condição: <strong>${resumo}</strong></span>` : ''}
        ${dataStr ? `<span class="parcerias-convite-data">${dataStr}</span>` : ''}
      </div>
      ${status === 'pendente' ? `
      <div class="parcerias-convite-acoes">
        <button class="btn btn-gold btn-sm" data-convite-ver="${inv.id}">Ver Proposta</button>
      </div>` : ''}`;

    if (status === 'pendente') {
      card.querySelector(`[data-convite-ver="${inv.id}"]`)
        ?.addEventListener('click', async () => {
          const acao = await this.#abrirModalConvite(inv);
          if (acao === 'aceitar' || acao === 'recusar') {
            await this.#responderConvite(inv.id, acao === 'aceitar' ? 'aceito' : 'recusado', card);
          }
        });
    }

    return card;
  }

  async #abrirModalConvite(inv) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'pci-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const shop    = inv.barbershop ?? {};
      const status  = inv.status ?? 'pendente';
      const dataStr = inv.created_at
        ? new Date(inv.created_at).toLocaleDateString('pt-BR')
        : '';

      const msg    = inv.message ?? '';
      const isPct  = msg.startsWith('[% dos Cortes]');
      const isRent = msg.startsWith('[Aluguel de Cadeira]');
      const notas  = isPct  ? msg.slice('[% dos Cortes]'.length).trim()
                   : isRent ? msg.slice('[Aluguel de Cadeira]'.length).trim()
                   : msg;

      const valorNum = inv.commission_pct != null ? Number(inv.commission_pct) : null;

      const logoHtml = shop.logo_path
        ? `<img src="${SupabaseService.getLogoUrl(shop.logo_path)}" alt="${InputValidator.sanitizar(shop.name ?? '')}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" loading="lazy" onerror="this.outerHTML='💈'">`
        : '💈';

      const isPendente = status === 'pendente';

      const clausulaHtml = ParceriasPage.#clausulaHtml(isPct, isRent, valorNum);

      overlay.innerHTML = `
        <div class="pci-card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
            <div class="avatar gold" style="width:44px;height:44px;flex-shrink:0;">${logoHtml}</div>
            <p class="pci-titulo">${InputValidator.sanitizar(shop.name ?? 'Barbearia')}</p>
          </div>
          ${shop.address ? `<div class="pci-linha"><span>Endereço</span><strong>${InputValidator.sanitizar(shop.address)}</strong></div>` : ''}
          ${dataStr      ? `<div class="pci-linha"><span>Data do convite</span><strong>${dataStr}</strong></div>` : ''}
          ${notas        ? `<p class="pci-notas">"${InputValidator.sanitizar(notas)}"</p>` : ''}
          ${clausulaHtml}
          ${isPendente ? `
          <div class="pci-acoes">
            <button class="btn btn-gold" data-pci="aceitar">Aceitar parceria</button>
            <button class="btn btn-outline" data-pci="recusar">Recusar</button>
          </div>` : ''}
          <button class="btn btn-outline btn-sm" data-pci="fechar" style="margin-top:${isPendente ? '0' : '8px'};">Fechar</button>
        </div>`;

      const _fechar = resultado => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('pci-overlay--saindo');
        setTimeout(() => overlay.remove(), 230);
        resolve(resultado);
      };

      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      overlay.addEventListener('click', e => {
        const pci = e.target.closest('[data-pci]')?.dataset?.pci;
        if (pci === 'fechar') { _fechar(null); return; }
        if (pci === 'aceitar' || pci === 'recusar') { _fechar(pci); return; }
        if (e.target === overlay) _fechar(null);
      });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('pci-overlay--visivel'));
    });
  }

  async #responderConvite(inviteId, novoStatus, cardEl) {
    const endpoint = novoStatus === 'aceito' ? 'aceitar' : 'recusar';
    const { error } = await BffApiService.post(
      `/api/v1/profissionais/me/convites/${inviteId}/${endpoint}`,
      {},
    );

    if (error) {
      LoggerService.error('[ParceriasPage] responderConvite:', error);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Erro ao processar. Tente novamente.',
          '',
          NotificationService.TIPOS?.SISTEMA ?? 'sistema',
        );
      }
      return;
    }

    // Atualiza card sem re-render
    cardEl.classList.remove('parcerias-convite--pendente');
    cardEl.classList.add(`parcerias-convite--${novoStatus}`);
    const statusEl = cardEl.querySelector('.parcerias-convite-status');
    if (statusEl) {
      statusEl.textContent = novoStatus === 'aceito' ? 'Aceito' : 'Recusado';
      statusEl.className   = `parcerias-convite-status parcerias-convite-status--${novoStatus}`;
    }
    cardEl.querySelector('.parcerias-convite-acoes')?.remove();

    const toast = novoStatus === 'aceito' ? 'Convite aceito! 🎉' : 'Convite recusado.';
    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(toast, '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 3 — MINHAS FOTOS
  // ═══════════════════════════════════════════════════════════

  async #carregarFotos() {
    this.#carregouFotos = true;
    const { data, error } = await BffApiService.profissionais.listarMeuPortfolio();
    if (error) {
      LoggerService.warn('[ParceriasPage] carregar fotos:', error?.message ?? error);
      return;
    }
    this.#renderFotos(Array.isArray(data) ? data : (data?.items ?? []));
  }

  #renderFotos(fotos) {
    this.#fotos = fotos;

    if (this.#fotosCountEl) {
      this.#fotosCountEl.textContent = `${fotos.length}/10`;
    }

    // Esconde botão de upload se atingiu o limite
    if (this.#fotosUploadLabelEl) {
      this.#fotosUploadLabelEl.hidden = fotos.length >= 10;
    }

    if (!this.#fotosCarrosselEl) return;
    this.#fotosCarrosselEl.innerHTML = '';

    if (!fotos.length) {
      const vazio = document.createElement('p');
      vazio.className   = 'parcerias-fotos-vazio';
      vazio.textContent = 'Adicione fotos ao seu portfólio para elas aparecerem no seu perfil público.';
      this.#fotosCarrosselEl.appendChild(vazio);
      return;
    }

    fotos.forEach(f => this.#fotosCarrosselEl.appendChild(this.#criarCardFoto(f)));
  }

  #criarCardFoto(foto) {
    const item = document.createElement('div');
    item.className = 'parcerias-foto-item';

    const img = document.createElement('img');
    img.src     = foto.publicUrl ?? foto.storage_path ?? '';
    img.alt     = 'Foto do portfólio';
    img.loading = 'lazy';
    img.onerror = () => { item.style.display = 'none'; };
    item.appendChild(img);

    this.#bindPressHold(item, foto.id);
    return item;
  }

  #bindPressHold(el, photoId) {
    let timer = null;

    const cancelar = () => {
      clearTimeout(timer);
      el.classList.remove('parcerias-foto-item--pressionado');
    };

    el.addEventListener('pointerdown', () => {
      el.classList.add('parcerias-foto-item--pressionado');
      timer = setTimeout(() => {
        el.classList.remove('parcerias-foto-item--pressionado');
        this.#abrirModalExcluirFoto(photoId);
      }, 600);
    });

    el.addEventListener('pointerup',     cancelar);
    el.addEventListener('pointermove',   cancelar);
    el.addEventListener('pointercancel', cancelar);
  }

  #abrirModalExcluirFoto(photoId) {
    const overlay = document.createElement('div');
    overlay.className = 'pci-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="pci-card">
        <p class="pci-titulo">Excluir foto?</p>
        <p style="font-size:.87rem;color:var(--text-2);margin-bottom:18px;text-align:center;">
          Esta ação não pode ser desfeita.
        </p>
        <div class="pci-acoes">
          <button class="btn btn-danger" data-pci="excluir">Excluir</button>
          <button class="btn btn-outline" data-pci="cancelar">Cancelar</button>
        </div>
      </div>`;

    const _fechar = () => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('pci-overlay--saindo');
      setTimeout(() => overlay.remove(), 230);
    };

    const onKey = e => { if (e.key === 'Escape') _fechar(); };
    document.addEventListener('keydown', onKey);

    overlay.addEventListener('click', e => {
      const pci = e.target.closest('[data-pci]')?.dataset?.pci;
      if (pci === 'excluir') {
        _fechar();
        this.#excluirFoto(photoId);
        return;
      }
      if (pci === 'cancelar' || e.target === overlay) _fechar();
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('pci-overlay--visivel'));
  }

  async #excluirFoto(photoId) {
    const { error } = await BffApiService.profissionais.removerPortfolioImagem(photoId);
    if (error) {
      LoggerService.error('[ParceriasPage] excluirFoto:', error);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Erro ao excluir foto. Tente novamente.',
          '',
          NotificationService.TIPOS?.SISTEMA ?? 'sistema',
        );
      }
      return;
    }
    const novos = this.#fotos.filter(f => f.id !== photoId);
    this.#renderFotos(novos);
  }

  async #uploadFoto(file) {
    if (!file) return;

    if (this.#fotosUploadLabelEl) {
      this.#fotosUploadLabelEl.setAttribute('aria-busy', 'true');
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { data, error } = await BffApiService.profissionais.uploadPortfolioImagem(
        arrayBuffer,
        file.type,
      );

      if (error) {
        LoggerService.error('[ParceriasPage] uploadFoto:', error);
        if (typeof NotificationService !== 'undefined') {
          const msg = error.status === 409
            ? 'Limite de 10 fotos atingido.'
            : 'Erro ao enviar foto. Tente novamente.';
          NotificationService.mostrarToast(msg, '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
        }
        return;
      }

      // Re-carrega lista para refletir nova foto
      this.#carregouFotos = false;
      await this.#carregarFotos();

    } finally {
      if (this.#fotosUploadLabelEl) {
        this.#fotosUploadLabelEl.removeAttribute('aria-busy');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS — Cláusula de convite
  // ═══════════════════════════════════════════════════════════

  /**
   * Gera o bloco HTML da cláusula de parceria exibida no modal do barbeiro.
   * Mostra divisão de valores, benefícios e direito de stories.
   */
  static #clausulaHtml(isPct, isRent, valorNum) {
    let divisaoHtml = '';

    if (valorNum != null) {
      if (isPct) {
        const paraBarbearia = valorNum.toFixed(0);
        const paraVoce      = (100 - valorNum).toFixed(0);
        divisaoHtml = `
          <div class="pci-divisao">
            <div class="pci-divisao-item">
              <span class="pci-divisao-label">Barbearia recebe</span>
              <strong class="pci-divisao-num pci-divisao-num--shop">${paraBarbearia}%</strong>
              <span class="pci-divisao-sub">de cada corte</span>
            </div>
            <div class="pci-divisao-sep">✂️</div>
            <div class="pci-divisao-item">
              <span class="pci-divisao-label">Você recebe</span>
              <strong class="pci-divisao-num pci-divisao-num--barb">${paraVoce}%</strong>
              <span class="pci-divisao-sub">de cada corte</span>
            </div>
          </div>`;
      } else if (isRent) {
        const fmt = valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        divisaoHtml = `
          <div class="pci-divisao">
            <div class="pci-divisao-item">
              <span class="pci-divisao-label">Aluguel fixo</span>
              <strong class="pci-divisao-num pci-divisao-num--shop">${fmt}/mês</strong>
              <span class="pci-divisao-sub">pago à barbearia</span>
            </div>
            <div class="pci-divisao-sep">✂️</div>
            <div class="pci-divisao-item">
              <span class="pci-divisao-label">Seus cortes</span>
              <strong class="pci-divisao-num pci-divisao-num--barb">100%</strong>
              <span class="pci-divisao-sub">ficam com você</span>
            </div>
          </div>`;
      }
    }

    return `
      <div class="pci-clausula">
        <p class="pci-clausula-titulo">📋 Termos da parceria</p>
        ${divisaoHtml}
        <ul class="pci-beneficios">
          <li class="pci-beneficio">
            <span class="pci-ben-icon">📅</span>
            <span>Agendamentos e atendimentos pelo sistema BarberFlow</span>
          </li>
          <li class="pci-beneficio">
            <span class="pci-ben-icon">💈</span>
            <span>Exposição no perfil da barbearia e acesso à clientela do espaço</span>
          </li>
          <li class="pci-beneficio">
            <span class="pci-ben-icon">🎬</span>
            <span><strong>1 vídeo por dia</strong> nos Stories da barbearia para divulgar seus trabalhos</span>
          </li>
          <li class="pci-beneficio">
            <span class="pci-ben-icon">📊</span>
            <span>Painel financeiro com extrato dos seus atendimentos</span>
          </li>
        </ul>
        <p class="pci-clausula-rodape">Ao aceitar, você concorda com os termos desta parceria. Você pode encerrar a qualquer momento.</p>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS — Skeletons e estados vazios
  // ═══════════════════════════════════════════════════════════

  #skeletonParceiras(n) {
    return Array(n).fill(0).map(() => `
      <div class="barber-row parcerias-row" style="opacity:.4;pointer-events:none;">
        <div class="avatar gold" style="background:var(--card-alt,#f0e8df)"></div>
        <div class="barber-info">
          <p class="barber-name" style="width:130px;height:14px;background:var(--card-alt);border-radius:6px"></p>
          <p class="barber-sub"  style="width:90px;height:11px;background:var(--card-alt);border-radius:6px;margin-top:6px"></p>
        </div>
      </div>`).join('');
  }

  #skeletonConvite(n) {
    return Array(n).fill(0).map(() => `
      <div class="parcerias-convite-card" style="opacity:.4;pointer-events:none;min-height:80px;
           background:var(--card);border-radius:var(--r-md);border:1px solid var(--gold-border);">
      </div>`).join('');
  }

  static #vazioHtml(emoji, msg) {
    return `<div class="parcerias-vazio"><span>${emoji}</span><p>${msg}</p></div>`;
  }

  static #erroHtml(ctx) {
    return `<p style="color:var(--danger);text-align:center;padding:20px;font-size:.85rem;">
              Erro ao carregar ${ctx}.</p>`;
  }
}
