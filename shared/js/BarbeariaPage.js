'use strict';

// =============================================================
// BarbeariaPage.js — Perfil público de uma barbearia (POO, Singleton)
//
// Responsabilidades:
//   - Exibir capa, logo, nome, endereço, rating, serviços, portfólio
//   - Botões: favoritar, WhatsApp
//   - Acessível de qualquer card com [data-barbershop-id]
//   - Sanitiza saídas HTML via InputValidator.sanitizar()
//   - Segurança: IDs validados como UUID antes de qualquer uso;
//                dados exibidos via textContent (sem innerHTML não sanitizado)
//
// Dependências: BarbershopRepository.js, SupabaseService.js,
//               FonteSalao.js, InputValidator.js, LoggerService.js
// =============================================================

class BarbeariaPage {

  // ── Estado ────────────────────────────────────────────────
  #telaEl      = null;
  #shopId      = null;   // UUID da barbearia atual
  #shopIdCache = null;   // último ID renderizado (evita re-fetch na volta)
  #carregando  = false;  // mutex contra fetches paralelos

  // ── Refs DOM ──────────────────────────────────────────────
  #refs = {};

  constructor() {}

  // ═══════════════════════════════════════════════════════════
  // PÚBLICA
  // ═══════════════════════════════════════════════════════════

  /** Liga a tela e registra os listeners. Chamar uma vez após o DOM estar pronto. */
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
   * @param {string} id — UUID da barbearia
   */
  abrirPorId(id) {
    if (!InputValidator.uuid(id).ok) return;
    this.#shopId    = id;
    this.#carregando = false;   // garante re-fetch em nova navegação
    this.#mostrarSkeleton();
    if (typeof App !== 'undefined') App.nav('barbearia');
  }

  // ═══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ═══════════════════════════════════════════════════════════

  /** Faz cache de todos os nós DOM usados pelos renders. */
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
   * [data-barbershop-id]. Usa capture para interceptar antes de botões
   * de ação ([data-action]) dentro do card.
   */
  #bindListenerGlobal() {
    document.addEventListener('click', e => {
      const card = e.target.closest('[data-barbershop-id]');
      if (!card || e.target.closest('[data-action]')) return;

      const id = card.dataset.barbershopId;
      if (!InputValidator.uuid(id).ok) {
        LoggerService.warn('[BarbeariaPage] ID inválido interceptado:', id);
        return;
      }

      e.stopPropagation();
      this.abrirPorId(id);
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // CARREGAMENTO
  // ═══════════════════════════════════════════════════════════

  async #carregar() {
    if (this.#carregando) return;

    // Mesma barbearia já renderizada — apenas exibe conteúdo sem re-fetch
    if (this.#shopId === this.#shopIdCache) {
      this.#mostrarConteudo();
      return;
    }

    this.#carregando = true;
    try {
      // Todos os fetches em paralelo para minimizar latência
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

  // ═══════════════════════════════════════════════════════════
  // FETCHERS (estáticos — sem acesso a this)
  // ═══════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════
  // RENDERS — cada método tem uma responsabilidade única
  // ═══════════════════════════════════════════════════════════

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
      // textContent não interpreta HTML — não precisa de sanitizar()
      this.#refs.logoImg.alt = shop.name ?? '';
    }
  }

  /** Nome, endereço, badge, rating, likes, ano de fundação. */
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
      this.#refs.rating.textContent = `⭐ ${Number(shop.rating_avg ?? 0).toFixed(1)}`;
    }
    if (this.#refs.likes) {
      this.#refs.likes.textContent = `👍 ${Number(shop.likes_count ?? 0)}`;
    }
    if (this.#refs.since && shop.founded_year) {
      this.#refs.since.textContent = `Desde ${shop.founded_year}`;
    }
  }

  /** Botões WhatsApp e Favoritar. */
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

