'use strict';

// =============================================================
// MinhaBarbeariaPage.js — Tela "Minha Barbearia" do app profissional.
// Exibe KPIs reais (rating, likes, clientes), portfólio e serviços
// da barbearia vinculada ao profissional logado.
//
// Dependências: BarbershopRepository.js, AppointmentRepository.js,
//               AuthService.js, SupabaseService.js
// =============================================================

class MinhaBarbeariaPage {

  #telaEl        = null;
  #carregou      = false;
  #barbershopId  = null;

  // Refs DOM (substituem conteúdo estático do HTML)
  #refs = {};

  constructor() {}

  bind() {
    this.#telaEl = document.getElementById('tela-minha-barbearia');
    if (!this.#telaEl) return;

    // Cache refs (ids injetados pelo HTML atualizado)
    this.#refs = {
      banner:       this.#telaEl.querySelector('#mb-banner'),
      nome:         this.#telaEl.querySelector('#mb-nome'),
      endereco:     this.#telaEl.querySelector('#mb-endereco'),
      badgeStatus:  this.#telaEl.querySelector('#mb-badge-status'),
      kpiRating:    this.#telaEl.querySelector('#mb-kpi-rating'),
      kpiClientes:  this.#telaEl.querySelector('#mb-kpi-clientes'),
      kpiPortfolio: this.#telaEl.querySelector('#mb-kpi-portfolio'),
      kpiLikes:     this.#telaEl.querySelector('#mb-kpi-likes'),
      portfolioGrid:this.#telaEl.querySelector('#mb-portfolio-grid'),
      servicosLista:this.#telaEl.querySelector('#mb-servicos-lista'),
      logoEl:       this.#telaEl.querySelector('#mb-logo'),
      locBanner:    this.#telaEl.querySelector('#mb-loc-banner'),
    };

    // Botão toggle is_open
    const btnToggle = this.#telaEl.querySelector('#mb-toggle-status');
    btnToggle?.addEventListener('click', () => this.#toggleAberto());

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && !this.#carregou) this.#carregar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privados ────────────────────────────────────────────────

  async #carregar() {
    this.#carregou = true;
    this.#mostrarSkeleton();

    try {
      const perfil = AuthService.getPerfil();
      if (!perfil?.id) return;

      // Busca a barbearia do profissional logado
      const shop = await MinhaBarbeariaPage.#fetchMinhaBarbearia(perfil.id);
      if (!shop) {
        this.#mostrarVazio();
        return;
      }
      this.#barbershopId = shop.id;

      // Busca serviços e portfólio em paralelo
      const [servicos, portfolio] = await Promise.all([
        MinhaBarbeariaPage.#fetchServicos(shop.id),
        MinhaBarbeariaPage.#fetchPortfolio(shop.id),
      ]);

      this.#renderBarbershop(shop);
      this.#renderLocBanner(shop);
      this.#renderServicos(servicos);
      this.#renderPortfolio(portfolio, shop);
    } catch (err) {
      console.error('[MinhaBarbeariaPage] erro:', err);
      this.#mostrarErro();
    }
  }

  // ── Fetchers estáticos (sem referência a this) ──────────────

  static async #fetchMinhaBarbearia(ownerId) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, owner_id, name, address, city, logo_path, cover_path, is_open, rating_avg, rating_count, likes_count, latitude, longitude')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = sem resultado
    return data ?? null;
  }

