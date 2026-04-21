'use strict';

// =============================================================
// MinhaBarbeariaPage.js — Tela "Minha Barbearia"
//
// Responsabilidades:
//  • Exibir KPIs, stories ativos, portfólio e serviços/produtos.
//  • 1º story-card = card de upload com ícone de engrenagem.
//    - Dono da barbearia: até 3 vídeos/dia.
//    - Barbeiro convidado: até 1 vídeo/dia.
//  • Botão "Mais" → painel de configurações (slide lateral).
//    - Upload capa, upload logo circular, nome, serviços/produtos.
//    - Salva no Supabase.
//
// Dependências: BarbershopRepository.js, BarbershopService.js,
//               AuthService.js, SupabaseService.js,
//               NotificationService.js
// =============================================================

class MinhaBarbeariaPage {

  // ── Estado ─────────────────────────────────────────────────
  #telaEl       = null;
  #panelEl      = null;
  #overlayEl    = null;
  #carregou     = false;
  #barbershopId = null;
  #isOwner      = false;   // true se o usuário é dono da barbearia
  #refs         = {};

  constructor() {}

  // ── Ponto de entrada ────────────────────────────────────────

  bind() {
    this.#telaEl   = document.getElementById('tela-minha-barbearia');
    this.#panelEl  = document.getElementById('mb-config-panel');
    this.#overlayEl= document.getElementById('mb-config-overlay');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindEventos();

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa && !this.#carregou) this.#carregar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── DOM refs ────────────────────────────────────────────────

  #cacheRefs() {
    const q = id => document.getElementById(id);
    this.#refs = {
      nome:          q('mb-nome'),
      storyNome:     q('mb-story-nome'),
      storyAddr:     q('mb-story-addr'),
      coverImg:      q('mb-cover-img'),
      coverInput:    q('mb-cover-input'),
      uploadOverlay: q('mb-upload-overlay'),
      quotaTxt:      q('mb-quota-txt'),
      gearBtn:       q('mb-gear-btn'),
      maisBtn:       q('mb-mais-btn'),
      slot2:         q('mb-story-slot-2'),
      slot3:         q('mb-story-slot-3'),
      locBanner:     q('mb-loc-banner'),
      kpiRating:     q('mb-kpi-rating'),
      kpiClientes:   q('mb-kpi-clientes'),
      kpiPortfolio:  q('mb-kpi-portfolio'),
      kpiLikes:      q('mb-kpi-likes'),
      portfolioGrid: q('mb-portfolio-grid'),
      servicosLista: q('mb-servicos-lista'),
      // Config panel
      cfgFechar:     q('mb-config-fechar'),
      cfgCapaInput:  q('mb-cfg-capa-input'),
      cfgCapaImg:    q('mb-cfg-capa-img'),
      cfgLogoInput:  q('mb-cfg-logo-input'),
      cfgLogoImg:    q('mb-cfg-logo-img'),
      cfgNome:       q('mb-cfg-nome'),
      cfgProdutos:   q('mb-cfg-produtos-lista'),
      cfgAddProd:    q('mb-cfg-add-produto'),
      cfgSalvar:     q('mb-config-salvar'),
      cfgMsg:        q('mb-config-msg'),
    };
  }

  // ── Eventos ─────────────────────────────────────────────────

  #bindEventos() {
    this.#refs.maisBtn?.addEventListener('click', () => this.#abrirConfig());
    this.#refs.gearBtn?.addEventListener('click', e => {
      e.stopPropagation();
      this.#abrirConfig();
    });
    this.#overlayEl?.addEventListener('click', () => this.#fecharConfig());
    this.#refs.cfgFechar?.addEventListener('click', () => this.#fecharConfig());
    this.#refs.coverInput?.addEventListener('change', e => this.#onUploadMidia(e));
    this.#refs.uploadOverlay?.addEventListener('click', () => {
      this.#refs.coverInput?.click();
    });
    this.#refs.cfgCapaInput?.addEventListener('change', e => this.#onUploadCapa(e));
    this.#refs.cfgLogoInput?.addEventListener('change', e => this.#onUploadLogo(e));
    this.#refs.cfgAddProd?.addEventListener('click', () => this.#adicionarLinhaProduto());
    this.#refs.cfgSalvar?.addEventListener('click', () => this.#salvarConfiguracoes());
  }

  // ── Carregamento principal ───────────────────────────────────

  async #carregar() {
    this.#carregou = true;
    this.#mostrarSkeleton();

    try {
      const perfil = AuthService.getPerfil();
      if (!perfil?.id) return;

      const shop = await MinhaBarbeariaPage.#fetchMinhaBarbearia(perfil.id);
      if (!shop) { this.#mostrarVazio(); return; }

      this.#barbershopId = shop.id;
      this.#isOwner      = shop.owner_id === perfil.id;

      const [servicos, portfolio, stories, quotaHoje] = await Promise.all([
        MinhaBarbeariaPage.#fetchServicos(shop.id),
        MinhaBarbeariaPage.#fetchPortfolio(shop.id),
        MinhaBarbeariaPage.#fetchStoriesAtivos(shop.id),
        MinhaBarbeariaPage.#fetchQuotaHoje(perfil.id, shop.id),
      ]);

      this.#renderCabecalho(shop);
      this.#renderStoryCards(stories, shop, quotaHoje, perfil.id);
      this.#renderLocBanner(shop);
      this.#renderKpis(shop, portfolio.length);
      this.#renderPortfolio(portfolio);
      this.#renderServicos(servicos);
      this.#preencherConfigPanel(shop, servicos);

    } catch (err) {
      console.error('[MinhaBarbeariaPage] erro:', err);
      this.#mostrarErro();
    }
  }

  // ── Fetchers ────────────────────────────────────────────────
  static async #fetchMinhaBarbearia(ownerId) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, owner_id, name, address, city, logo_path, cover_path, is_open, rating_avg, rating_count, likes_count, latitude, longitude')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
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
    } catch (_) { return []; }
  }

  static async #fetchStoriesAtivos(barbershopId) {
    try {
      const agora = new Date().toISOString();
      const { data, error } = await SupabaseService.client
        .from('stories')
        .select('id, owner_id, storage_path, thumbnail_path, media_type, views_count, created_at')
        .eq('barbershop_id', barbershopId)
        .gt('expires_at', agora)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) return [];
      return data ?? [];
    } catch (_) { return []; }
  }

  static async #fetchQuotaHoje(ownerId, barbershopId) {
    try {
      const hoje = new Date();
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString();

      const { count, error } = await SupabaseService.client
        .from('stories')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('barbershop_id', barbershopId)
        .gte('created_at', inicio);

      if (error) return 0;
      return count ?? 0;
    } catch (_) { return 0; }
  }

  // ── Renders ─────────────────────────────────────────────────

  #renderCabecalho(shop) {
    const { nome, storyNome, storyAddr } = this.#refs;

    if (nome)      nome.textContent      = shop.name ?? '';
    if (storyNome) storyNome.textContent = shop.name ?? 'Minha Barbearia';
    if (storyAddr) storyAddr.textContent = [shop.address, shop.city].filter(Boolean).join(' · ');

    if (shop.cover_path) {
      const url = SupabaseService.getLogoUrl(shop.cover_path);
      if (url && this.#refs.coverImg) this.#refs.coverImg.src = url;
    } else if (shop.logo_path) {
      const url = SupabaseService.getLogoUrl(shop.logo_path);
      if (url && this.#refs.coverImg) this.#refs.coverImg.src = url;
    }
  }

  #renderStoryCards(stories, shop, quotaHoje, perfilId) {
    const maxQuota = this.#isOwner ? 3 : 1;
    const restante = Math.max(0, maxQuota - quotaHoje);

    if (this.#refs.quotaTxt) {
      this.#refs.quotaTxt.textContent = restante > 0
        ? `${restante} vídeo${restante > 1 ? 's' : ''} restante${restante > 1 ? 's' : ''} hoje`
        : 'Limite diário atingido';
    }
    if (this.#refs.coverInput) {
      this.#refs.coverInput.disabled = restante === 0;
    }
    if (this.#refs.uploadOverlay) {
      this.#refs.uploadOverlay.style.opacity       = restante === 0 ? '0.45' : '';
      this.#refs.uploadOverlay.style.pointerEvents = restante === 0 ? 'none'  : '';
    }

    const slots = [this.#refs.slot2, this.#refs.slot3];
    slots.forEach((slot, i) => {
      if (!slot) return;
      const story = stories[i];
      if (!story) return;

      const thumbUrl = story.thumbnail_path
        ? SupabaseService.getLogoUrl(story.thumbnail_path)
        : null;
      const badgeSrc = this.#refs.coverImg?.src || '/shared/img/Logo01.png';

      slot.innerHTML = `
        <div class="story-video-wrap">
          ${thumbUrl
            ? `<img src="${thumbUrl}" alt="story" style="width:100%;height:100%;object-fit:cover;"
                    onerror="this.style.display='none'">`
            : `<div class="mb-slot-vazio">${story.media_type === 'video' ? '▶' : '📸'}</div>`
          }
          <div class="story-play-btn">▶</div>
          <img class="story-shop-badge" src="${badgeSrc}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="story-card-info">
          <p class="story-card-name">${shop.name ?? ''}</p>
          <p class="story-card-addr">${new Date(story.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
      `;
    });
  }

  #renderKpis(shop, portfolioCount) {
    const { kpiRating, kpiClientes, kpiLikes, kpiPortfolio } = this.#refs;
    if (kpiRating)    kpiRating.textContent    = Number(shop.rating_avg  ?? 0).toFixed(1);
    if (kpiClientes)  kpiClientes.textContent  = String(shop.rating_count ?? 0);
    if (kpiLikes)     kpiLikes.textContent     = MinhaBarbeariaPage.#formatarNumero(shop.likes_count ?? 0);
    if (kpiPortfolio) kpiPortfolio.textContent = String(portfolioCount);
  }

  #renderPortfolio(lista) {
    const grid = this.#refs.portfolioGrid;
    if (!grid) return;

    if (!lista.length) {
      grid.innerHTML = `<div class="port-item port-item--vazio">
        <span style="font-size:1rem;color:var(--text-muted);">Sem fotos ainda</span>
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
             onerror="this.outerHTML='<div class=port-item>✂️</div>'">
      </div>`;
    }).join('');
  }

  #renderServicos(lista) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="agenda-vazio">Nenhum serviço cadastrado. Configure no painel "Mais".</p>';
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

  // ── Painel de configurações ──────────────────────────────────

  #abrirConfig() {
    if (!this.#panelEl) return;
    this.#panelEl.classList.add('mb-config-panel--aberto');
    this.#panelEl.setAttribute('aria-hidden', 'false');
    if (this.#overlayEl) this.#overlayEl.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  #fecharConfig() {
    if (!this.#panelEl) return;
    this.#panelEl.classList.remove('mb-config-panel--aberto');
    this.#panelEl.setAttribute('aria-hidden', 'true');
    if (this.#overlayEl) this.#overlayEl.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  #preencherConfigPanel(shop, servicos) {
    if (this.#refs.cfgNome) this.#refs.cfgNome.value = shop.name ?? '';

    if (shop.cover_path && this.#refs.cfgCapaImg) {
      const url = SupabaseService.getLogoUrl(shop.cover_path);
      if (url) this.#refs.cfgCapaImg.src = url;
    }
    if (shop.logo_path && this.#refs.cfgLogoImg) {
      const url = SupabaseService.getLogoUrl(shop.logo_path);
      if (url) this.#refs.cfgLogoImg.src = url;
    }

    const lista = this.#refs.cfgProdutos;
    if (!lista) return;
    lista.innerHTML = '';
    servicos.forEach(s => this.#adicionarLinhaProduto(s));
  }

  #adicionarLinhaProduto(produto = null) {
    const lista = this.#refs.cfgProdutos;
    if (!lista) return;

    const row = document.createElement('div');
    row.className = 'mb-cfg-produto-row';
    row.innerHTML = `
      <input type="text"   class="mb-cfg-prod-nome"  placeholder="Nome do serviço / produto"
             value="${produto ? MinhaBarbeariaPage.#escapeAttr(produto.name) : ''}" maxlength="60">
      <input type="number" class="mb-cfg-prod-preco" placeholder="Preço (R$)" min="0" step="0.01"
             value="${produto ? Number(produto.price).toFixed(2) : ''}">
      <input type="number" class="mb-cfg-prod-dur"   placeholder="Duração (min)" min="1"
             value="${produto ? (produto.duration_min ?? '') : ''}">
      <button class="mb-cfg-prod-remove" aria-label="Remover">✕</button>
    `;
    row.querySelector('.mb-cfg-prod-remove').addEventListener('click', () => row.remove());
    if (produto?.id) row.dataset.produtoId = produto.id;
    lista.appendChild(row);
  }

  // ── Salvar configurações ─────────────────────────────────────

  async #salvarConfiguracoes() {
    if (!this.#barbershopId) return;

    const btn = this.#refs.cfgSalvar;
    const msg = this.#refs.cfgMsg;
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    if (msg) msg.textContent = '';

    try {
      const nome = this.#refs.cfgNome?.value?.trim();
      if (nome) {
        const { error } = await SupabaseService.barbershops()
          .update({ name: nome })
          .eq('id', this.#barbershopId);
        if (error) throw error;
      }

      await this.#salvarProdutos();

      if (msg) msg.textContent = '✅ Alterações salvas!';
      if (nome) {
        if (this.#refs.nome)      this.#refs.nome.textContent      = nome;
        if (this.#refs.storyNome) this.#refs.storyNome.textContent = nome;
      }
      setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
    } catch (err) {
      console.error('[MinhaBarbeariaPage] salvarConfiguracoes erro:', err);
      if (msg) msg.textContent = '❌ Erro ao salvar. Tente novamente.';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
    }
  }

  async #salvarProdutos() {
    const lista = this.#refs.cfgProdutos;
    if (!lista) return;

    const upserts = [];
    lista.querySelectorAll('.mb-cfg-produto-row').forEach(row => {
      const nome  = row.querySelector('.mb-cfg-prod-nome')?.value?.trim();
      const preco = parseFloat(row.querySelector('.mb-cfg-prod-preco')?.value || '0');
      const dur   = parseInt(row.querySelector('.mb-cfg-prod-dur')?.value || '30', 10);
      if (!nome) return;

      const entry = {
        barbershop_id: this.#barbershopId,
        name:          nome,
        price:         preco,
        duration_min:  dur,
        is_active:     true,
      };
      if (row.dataset.produtoId) entry.id = row.dataset.produtoId;
      upserts.push(entry);
    });

    if (!upserts.length) return;

    const { error } = await SupabaseService.services()
      .upsert(upserts, { onConflict: 'id' });
    if (error) throw error;
  }

  // ── Upload de mídia (vídeo/imagem) ───────────────────────────

  async #onUploadMidia(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    if (file.size > 30 * 1024 * 1024) {
      NotificationService?.mostrarToast('Limite', 'O arquivo deve ter no máximo 30 MB.', 'sistema');
      return;
    }

    const perfil = AuthService.getPerfil();
    const quota  = await MinhaBarbeariaPage.#fetchQuotaHoje(perfil.id, this.#barbershopId);
    if (quota >= (this.#isOwner ? 3 : 1)) {
      NotificationService?.mostrarToast('Limite diário', 'Você atingiu o limite de postagens hoje.', 'sistema');
      return;
    }

    const overlay = this.#refs.uploadOverlay;
    if (overlay) overlay.innerHTML = '<span class="mb-upload-icon">⏳</span><span class="mb-upload-txt">Enviando…</span>';

    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `stories/videos/${perfil.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await SupabaseService.client.storage
        .from('media')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await SupabaseService.client
        .from('stories')
        .insert({
          owner_id:      perfil.id,
          barbershop_id: this.#barbershopId,
          storage_path:  path,
          media_type:    file.type.startsWith('video') ? 'video' : 'image',
          expires_at:    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      if (dbErr) throw dbErr;

      NotificationService?.mostrarToast('Publicado', 'Seu story foi publicado por 24h!', 'sistema');
      this.#carregou = false;
      this.#carregar();

    } catch (err) {
      console.error('[MinhaBarbeariaPage] onUploadMidia erro:', err);
      NotificationService?.mostrarToast('Erro', 'Falha ao enviar mídia. Tente novamente.', 'sistema');
      if (overlay) overlay.innerHTML = `
        <span class="mb-upload-icon">📹</span>
        <span class="mb-upload-txt">Postar vídeo</span>
        <span class="mb-quota-txt"></span>
      `;
    }
  }

  // ── Upload de capa ───────────────────────────────────────────

  async #onUploadCapa(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `barbershops/${this.#barbershopId}/cover.${ext}`;

      const { error: upErr } = await SupabaseService.client.storage
        .from('media')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { error: dbErr } = await SupabaseService.barbershops()
        .update({ cover_path: path })
        .eq('id', this.#barbershopId);
      if (dbErr) throw dbErr;

      const url = SupabaseService.getLogoUrl(path);
      if (url) {
        if (this.#refs.cfgCapaImg) this.#refs.cfgCapaImg.src = url;
        if (this.#refs.coverImg)   this.#refs.coverImg.src   = url;
      }
    } catch (err) {
      console.error('[MinhaBarbeariaPage] onUploadCapa erro:', err);
    }
  }

  // ── Upload de logo ───────────────────────────────────────────

  async #onUploadLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !this.#barbershopId) return;

    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `barbershops/${this.#barbershopId}/logo.${ext}`;

      const { error: upErr } = await SupabaseService.client.storage
        .from('media')
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;

      const { error: dbErr } = await SupabaseService.barbershops()
        .update({ logo_path: path })
        .eq('id', this.#barbershopId);
      if (dbErr) throw dbErr;

      const url = SupabaseService.getLogoUrl(path);
      if (url && this.#refs.cfgLogoImg) this.#refs.cfgLogoImg.src = url;
    } catch (err) {
      console.error('[MinhaBarbeariaPage] onUploadLogo erro:', err);
    }
  }

  // ── GPS / CEP ────────────────────────────────────────────────

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

  // ── Helpers ─────────────────────────────────────────────────

  static #formatarNumero(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  static #escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  #mostrarSkeleton() {
    const { kpiRating, kpiClientes, kpiLikes, kpiPortfolio } = this.#refs;
    [kpiRating, kpiClientes, kpiLikes, kpiPortfolio].forEach(el => {
      if (el) el.textContent = '…';
    });
  }

  #mostrarVazio() {
    if (this.#refs.nome) this.#refs.nome.textContent = 'Nenhuma barbearia vinculada';
  }

  #mostrarErro() {
    if (this.#refs.nome) this.#refs.nome.textContent = 'Erro ao carregar';
  }
}