  /** Lista de serviços: imagem → nome → duração → preço. */
  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="bp-vazio">Nenhum serviço cadastrado.</p>';
      return;
    }

    const s = InputValidator.sanitizar;
    el.innerHTML = lista.map(sv => {
      const imgUrl  = sv.image_path ? SupabaseService.getLogoUrl(sv.image_path) : null;
      // sanitizar() é correto aqui pois o valor vai para innerHTML
      const imgHtml = imgUrl
        ? `<img src="${s(imgUrl)}" alt="${s(sv.name ?? '')}" class="bp-serv-img" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="bp-serv-img bp-serv-img--vazio">✂️</div>`;
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

  /** Grade 3×N de fotos do portfólio. */
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
      if (!img.thumbnail_path) return `<div class="bp-port-item">✂️</div>`;
      const url = SupabaseService.getPortfolioThumbUrl?.(img.thumbnail_path)
               ?? SupabaseService.getLogoUrl(img.thumbnail_path) ?? '';
      return `<div class="bp-port-item">
        <img src="${s(url)}" alt="${s(img.title ?? '')}" loading="lazy"
             onerror="this.outerHTML='<div class=bp-port-item>✂️</div>'">
      </div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════
  // CONTROLE DE VISIBILIDADE
  // Estes métodos gerenciam APENAS o DOM — nenhum estado de negócio.
  // ═══════════════════════════════════════════════════════════

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
      this.#refs.conteudo.innerHTML = '<p class="bp-erro">Não foi possível carregar a barbearia.</p>';
    }
  }
}

//
// Responsabilidades:
//   - Exibir capa, logo, nome, endereço, rating, serviços, portfólio
//   - Botões: favoritar, WhatsApp, agendar
//   - Acessível de qualquer card com [data-barbershop-id]
//   - Sanitiza todos os dados exibidos via InputValidator.sanitizar()
//   - Segurança: não interpola IDs em queries — usa parâmetros PostgREST
//
// Dependências: BarbershopRepository.js, SupabaseService.js,
//               BarbershopService.js, InputValidator.js, AnimationService.js
// =============================================================

class BarbeariaPage {

  // ── Estado ────────────────────────────────────────────────
  #telaEl        = null;
  #barbershopId  = null;
  #carregando    = false;

  // ── Refs DOM ──────────────────────────────────────────────
  #refs = {};

  constructor() {}

  /** Registra a tela e o listener global de clique em cards. */
  bind() {
    this.#telaEl = document.getElementById('tela-barbearia');
    if (!this.#telaEl) return;

    this.#refs = {
      capaImg:       this.#telaEl.querySelector('#bp-capa'),
      logoImg:       this.#telaEl.querySelector('#bp-logo'),
      nome:          this.#telaEl.querySelector('#bp-nome'),
      endereco:      this.#telaEl.querySelector('#bp-endereco'),
      badge:         this.#telaEl.querySelector('#bp-badge'),
      rating:        this.#telaEl.querySelector('#bp-rating'),
      likes:         this.#telaEl.querySelector('#bp-likes'),
      since:         this.#telaEl.querySelector('#bp-desde'),
      whatsBtn:      this.#telaEl.querySelector('#bp-whats-btn'),
      favBtn:        this.#telaEl.querySelector('#bp-fav-btn'),
      servicosLista: this.#telaEl.querySelector('#bp-servicos-lista'),
      portfolioGrid: this.#telaEl.querySelector('#bp-portfolio-grid'),
      skeleton:      this.#telaEl.querySelector('#bp-skeleton'),
      conteudo:      this.#telaEl.querySelector('#bp-conteudo'),
    };

    // Escuta animação de entrada para carregar dados ao abrir
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && this.#barbershopId) this.#carregar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });

    // ── Listener global: clique em qualquer card de barbearia ──
    document.addEventListener('click', e => {
      const card = e.target.closest('[data-barbershop-id]');
      if (!card) return;

      // Não intercepta cliques em botões de ação dentro do card
      if (e.target.closest('[data-action]')) return;

      const id = card.dataset.barbershopId;
      if (!id) return;

      // Valida UUID antes de usar — previne IDs malformados
      const check = InputValidator.uuid(id);
      if (!check.ok) {
        LoggerService.warn('[BarbeariaPage] ID inválido interceptado:', id);
        return;
      }

      e.stopPropagation();
      this.abrirPorId(id);
    }, true /* capture — antes do bubbling dos botões de ação */);
  }

  /**
   * Navega para o perfil da barbearia com o ID fornecido.
   * Chamado externamente (App) ou pelo listener interno.
   * @param {string} id — UUID da barbearia
   */
  abrirPorId(id) {
    if (!InputValidator.uuid(id).ok) return;
    this.#barbershopId = id;
    this.#carregando   = false;

    // Limpa estado anterior e mostra skeleton antes de animar
    this.#mostrarSkeleton();

    if (typeof App !== 'undefined') {
      App.nav('barbearia');
    } else {
      // Fallback: anima direto se App não disponível
      AnimationService?.animar(null, this.#telaEl, '', 'entrando-lento');
    }
  }

  // ── Privado ───────────────────────────────────────────────

  async #carregar() {
    if (this.#carregando) return;
    this.#carregando = true;

    try {
      const dados = await BarbershopRepository.getById(this.#barbershopId);
      if (!dados) { this.#mostrarErro(); return; }

      const [servicos, portfolio] = await Promise.all([
        BarbeariaPage.#fetchServicos(this.#barbershopId),
        BarbeariaPage.#fetchPortfolio(this.#barbershopId),
      ]);

      this.#renderizar(dados, servicos, portfolio);
    } catch (err) {
      LoggerService.error('[BarbeariaPage] carregar erro:', err);
      this.#mostrarErro();
    }
  }

  // ── Fetchers ──────────────────────────────────────────────

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

  // ── Renders ───────────────────────────────────────────────

  #renderizar(shop, servicos, portfolio) {
    const s = InputValidator.sanitizar;

    // Capa
    if (this.#refs.capaImg) {
      const url = shop.cover_path
        ? SupabaseService.getLogoUrl(shop.cover_path)
        : (shop.logo_path ? SupabaseService.getLogoUrl(shop.logo_path) : null);
      if (url) this.#refs.capaImg.src = url;
    }

    // Logo
    if (this.#refs.logoImg) {
      const url = shop.logo_path ? SupabaseService.getLogoUrl(shop.logo_path) : null;
      if (url) {
        this.#refs.logoImg.src = url;
        this.#refs.logoImg.alt = s(shop.name ?? '');
      }
    }

    // Nome
    if (this.#refs.nome) {
      this.#refs.nome.textContent = s(shop.name ?? '');
      if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(this.#refs.nome, shop.font_key);
    }

    // Endereço
    if (this.#refs.endereco) {
      const addr = [shop.address, shop.city, shop.state].filter(Boolean).join(', ');
      this.#refs.endereco.textContent = s(addr);
    }

    // Badge aberto/fechado
    if (this.#refs.badge) {
      this.#refs.badge.textContent  = shop.is_open ? 'Aberta' : 'Fechada';
      this.#refs.badge.className    = `bp-badge ${shop.is_open ? 'bp-badge--open' : 'bp-badge--closed'}`;
    }

    // Rating
    if (this.#refs.rating) {
      const r = Number(shop.rating_avg ?? 0).toFixed(1);
      this.#refs.rating.textContent = `⭐ ${r}`;
    }

    // Likes
    if (this.#refs.likes) {
      this.#refs.likes.textContent = `👍 ${Number(shop.likes_count ?? 0)}`;
    }

    // Desde
    if (this.#refs.since && shop.founded_year) {
      this.#refs.since.textContent = `Desde ${s(String(shop.founded_year))}`;
    }

    // WhatsApp
    if (this.#refs.whatsBtn) {
      if (shop.whatsapp) {
        const digits = shop.whatsapp.replace(/\D/g, '');
        this.#refs.whatsBtn.href   = `https://wa.me/${digits}`;
        this.#refs.whatsBtn.hidden = false;
      } else {
        this.#refs.whatsBtn.hidden = true;
      }
    }

    // Favoritar
    if (this.#refs.favBtn) {
      this.#refs.favBtn.dataset.barbershopId = this.#barbershopId;
    }

    // Serviços
    this.#renderServicos(servicos);

    // Portfólio
    this.#renderPortfolio(portfolio);

    // Exibe conteúdo
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = false;
  }

  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;
    if (!lista.length) {
      el.innerHTML = '<p class="bp-vazio">Nenhum serviço cadastrado.</p>';
      return;
    }
    const s = InputValidator.sanitizar;
    el.innerHTML = lista.map(sv => {
      const imgUrl = sv.image_path ? SupabaseService.getLogoUrl(sv.image_path) : null;
      const imgHtml = imgUrl
        ? `<img src="${s(imgUrl)}" alt="${s(sv.name)}" class="bp-serv-img" loading="lazy"
                onerror="this.style.display='none'">`
        : `<div class="bp-serv-img bp-serv-img--vazio">✂️</div>`;
      return `
        <div class="bp-serv-row">
          ${imgHtml}
          <div class="bp-serv-info">
            <p class="bp-serv-nome">${s(sv.name)}</p>
            <p class="bp-serv-meta">${sv.duration_min ? sv.duration_min + ' min' : ''}</p>
          </div>
          <p class="bp-serv-preco">R$ ${Number(sv.price ?? 0).toFixed(2).replace('.', ',')}</p>
        </div>`;
    }).join('');
  }

  #renderPortfolio(lista) {
    const el = this.#refs.portfolioGrid;
    if (!el) return;
    if (!lista.length) { el.hidden = true; return; }
    const s = InputValidator.sanitizar;
    el.hidden  = false;
    el.innerHTML = lista.map(img => {
      if (!img.thumbnail_path) return `<div class="bp-port-item">✂️</div>`;
      const url = SupabaseService.getPortfolioThumbUrl?.(img.thumbnail_path)
               ?? SupabaseService.getLogoUrl(img.thumbnail_path) ?? '';
      return `<div class="bp-port-item">
        <img src="${s(url)}" alt="${s(img.title ?? '')}" loading="lazy"
             onerror="this.outerHTML='<div class=bp-port-item>✂️</div>'">
      </div>`;
    }).join('');
  }

  #mostrarSkeleton() {
    this.#carregando = false;
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = false;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = true;
  }

  #mostrarErro() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) {
      this.#refs.conteudo.hidden   = false;
      this.#refs.conteudo.innerHTML = '<p class="bp-erro">Não foi possível carregar a barbearia.</p>';
    }
  }
}