  static async #fetchServicos(barbershopId) {
    const { data, error } = await SupabaseService.services()
      .select('id, name, description, duration_min, price')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  static async #fetchPortfolio(barbershopId) {
    // portfolio_images pode não existir ainda — fallback seguro
    try {
      const { data, error } = await SupabaseService.portfolioImages()
        .select('id, thumbnail_path, title, likes_count')
        .eq('owner_id', barbershopId)
        .eq('owner_type', 'barbershop')
        .eq('status', 'active')
        .order('likes_count', { ascending: false })
        .limit(6);

      if (error) return [];
      return data ?? [];
    } catch (_) {
      return [];
    }
  }

  // ── Renders ─────────────────────────────────────────────────

  #renderBarbershop(shop) {
    const { nome, endereco, badgeStatus, kpiRating, kpiClientes, kpiLikes, logoEl, kpiPortfolio } = this.#refs;

    if (nome)        nome.textContent        = shop.name ?? '—';
    if (endereco)    endereco.textContent    = [shop.address, shop.city].filter(Boolean).join(' · ');
    if (badgeStatus) {
      badgeStatus.textContent = shop.is_open ? 'Aberta' : 'Fechada';
      badgeStatus.className   = `badge ${shop.is_open ? 'verde' : ''}`;
    }
    if (kpiRating)  kpiRating.textContent   = Number(shop.rating_avg  ?? 0).toFixed(1);
    if (kpiLikes)   kpiLikes.textContent    = MinhaBarbeariaPage.#formatarNumero(shop.likes_count ?? 0);
    if (kpiClientes)kpiClientes.textContent = String(shop.rating_count ?? 0);

    if (logoEl && shop.logo_path) {
      const url = SupabaseService.getLogoUrl(shop.logo_path) || '';
      if (url) {
        logoEl.src     = url;
        logoEl.onerror = () => { logoEl.style.display = 'none'; };
      }
    }
  }

  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="agenda-vazio">Nenhum serviço cadastrado.</p>';
      return;
    }

    el.innerHTML = lista.map(s => `
      <div class="barber-row">
        <div class="avatar gold" style="font-size:.95rem;">✂️</div>
        <div class="barber-info">
          <p class="barber-name">${s.name}</p>
          <p class="barber-sub">${s.duration_min} min${s.description ? ' · ' + s.description : ''}</p>
        </div>
        <div class="barber-meta">
          <span style="font-size:.9rem;font-weight:800;color:var(--gold);">
            R$ ${Number(s.price).toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    `).join('');
  }

  #renderPortfolio(lista, shop) {
    const grid  = this.#refs.portfolioGrid;
    const kpiPf = this.#refs.kpiPortfolio;
    if (!grid) return;

    if (kpiPf) kpiPf.textContent = String(lista.length);

    if (!lista.length) {
      grid.innerHTML = `<div class="port-item port-item--vazio">
        <span style="font-size:1rem;color:var(--text-muted);">Sem fotos</span>
      </div>`;
      return;
    }

    grid.innerHTML = lista.map(img => {
      if (!img.thumbnail_path) {
        return `<div class="port-item" title="${img.title ?? ''}">✂️</div>`;
      }
      const url = SupabaseService.getPortfolioThumbUrl(img.thumbnail_path) || '';
      return `<div class="port-item" title="${img.title ?? ''}">
        <img src="${url}" alt="${img.title ?? ''}" loading="lazy"
             style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-sm);"
             onerror="this.outerHTML='✂️'">
      </div>`;
    }).join('');
  }

  // ── Banner de localização ────────────────────────────────────

  #renderLocBanner(shop) {
    const el = this.#refs.locBanner;
    if (!el) return;

    if (shop.latitude && shop.longitude) {
      el.innerHTML = ''; // barbearia já tem localização → sem banner
      return;
    }

    const ownerId = shop.owner_id;
    el.innerHTML = `
      <div class="loc-banner">
        <div class="loc-banner__header">
          <span class="loc-banner__icon">📍</span>
          <div>
            <p class="loc-banner__titulo">Localização não configurada</p>
            <p class="loc-banner__sub">Sua barbearia não aparece no mapa dos clientes. Defina agora.</p>
          </div>
        </div>
        <button class="btn btn-gold btn-full" id="mb-btn-gps">Usar minha localização (GPS)</button>
        <div class="loc-banner__cep-row">
          <input type="text" id="mb-cep-input" inputmode="numeric" maxlength="9"
                 placeholder="Ou informe o CEP: 00000-000" class="loc-banner__cep-input">
          <button class="btn btn-outline" id="mb-btn-cep">OK</button>
        </div>
        <p id="mb-loc-msg" class="loc-banner__msg"></p>
      </div>
    `;

    el.querySelector('#mb-btn-gps').addEventListener('click', () => this.#salvarGPS(ownerId));
    el.querySelector('#mb-btn-cep').addEventListener('click', () => {
      const cep = el.querySelector('#mb-cep-input').value;
      this.#salvarCep(ownerId, cep);
    });
    // Máscara simples de CEP
    el.querySelector('#mb-cep-input').addEventListener('input', e => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 8);
      if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
      e.target.value = v;
    });
  }

  async #salvarGPS(ownerId) {
    const msg = document.getElementById('mb-loc-msg');
    const btn = document.getElementById('mb-btn-gps');
    if (btn) { btn.disabled = true; btn.textContent = 'Obtendo posição…'; }

    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
      );
      await BarbershopService.salvarLocalizacaoGPS(ownerId, pos.coords.latitude, pos.coords.longitude);
      if (msg) msg.textContent = '✅ Localização salva! Sua barbearia já aparece no mapa.';
      setTimeout(() => { this.#carregou = false; this.#carregar(); }, 1500);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Usar minha localização (GPS)'; }
      if (msg) msg.textContent = e?.code === 1 ? 'GPS negado. Use o CEP abaixo.' : 'Erro ao obter GPS.';
    }
  }

  async #salvarCep(ownerId, cep) {
    const msg = document.getElementById('mb-loc-msg');
    const btn = document.getElementById('mb-btn-cep');
    cep = (cep ?? '').replace(/\D/g, '');

    if (cep.length !== 8) {
      if (msg) msg.textContent = 'Digite um CEP válido com 8 dígitos.';
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
      await BarbershopService.salvarLocalizacaoCep(ownerId, cep);
      if (msg) msg.textContent = '✅ Localização salva! Sua barbearia já aparece no mapa.';
      setTimeout(() => { this.#carregou = false; this.#carregar(); }, 1500);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'OK'; }
      if (msg) msg.textContent = e?.message ?? 'CEP não encontrado. Verifique e tente novamente.';
    }
  }

  // ── Toggle is_open ──────────────────────────────────────────

  async #toggleAberto() {
    if (!this.#barbershopId) return;

    const badge = this.#refs.badgeStatus;
    const estaAberta = badge?.textContent?.trim() === 'Aberta';

    try {
      const { error } = await SupabaseService.barbershops()
        .update({ is_open: !estaAberta })
        .eq('id', this.#barbershopId);

      if (error) throw error;

      if (badge) {
        badge.textContent = estaAberta ? 'Fechada' : 'Aberta';
        badge.className   = `badge ${estaAberta ? '' : 'verde'}`;
      }
    } catch (err) {
      console.error('[MinhaBarbeariaPage] toggleAberto erro:', err);
      NotificationService?.mostrarToast('Erro', 'Não foi possível atualizar status.', 'sistema');
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  static #formatarNumero(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  #mostrarSkeleton() {
    const { kpiRating, kpiClientes, kpiLikes, kpiPortfolio } = this.#refs;
    [kpiRating, kpiClientes, kpiLikes, kpiPortfolio].forEach(el => {
      if (el) el.textContent = '…';
    });
  }

  #mostrarVazio() {
    const { nome } = this.#refs;
    if (nome) nome.textContent = 'Nenhuma barbearia vinculada';
  }

  #mostrarErro() {
    const { nome } = this.#refs;
    if (nome) nome.textContent = 'Erro ao carregar';
  }
}
