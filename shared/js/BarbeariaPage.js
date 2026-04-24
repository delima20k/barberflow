'use strict';

// =============================================================
// BarbeariaPage.js â€” Perfil pÃºblico de uma barbearia (POO, Singleton)
//
// Responsabilidades:
//   - Exibir capa, logo, nome, endereÃ§o, rating, serviÃ§os, portfÃ³lio
//   - BotÃµes: favoritar, WhatsApp
//   - AcessÃ­vel de qualquer card com [data-barbershop-id]
//   - Sanitiza saÃ­das HTML via InputValidator.sanitizar()
//   - SeguranÃ§a: IDs validados como UUID antes de qualquer uso;
//                dados exibidos via textContent (sem innerHTML nÃ£o sanitizado)
//
// DependÃªncias: BarbershopRepository.js, SupabaseService.js,
//               FonteSalao.js, InputValidator.js, LoggerService.js
// =============================================================

class BarbeariaPage {

  // â”€â”€ Estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  #telaEl      = null;
  #shopId      = null;   // UUID da barbearia atual
  #shopIdCache = null;   // Ãºltimo ID renderizado (evita re-fetch na volta)
  #carregando  = false;  // mutex contra fetches paralelos

  // â”€â”€ Refs DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  #refs = {};

  constructor() {}

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PÃšBLICA
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Liga a tela e registra os listeners. Chamar uma vez apÃ³s o DOM estar pronto. */
  bind() {
    this.#telaEl = document.getElementById('tela-barbearia');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#observarEntrada();
    this.#bindListenerGlobal();
  }

