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
  static #FOTOS_MAX_QTD = 10;
  static #FOTO_MAX_BYTES = 8 * 1024 * 1024;

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
  #usuarioInfoEls     = null;

  // ── Estado ───────────────────────────────────────────────
  #carregouParceiras = false;
  #carregouConvites  = false;
  #carregouFotos     = false;
  #fotos             = [];
  #fotoViewer        = null;
  #fotoViewerEl      = null;
  #fotoViewerStageEl = null;
  #fotoViewerImgEl   = null;
  #fotoViewerCountEl = null;
  #fotoViewerIndex   = 0;
  #fotoViewerSwipeX  = null;

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
    this.#usuarioInfoEls      = {
      nome:     document.getElementById('parcerias-usuario-nome'),
      email:    document.getElementById('parcerias-usuario-email'),
      telefone: document.getElementById('parcerias-usuario-telefone'),
      endereco: document.getElementById('parcerias-usuario-endereco'),
    };

    // Selecionar arquivo → upload
    this.#fotosUploadInputEl?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) this.#uploadFoto(file);
      if (this.#fotosUploadInputEl) this.#fotosUploadInputEl.value = '';
    });

    document.addEventListener('auth:login', e => this.#renderUsuarioInfo(
      e.detail?.perfil ?? null,
      e.detail?.user ?? null,
    ));
    document.addEventListener('auth:logout', () => this.#renderUsuarioInfo({}, {}));
    this.#renderUsuarioInfo();

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        this.#aoEntrar();
      } else {
        this.#carregouConvites  = false; // convites são dinâmicos — sempre re-buscar na próxima entrada
        this.#carregouParceiras = false; // parceiras filtram recusados — re-buscar também
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ═══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ═══════════════════════════════════════════════════════════

  async #aoEntrar() {
    this.#renderUsuarioInfo();
    // Carrega em paralelo, cada seção independentemente
    if (!this.#carregouParceiras) this.#carregarParceiras();
    if (!this.#carregouConvites)  this.#carregarConvites();
    if (!this.#carregouFotos)     this.#carregarFotos();
  }

  // ═══════════════════════════════════════════════════════════
  // SEÇÃO 1 — BARBEARIAS PARCEIRAS
  // ═══════════════════════════════════════════════════════════

  #renderUsuarioInfo(perfilParam = null, userParam = null) {
    if (!this.#usuarioInfoEls) return;

    const perfil = perfilParam
      ?? (typeof AppState !== 'undefined' ? AppState.get('perfil') : null)
      ?? (typeof AuthService !== 'undefined' ? AuthService.getPerfil() : null);
    const user = userParam
      ?? (typeof AppState !== 'undefined' ? AppState.get('user') : null);

    const valores = {
      nome:     perfil?.full_name || user?.email?.split('@')?.[0] || '-',
      email:    user?.email || '-',
      telefone: perfil?.phone || '-',
      endereco: perfil?.address || '-',
    };

    Object.entries(valores).forEach(([campo, valor]) => {
      const el = this.#usuarioInfoEls[campo];
      if (el) el.textContent = valor;
    });
  }

  async #carregarParceiras() {
    this.#carregouParceiras = true;
    if (!this.#parceirasListaEl) return;

    this.#parceirasListaEl.innerHTML = this.#skeletonParceiras(4);

    try {
      const { data, error } = await BffApiService.profissionais.listarBarbeariasVinculadas();
      if (error) throw error;

      const lista = (data ?? [])
        .map(link => link.barbershop ? { ...link.barbershop, joined_at: link.joined_at } : null)
        .filter(Boolean);
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
    row.className   = 'parcerias-row mb-barbeiro-row mb-barbeiro-row--dono';
    row.dataset.id  = b.id;
    row.dataset.barbershopId = b.id;
    row.dataset.parceiro = 'true'; // impede BarbeariaPage.#bindListenerGlobal de interceptar

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
    btnAgendar.textContent     = 'Cadeiras';
    btnAgendar.dataset.action  = 'atividade';
    btnAgendar.dataset.tela    = 'minha-barbearia';
    btnAgendar.dataset.barbershop = b.id;
    meta.appendChild(btnAgendar);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    row.addEventListener('click', () => ParceriasPage.#entrarComoParceiro(b.id));
    btnAgendar.addEventListener('click', e => {
      e.stopPropagation();
      ParceriasPage.#entrarComoParceiro(b.id);
    });
    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(row, b.cover_path);
    return row;
  }

  static #abrirGestaoBarbearia(barbershopId) {
    if (!barbershopId) return;
    document.dispatchEvent(new CustomEvent('barberflow:abrir-barbearia', {
      detail: { barbershopId },
    }));
  }

  /**
   * Entra na barbearia vinculada como parceiro (barbeiro não-dono).
   * Seta bf_parceria_barbershop_id no sessionStorage para que
   * MinhaBarbeariaRuntimeController carregue a barbearia em modo parceiro.
   */
  static #entrarComoParceiro(barbershopId) {
    if (!barbershopId) return;
    try {
      sessionStorage.setItem('bf_parceria_barbershop_id', barbershopId);
    } catch { /* quota/privado — ignora */ }
    const router = (typeof Pro !== 'undefined' && Pro)
                || (typeof App !== 'undefined' && App)
                || null;
    if (router) router.nav('minha-barbearia');
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

    const pendentes = (data ?? []).filter(inv => inv.status === 'pendente');

    if (!pendentes.length) {
      if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
      return;
    }

    if (this.#convitesVazioEl) this.#convitesVazioEl.hidden = true;
    pendentes.forEach(inv => this.#convitesListaEl.appendChild(this.#criarCardConvite(inv)));
  }

  #criarCardConvite(inv) {
    const card = document.createElement('div');
    card.className  = `parcerias-convite-card parcerias-convite--${inv.status ?? 'pendente'}`;
    card.dataset.id = inv.id;

    const shop       = inv.barbershop ?? {};
    const status     = inv.status ?? 'pendente';
    const isPendente = status === 'pendente';
    const dataStr    = inv.created_at
      ? new Date(inv.created_at).toLocaleDateString('pt-BR')
      : '';

    const statusLabel = { pendente: 'Pendente', aceito: 'Aceito ✓', recusado: 'Recusado' };

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

    const logoHtml = shop.logo_path
      ? `<img src="${SupabaseService.getLogoUrl(shop.logo_path)}" alt="${InputValidator.sanitizar(shop.name ?? '')}" loading="lazy" onerror="this.outerHTML='💈'">`
      : '💈';

    card.innerHTML = `
      ${isPendente ? `<div class="parcerias-convite-badge">📩 Proposta de parceria</div>` : ''}
      <div class="parcerias-convite-header">
        <div class="avatar gold" style="width:46px;height:46px;font-size:1rem;flex-shrink:0;">
          ${logoHtml}
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
      ${isPendente ? `<p class="parcerias-convite-tap-hint">Toque para ver a proposta e aceitar ›</p>` : ''}`;

    if (isPendente) {
      card.addEventListener('click', async () => {
        const acao = await this.#abrirModalConvite(inv);
        if (acao === 'aceitar' || acao === 'recusar') {
          await this.#responderConvite(inv.id, acao === 'aceitar' ? 'aceito' : 'recusado', card, inv.barbershop?.id ?? null);
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

  async #responderConvite(inviteId, novoStatus, cardEl, barbershopId = null) {
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

    if (novoStatus === 'recusado') {
      // Remove o card do convite
      cardEl.remove();
      const temCards = this.#convitesListaEl?.children?.length > 0;
      if (!temCards && this.#convitesVazioEl) this.#convitesVazioEl.hidden = false;
      // Remove também o card de barbearia parceira correspondente
      if (barbershopId && this.#parceirasListaEl) {
        this.#parceirasListaEl.querySelector(`[data-id="${barbershopId}"]`)?.remove();
      }
    } else {
      // Aceito: atualiza badge
      cardEl.classList.remove('parcerias-convite--pendente');
      cardEl.classList.add('parcerias-convite--aceito');
      const statusEl = cardEl.querySelector('.parcerias-convite-status');
      if (statusEl) {
        statusEl.textContent = 'Aceito ✓';
        statusEl.className   = 'parcerias-convite-status parcerias-convite-status--aceito';
      }
      this.#carregouParceiras = false;
      await this.#carregarParceiras();
    }

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
      this.#fotosCountEl.textContent = `${fotos.length}/${ParceriasPage.#FOTOS_MAX_QTD}`;
    }

    // Esconde botão de upload se atingiu o limite
    if (this.#fotosUploadLabelEl) {
      this.#fotosUploadLabelEl.hidden = fotos.length >= ParceriasPage.#FOTOS_MAX_QTD;
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

    fotos.forEach((f, index) => this.#fotosCarrosselEl.appendChild(this.#criarCardFoto(f, index)));
  }

  static #fotoUrl(foto) {
    const path = foto?.thumbnailPath
      ?? foto?.storagePath
      ?? foto?.thumbnail_path
      ?? foto?.storage_path
      ?? '';

    if (foto?.publicUrl) return foto.publicUrl;
    if (typeof ApiService !== 'undefined' && path) {
      return ApiService.getPortfolioThumbUrl(path);
    }
    return path;
  }

  static #portfolioItem(foto, index) {
    const url = ParceriasPage.#fotoUrl(foto);
    const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    const avatarPath = perfil?.avatar_path ?? perfil?.avatarPath ?? '';
    const avatarUrl = avatarPath && typeof ApiService !== 'undefined' && ApiService.getAvatarUrl
      ? ApiService.getAvatarUrl(avatarPath)
      : '';
    return {
      ...foto,
      parceriasIndex: index,
      title: foto?.title || `Foto ${index + 1}`,
      thumbUrl: url,
      fullUrl: url,
      // professionalId: ID do usuário logado (dono das imagens em parcerias)
      professionalId: foto.professionalId ?? foto.ownerId ?? perfil?.id ?? '',
      professionalName: perfil?.full_name ?? perfil?.fullName ?? 'Barbeiro',
      professionalAvatarUrl: avatarUrl,
      likesCount: foto?.likesCount ?? 0,
      interactions: Array.isArray(foto?.interactions) ? foto.interactions : [],
      portfolioOwnerView: true,
    };
  }

  #criarCardFoto(foto, index) {
    // Usa article como wrapper para permitir aninhar PortfolioImageActions (botões) dentro
    const card = document.createElement('article');
    card.className = 'parcerias-foto-item';
    card.dataset.portfolioImageId = foto.id ?? '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'parcerias-foto-item__btn';
    btn.setAttribute('aria-label', 'Abrir foto do portfolio');

    const img = document.createElement('img');
    img.src     = ParceriasPage.#fotoUrl(foto);
    img.alt     = 'Foto do portfólio';
    img.loading = 'lazy';
    img.onerror = () => { card.style.display = 'none'; };
    btn.appendChild(img);

    const hint = document.createElement('span');
    hint.className = 'parcerias-foto-item__hint';
    hint.textContent = 'Segure para excluir';
    btn.appendChild(hint);

    card.appendChild(btn);

    // Adiciona botões de ação (like + mensagem) se disponíveis
    if (typeof PortfolioImageActions !== 'undefined' && foto.id) {
      const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
      const itemComProfId = { ...foto, professionalId: foto.professionalId ?? perfil?.id ?? '' };
      card.appendChild(PortfolioImageActions.criar(itemComProfId));
    }

    this.#bindFotoInteracoes(btn, foto.id, index);
    return card;
  }

  #bindFotoInteracoes(el, photoId, index) {
    let timer = null;
    let segurou = false;

    const cancelar = () => {
      clearTimeout(timer);
      el.classList.remove('parcerias-foto-item--pressionado');
    };

    el.addEventListener('pointerdown', () => {
      segurou = false;
      el.classList.add('parcerias-foto-item--pressionado');
      timer = setTimeout(() => {
        segurou = true;
        el.classList.remove('parcerias-foto-item--pressionado');
        ImageDeletionService.confirmarEExcluir(photoId).then(r => {
          if (r.deleted) {
            this.#renderFotos(this.#fotos.filter(f => f.id !== photoId));
            return;
          }
          if (r.error && typeof NotificationService !== 'undefined') {
            NotificationService.mostrarToast(
              'Erro ao excluir foto. Tente novamente.',
              '',
              NotificationService.TIPOS?.SISTEMA ?? 'sistema',
            );
          }
        });
      }, 600);
    });

    el.addEventListener('pointerup',     cancelar);
    el.addEventListener('pointermove',   cancelar);
    el.addEventListener('pointercancel', cancelar);
    el.addEventListener('click', e => {
      if (segurou) {
        e.preventDefault();
        return;
      }
      this.#abrirViewerFoto(index);
    });
  }

  #abrirViewerFoto(index) {
    if (!this.#fotos.length) return;
    const items = this.#fotos
      .map((foto, fotoIndex) => ParceriasPage.#portfolioItem(foto, fotoIndex))
      .filter(item => item.thumbUrl || item.fullUrl);
    const item = items.find(foto => foto.parceriasIndex === index) ?? items[0];
    if (item && typeof PortfolioPrismViewer !== 'undefined') {
      this.#fotoViewer ??= new PortfolioPrismViewer();
      this.#fotoViewer.open(item, items);
      return;
    }
    this.#fotoViewerIndex = Math.max(0, Math.min(index, this.#fotos.length - 1));
    this.#ensureFotoViewer();
    this.#renderViewerFoto('next');
    this.#fotoViewerEl.hidden = false;
    document.body.classList.add('parcerias-foto-viewer-aberto');
  }

  #fecharViewerFoto() {
    if (!this.#fotoViewerEl) return;
    this.#fotoViewerEl.hidden = true;
    document.body.classList.remove('parcerias-foto-viewer-aberto');
  }

  #navegarViewerFoto(delta) {
    if (!this.#fotos.length) return;
    const total = this.#fotos.length;
    this.#fotoViewerIndex = (this.#fotoViewerIndex + delta + total) % total;
    this.#renderViewerFoto(delta > 0 ? 'next' : 'prev');
  }

  #renderViewerFoto(direcao) {
    if (!this.#fotoViewerImgEl || !this.#fotoViewerStageEl) return;

    const foto = this.#fotos[this.#fotoViewerIndex];
    this.#fotoViewerImgEl.src = ParceriasPage.#fotoUrl(foto);
    this.#fotoViewerImgEl.alt = `Foto ${this.#fotoViewerIndex + 1} do portfolio`;

    if (this.#fotoViewerCountEl) {
      this.#fotoViewerCountEl.textContent = `${this.#fotoViewerIndex + 1}/${this.#fotos.length}`;
    }

    this.#fotoViewerStageEl.classList.remove(
      'parcerias-foto-viewer__stage--next',
      'parcerias-foto-viewer__stage--prev',
    );
    void this.#fotoViewerStageEl.offsetWidth;
    this.#fotoViewerStageEl.classList.add(`parcerias-foto-viewer__stage--${direcao}`);

    this.#fotoViewerEl?.querySelectorAll('[data-pfv="prev"], [data-pfv="next"]').forEach(btn => {
      btn.hidden = this.#fotos.length < 2;
    });
  }

  #ensureFotoViewer() {
    if (this.#fotoViewerEl) return;

    const overlay = document.createElement('div');
    overlay.className = 'parcerias-foto-viewer';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const stage = document.createElement('div');
    stage.className = 'parcerias-foto-viewer__stage';

    const img = document.createElement('img');
    img.className = 'parcerias-foto-viewer__img';
    img.alt = 'Foto do portfolio';
    stage.appendChild(img);

    const btnFechar = document.createElement('button');
    btnFechar.type = 'button';
    btnFechar.className = 'parcerias-foto-viewer__acao parcerias-foto-viewer__fechar';
    btnFechar.dataset.pfv = 'fechar';
    btnFechar.setAttribute('aria-label', 'Fechar');
    btnFechar.textContent = '×';

    const btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.className = 'parcerias-foto-viewer__acao parcerias-foto-viewer__nav parcerias-foto-viewer__nav--prev';
    btnPrev.dataset.pfv = 'prev';
    btnPrev.setAttribute('aria-label', 'Foto anterior');
    btnPrev.textContent = '‹';

    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.className = 'parcerias-foto-viewer__acao parcerias-foto-viewer__nav parcerias-foto-viewer__nav--next';
    btnNext.dataset.pfv = 'next';
    btnNext.setAttribute('aria-label', 'Proxima foto');
    btnNext.textContent = '›';

    const count = document.createElement('span');
    count.className = 'parcerias-foto-viewer__count';

    overlay.appendChild(stage);
    overlay.appendChild(btnFechar);
    overlay.appendChild(btnPrev);
    overlay.appendChild(btnNext);
    overlay.appendChild(count);

    overlay.addEventListener('click', e => {
      const acao = e.target.closest('[data-pfv]')?.dataset?.pfv;
      if (acao === 'fechar' || e.target === overlay) this.#fecharViewerFoto();
      if (acao === 'prev') this.#navegarViewerFoto(-1);
      if (acao === 'next') this.#navegarViewerFoto(1);
    });

    overlay.addEventListener('pointerdown', e => {
      this.#fotoViewerSwipeX = e.clientX;
    });
    overlay.addEventListener('pointerup', e => {
      if (this.#fotoViewerSwipeX == null) return;
      const deslocamento = e.clientX - this.#fotoViewerSwipeX;
      this.#fotoViewerSwipeX = null;
      if (Math.abs(deslocamento) < 48 || this.#fotos.length < 2) return;
      this.#navegarViewerFoto(deslocamento < 0 ? 1 : -1);
    });

    document.addEventListener('keydown', e => {
      if (!this.#fotoViewerEl || this.#fotoViewerEl.hidden) return;
      if (e.key === 'Escape') this.#fecharViewerFoto();
      if (e.key === 'ArrowLeft') this.#navegarViewerFoto(-1);
      if (e.key === 'ArrowRight') this.#navegarViewerFoto(1);
    });

    document.body.appendChild(overlay);
    this.#fotoViewerEl = overlay;
    this.#fotoViewerStageEl = stage;
    this.#fotoViewerImgEl = img;
    this.#fotoViewerCountEl = count;
  }

  // #abrirModalExcluirFoto e #excluirFoto removidos — lógica centralizada em ImageDeletionService

  async #uploadFoto(file) {
    if (!file) return;

    if (this.#fotos.length >= ParceriasPage.#FOTOS_MAX_QTD) {
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Limite de 10 fotos atingido.', '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
      }
      return;
    }

    if (!file.type?.startsWith('image/')) {
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Envie apenas arquivos de imagem.', '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
      }
      return;
    }

    if (file.size > ParceriasPage.#FOTO_MAX_BYTES) {
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Foto muito grande. Envie uma imagem de ate 8 MB.', '', NotificationService.TIPOS?.SISTEMA ?? 'sistema');
      }
      return;
    }

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
