'use strict';

// =============================================================
// BarbeariaPage.js — Perfil público de uma barbearia (OOP)
//
// Responsabilidades:
//   - Exibir capa, logo, nome, endereço, rating, serviços, portfólio
//   - Botões: favoritar, WhatsApp
//   - Acessível de qualquer card com [data-barbershop-id]
//   - Exibe dado bruto do banco — sem prefixos/emojis adicionados pelo JS
//   - Segurança: IDs validados como UUID; innerHTML protegido por sanitizar()
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
  #dig         = null;   // instância DigText de boas-vindas

  // ── Refs DOM ──────────────────────────────────────────────
  #refs = {};

  constructor() {}

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

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
   * @param {string} id — UUID da barbearia
   */
  abrirPorId(id) {
    if (!InputValidator.uuid(id).ok) return;
    this.#shopId     = id;
    this.#carregando = false;  // garante re-fetch em nova navegação
    this.#mostrarSkeleton();
    const router = (typeof App !== 'undefined' && App)
                || (typeof Pro !== 'undefined' && Pro)
                || null;
    if (router) router.nav('barbearia');
  }

  // ══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

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
      boasVindas:    q('#bp-boas-vindas'),
      infoFixa:      document.querySelector('#bp-info-fixa'),
    };
  }

  /** Observa a classe da tela e dispara carregamento quando ela fica ativa. */
  #observarEntrada() {
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && this.#shopId) {
        this.#carregar();
        this.#iniciarDig();
      } else {
        this.#pararDig();
        if (this.#refs.infoFixa) this.#refs.infoFixa.hidden = true;
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * Listener global: intercepta cliques em qualquer card [data-barbershop-id].
   * Usa capture para agir antes dos botões de ação ([data-action]) dentro do card.
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

  // ══════════════════════════════════════════════════════════
  // CARREGAMENTO
  // ══════════════════════════════════════════════════════════

  async #carregar() {
    if (this.#carregando) return;

    // Mesma barbearia já renderizada — apenas exibe conteúdo sem re-fetch
    if (this.#shopId === this.#shopIdCache) {
      this.#mostrarConteudo();
      return;
    }

    this.#carregando = true;
    try {
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

  // ══════════════════════════════════════════════════════════
  // FETCHERS (estáticos — sem acesso a this)
  // ══════════════════════════════════════════════════════════

  static async #fetchServicos(id) {
    try {
      const { data, error } = await ApiService.from('services')
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
      const { data, error } = await ApiService.from('portfolio_images')
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

  // ══════════════════════════════════════════════════════════
  // RENDERS — cada método tem responsabilidade única (SRP)
  // ══════════════════════════════════════════════════════════

  #renderizar(shop, servicos, portfolio) {
    this.#renderCapa(shop);
    this.#renderInfo(shop);
    this.#renderAcoes(shop);
    this.#renderServicos(servicos);
    this.#renderPortfolio(portfolio);
    this.#mostrarConteudo();
  }

  /** Capa e logo da barbearia. Usa .src — não innerHTML, sem risco XSS. */
  #renderCapa(shop) {
    if (this.#refs.capaImg) {
      const path = shop.cover_path ?? shop.logo_path;
      if (path) this.#refs.capaImg.src = ApiService.getLogoUrl(path);
    }
    if (this.#refs.logoImg && shop.logo_path) {
      this.#refs.logoImg.src = ApiService.getLogoUrl(shop.logo_path);
      // textContent/alt são seguros por natureza — não usar sanitizar()
      this.#refs.logoImg.alt = shop.name ?? '';
    }
  }

  /**
   * Nome, endereço, badge, rating, likes, ano de fundação.
   * REGRA: textContent recebe o valor ORIGINAL do banco — sem prefixos/emojis.
   * Emojis decorativos (⭐, 👍) devem estar APENAS no HTML estático ou no CSS.
   */
  #renderInfo(shop) {
    if (this.#refs.nome) {
      this.#refs.nome.textContent = shop.name ?? '';
      if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(this.#refs.nome, shop.font_key);
    }
    // Atualiza o texto do dig com o nome real da barbearia
    if (this.#refs.boasVindas && typeof DigText !== 'undefined') {
      const texto = `Bem-vindo à Barbearia ${shop.name ?? ''}`;
      this.#refs.boasVindas.textContent = '';
      this.#dig = new DigText(this.#refs.boasVindas, [texto], { velocidade: 36, loop: false });
      this.#iniciarDig();
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
      // Valor bruto — sem "⭐". Decoração fica no HTML/CSS.
      this.#refs.rating.textContent = Number(shop.rating_avg ?? 0).toFixed(1);
    }
    if (this.#refs.likes) {
      // Valor bruto — sem "👍". Decoração fica no HTML/CSS.
      this.#refs.likes.textContent = Number(shop.likes_count ?? 0);
    }
    if (this.#refs.since && shop.founded_year) {
      // Valor bruto — sem "Desde". Decoração fica no HTML/CSS.
      this.#refs.since.textContent = shop.founded_year;
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

  /**
   * Lista de serviços.
   * sanitizar() é CORRETO aqui — valores vão para innerHTML.
   */
  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="bp-vazio">Nenhum servi\u00e7o cadastrado.</p>';
      return;
    }

    const s = InputValidator.sanitizar;
    el.innerHTML = lista.map(sv => {
      const imgUrl  = sv.image_path || null;
      const imgHtml = imgUrl
        ? `<img src="${s(imgUrl)}" alt="${s(sv.name ?? '')}" class="bp-serv-img" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="bp-serv-img bp-serv-img--vazio"></div>`;
      const meta  = sv.duration_min ? `${Number(sv.duration_min)} min` : '';
      const preco = `R$\u00a0${Number(sv.price ?? 0).toFixed(2).replace('.', ',')}`;

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

  /**
   * Grade de portfólio.
   * sanitizar() é CORRETO aqui — valores vão para innerHTML (src e alt).
   */
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
      if (!img.thumbnail_path) return '<div class="bp-port-item bp-port-item--vazio"></div>';
      const url = ApiService.getPortfolioThumbUrl?.(img.thumbnail_path)
               ?? ApiService.getLogoUrl(img.thumbnail_path) ?? '';
      return `<div class="bp-port-item">
        <img src="${s(url)}" alt="${s(img.title ?? '')}" loading="lazy"
             onerror="this.outerHTML='<div class=\u0022bp-port-item bp-port-item--vazio\u0022></div>'">
      </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════
  // CONTROLE DE VISIBILIDADE
  // Apenas gerenciam o DOM — nenhum estado de negócio aqui.
  // ══════════════════════════════════════════════════════════

  #mostrarSkeleton() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = false;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = true;
    if (this.#refs.infoFixa) this.#refs.infoFixa.hidden = true;
  }

  #mostrarConteudo() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.conteudo) this.#refs.conteudo.hidden = false;
    if (this.#refs.infoFixa) this.#refs.infoFixa.hidden = false;
  }

  #mostrarErro() {
    if (this.#refs.skeleton) this.#refs.skeleton.hidden = true;
    if (this.#refs.infoFixa) this.#refs.infoFixa.hidden = true;
    if (this.#refs.conteudo) {
      this.#refs.conteudo.hidden    = false;
      this.#refs.conteudo.innerHTML = '<p class="bp-erro">N\u00e3o foi poss\u00edvel carregar a barbearia.</p>';
    }
  }

  // ── Animação de boas-vindas ────────────────────────────────

  /** Inicia o dig apenas se houver instância e o elemento estiver vazio. */
  #iniciarDig() {
    if (!this.#dig || !this.#refs.boasVindas) return;
    // Só anima se o texto ainda não foi exibido nesta entrada
    if (this.#refs.boasVindas.textContent.trim() === '') {
      this.#dig.iniciar();
    }
  }

  /** Para o dig SEM apagar o texto — apenas cancela cursor se ainda em andamento. */
  #pararDig() {
    if (!this.#dig || !this.#refs.boasVindas) return;
    const el = this.#refs.boasVindas;
    // Preserva o texto já digitado: guarda, para (que limpa), restaura
    const textoAtual = el.textContent;
    this.#dig.parar();
    el.textContent = textoAtual;
    el.classList.remove('dig-ativo');
  }
}