  /**
   * Navega para o perfil da barbearia identificada por `id`.
   * Chamado pelo listener global ou externamente (ex.: deep-link).
   * @param {string} id â€” UUID da barbearia
   */
  abrirPorId(id) {
    if (!InputValidator.uuid(id).ok) return;
    this.#shopId    = id;
    this.#carregando = false;   // garante re-fetch em nova navegaÃ§Ã£o
    this.#mostrarSkeleton();
    if (typeof App !== 'undefined') App.nav('barbearia');
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // INICIALIZAÃ‡ÃƒO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /** Faz cache de todos os nÃ³s DOM usados pelos renders. */
  #cacheRefs() {
    const q = sel => this.#telaEl.querySelector(sel);
    this.#refs = {
      capaImg:       q('#bp-capa'),
      logoImg:       q('#bp-logo'),
      nome:          q('#bp-nome'),
      endereco:      q('#bp-endereco'),
      badge:         q('#bp-badge'),
      rating:        q('#bp-rating'),
      likes:         q('#bp-likes'),
      since:         q('#bp-desde'),
      whatsBtn:      q('#bp-whats-btn'),
      favBtn:        q('#bp-fav-btn'),
      servicosLista: q('#bp-servicos-lista'),
      portfolioGrid: q('#bp-portfolio-grid'),
      skeleton:      q('#bp-skeleton'),
      conteudo:      q('#bp-conteudo'),
    };
  }

  /** Observa a classe da tela e dispara carregamento quando ela fica ativa. */
  #observarEntrada() {
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && this.#shopId) this.#carregar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * Registra listener global de clique para qualquer card com
   * [data-barbershop-id]. Usa capture para interceptar antes de botÃµes
   * de aÃ§Ã£o ([data-action]) dentro do card.
   */
  #bindListenerGlobal() {
    document.addEventListener('click', e => {
      const card = e.target.closest('[data-barbershop-id]');
      if (!card || e.target.closest('[data-action]')) return;

      const id = card.dataset.barbershopId;
      if (!InputValidator.uuid(id).ok) {
        LoggerService.warn('[BarbeariaPage] ID invÃ¡lido interceptado:', id);
        return;
      }

      e.stopPropagation();
      this.abrirPorId(id);
    }, true);
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CARREGAMENTO
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  async #carregar() {
    if (this.#carregando) return;

    // Mesma barbearia jÃ¡ renderizada â€” apenas exibe conteÃºdo sem re-fetch
    if (this.#shopId === this.#shopIdCache) {
      this.#mostrarConteudo();
      return;
    }

    this.#carregando = true;
    try {
      // Todos os fetches em paralelo para minimizar latÃªncia
      const [shop, servicos, portfolio] = await Promise.all([
        BarbershopRepository.getById(this.#shopId),
        BarbeariaPage.#fetchServicos(this.#shopId),
        BarbeariaPage.#fetchPortfolio(this.#shopId),
      ]);

      if (!shop) { this.#mostrarErro(); return; }

      this.#renderizar(shop, servicos, portfolio);
      this.#shopIdCache = this.#shopId;
    } catch (err) {
      LoggerService.error('[BarbeariaPage] erro ao carregar:', err);
      this.#mostrarErro();
    } finally {
      this.#carregando = false;
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FETCHERS (estÃ¡ticos â€” sem acesso a this)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  static async #fetchServicos(id) {
    try {
      const { data, error } = await SupabaseService.services()
        .select('id, name, price, duration_min, image_path')
        .eq('barbershop_id', id)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  }

  static async #fetchPortfolio(id) {
    try {
      const { data, error } = await SupabaseService.portfolioImages()
        .select('id, thumbnail_path, title')
        .eq('owner_id', id)
        .eq('owner_type', 'barbershop')
        .eq('status', 'active')
        .order('likes_count', { ascending: false })
        .limit(9);
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDERS â€” cada mÃ©todo tem uma responsabilidade Ãºnica
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  #renderizar(shop, servicos, portfolio) {
    this.#renderCapa(shop);
    this.#renderInfo(shop);
    this.#renderAcoes(shop);
    this.#renderServicos(servicos);
    this.#renderPortfolio(portfolio);
    this.#mostrarConteudo();
  }

  /** Capa e logo da barbearia. */
  #renderCapa(shop) {
    if (this.#refs.capaImg) {
      const path = shop.cover_path ?? shop.logo_path;
      if (path) this.#refs.capaImg.src = SupabaseService.getLogoUrl(path);
    }
    if (this.#refs.logoImg && shop.logo_path) {
      this.#refs.logoImg.src = SupabaseService.getLogoUrl(shop.logo_path);
      // textContent nÃ£o interpreta HTML â€” nÃ£o precisa de sanitizar()
      this.#refs.logoImg.alt = shop.name ?? '';
    }
  }

  /** Nome, endereÃ§o, badge, rating, likes, ano de fundaÃ§Ã£o. */
  #renderInfo(shop) {
    if (this.#refs.nome) {
      this.#refs.nome.textContent = shop.name ?? '';
      if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(this.#refs.nome, shop.font_key);
    }
    if (this.#refs.endereco) {
      const addr = [shop.address, shop.city, shop.state].filter(Boolean).join(', ');
      this.#refs.endereco.textContent = addr;
    }
    if (this.#refs.badge) {
      this.#refs.badge.textContent = shop.is_open ? 'Aberta' : 'Fechada';
      this.#refs.badge.className   = `bp-badge ${shop.is_open ? 'bp-badge--open' : 'bp-badge--closed'}`;
    }
    if (this.#refs.rating) {
      this.#refs.rating.textContent = `â­ ${Number(shop.rating_avg ?? 0).toFixed(1)}`;
    }
    if (this.#refs.likes) {
      this.#refs.likes.textContent = `ðŸ‘ ${Number(shop.likes_count ?? 0)}`;
    }
    if (this.#refs.since && shop.founded_year) {
      this.#refs.since.textContent = `Desde ${shop.founded_year}`;
    }
  }

  /** BotÃµes WhatsApp e Favoritar. */
  #renderAcoes(shop) {
    if (this.#refs.whatsBtn) {
      if (shop.whatsapp) {
        const digits = shop.whatsapp.replace(/\D/g, '');
        this.#refs.whatsBtn.href   = `https://wa.me/${digits}`;
        this.#refs.whatsBtn.hidden = false;
      } else {
        this.#refs.whatsBtn.hidden = true;
      }
    }
    if (this.#refs.favBtn) {
      this.#refs.favBtn.dataset.barbershopId = this.#shopId;
    }
  }

  /** Lista de serviÃ§os: imagem â†’ nome â†’ duraÃ§Ã£o â†’ preÃ§o. */
  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="bp-vazio">Nenhum serviÃ§o cadastrado.</p>';
      return;
    }

    const s = InputValidator.sanitizar;
    el.innerHTML = lista.map(sv => {
      const imgUrl  = sv.image_path ? SupabaseService.getLogoUrl(sv.image_path) : null;
      // sanitizar() Ã© correto aqui pois o valor vai para innerHTML
      const imgHtml = imgUrl
        ? `<img src="${s(imgUrl)}" alt="${s(sv.name ?? '')}" class="bp-serv-img" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="bp-serv-img bp-serv-img--vazio">âœ‚ï¸</div>`;
      const meta  = sv.duration_min ? `${Number(sv.duration_min)} min` : '';
      const preco = `R$ ${Number(sv.price ?? 0).toFixed(2).replace('.', ',')}`;

      return `
        <div class="bp-serv-row">
          ${imgHtml}
          <div class="bp-serv-info">
            <p class="bp-serv-nome">${s(sv.name ?? '')}</p>
            <p class="bp-serv-meta">${meta}</p>
          </div>
          <p class="bp-serv-preco">${preco}</p>
        </div>`;
    }).join('');
  }

  /** Grade 3Ã—N de fotos do portfÃ³lio. */
  #renderPortfolio(lista) {
    const el = this.#refs.portfolioGrid;
    if (!el) return;

    if (!lista.length) {
      el.hidden = true;
      return;
    }

    const s = InputValidator.sanitizar;
    el.hidden    = false;
    el.innerHTML = lista.map(img => {
      if (!img.thumbnail_path) return `<div class="bp-port-item">âœ‚ï¸</div>`;
      const url = SupabaseService.getPortfolioThumbUrl?.(img.thumbnail_path)
               ?? SupabaseService.getLogoUrl(img.thumbnail_path) ?? '';
      return `<div class="bp-port-item">
        <img src="${s(url)}" alt="${s(img.title ?? '')}" loading="lazy"
             onerror="this.outerHTML='<div class=bp-port-item>âœ‚ï¸</div>'">
      </div>`;
    }).join('');
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CONTROLE DE VISIBILIDADE
  // Estes mÃ©todos gerenciam APENAS o DOM â€” nenhum estado de negÃ³cio.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  #mostrarSkeleton() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = false;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = true;
  }

  #mostrarConteudo() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = false;
  }

  #mostrarErro() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) {
      this.#refs.conteudo.hidden   = false;
      this.#refs.conteudo.innerHTML = '<p class="bp-erro">NÃ£o foi possÃ­vel carregar a barbearia.</p>';
    }
  }
}
