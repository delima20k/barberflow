'use strict';

// =============================================================
// BarbeariaPage.js — Perfil público de uma barbearia (POO, Singleton)
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
