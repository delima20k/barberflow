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
//               FonteSalao.js, InputValidator.js, LoggerService.js,
//               CacheManager.js, StateManager.js, ResourceLoader.js,
//               NavigationManager.js
// =============================================================

class BarbeariaPage {

  // ── Estado ────────────────────────────────────────────────
  #telaEl      = null;
  #shopId      = null;   // UUID da barbearia atual
  #shopIdCache = null;   // último ID renderizado (evita re-fetch na volta)
  #carregando  = false;  // mutex contra fetches paralelos
  #dig         = null;   // instância DigText de boas-vindas
  #digFila      = null;   // instância DigText da seção de barbeiros
  #servicos     = [];     // serviços em cache para os handlers de cadeira
  #shopData     = null;   // objeto completo da barbearia atual

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
   *
   * Fluxo (pre-render antes da animação):
   *   1. Inicia preload dos dados em background
   *   2. Aguarda conclusão do preload (máx. 600 ms) enquanto a tela ainda está fora de cena
   *   3. Se cache populado → renderiza na tela oculta
   *   4. ENTÃO navega → tela entra na tela JÁ com conteúdo pronto
   *   5. Se preload demorou demais → navega com skeleton; #carregar() termina o trabalho
   *
   * @param {string} id — UUID da barbearia
   */
  async abrirPorId(id) {
    if (!InputValidator.uuid(id).ok) return;

    // Inicia troca de contexto + preload imediato
    NavigationManager.beforeNavigate(id);
    this.#shopId = id;

    // Limpa conteúdo antigo e exibe skeleton na tela (ainda oculta)
    this.#limparConteudo();
    this.#mostrarSkeleton();

    // Aguarda preload ou timeout de 600 ms (não bloqueia além disso)
    await Promise.race([
      NavigationManager.awaitPreload(id),
      new Promise(r => setTimeout(r, 600)),
    ]);

    // Renderiza na tela oculta se os dados chegaram a tempo e o contexto
    // não mudou (ex: usuário abriu outra barbearia durante o await)
    if (!StateManager.isContextChanged(id)) {
      const shop      = CacheManager.get(`${id}:shop`);
      const servicos  = CacheManager.get(`${id}:servicos`);
      const portfolio = CacheManager.get(`${id}:portfolio`);
      if (shop && servicos && portfolio) {
        this.#renderizar(shop, servicos, portfolio);
        this.#shopIdCache = id;
      }
    }

    // Navega: tela entra já com conteúdo ou com skeleton (se rede lenta)
    const router = (typeof App !== 'undefined' && App)
                || (typeof Pro !== 'undefined' && Pro)
                || null;
    NavigationManager.navigate(() => { if (router) router.nav('barbearia'); });
  }

  // ══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

  /** Faz cache de todos os nós DOM usados pelos renders. */
  #cacheRefs() {
    const q = sel => this.#telaEl.querySelector(sel);
    this.#refs = {
      capaImg:       q('#bp-capa'),
      capaStatus:    q('#bp-capa-status'),
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
      barbeirosScroll: q('#bp-barbeiros-scroll'),
      filaDig:         q('#bp-fila-dig'),
      skeleton:      q('#bp-skeleton'),
      conteudo:      q('#bp-conteudo'),
      boasVindas:    q('#bp-boas-vindas'),
      ctaLogin:      q('#bp-cta-login'),
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
    if (this.#shopId === this.#shopIdCache) { this.#mostrarConteudo(); return; }

    // Captura o ID antes de qualquer await — protege contra race condition
    const fetchId = this.#shopId;

    // Fast path (síncrono): cache completo disponível — renderiza sem rede nem mutex
    const shopFast      = CacheManager.get(`${fetchId}:shop`);
    const servicosFast  = CacheManager.get(`${fetchId}:servicos`);
    const portfolioFast = CacheManager.get(`${fetchId}:portfolio`);

    if (shopFast && servicosFast && portfolioFast) {
      if (StateManager.isContextChanged(fetchId)) return;
      this.#renderizar(shopFast, servicosFast, portfolioFast);
      this.#shopIdCache = fetchId;
      return;
    }

    // Async path: mutex ativo antes de qualquer await
    this.#carregando = true;
    try {
      // Aguarda o pré-carregamento iniciado em abrirPorId() durante a animação.
      // Se concluiu: cache estará populado → renderiza sem nova requisição de rede.
      // Se falhou ou inexistente: awaitPreload sempre resolve → fallback ao fetch direto.
      await NavigationManager.awaitPreload(fetchId);

      // Stale-check: usuário pode ter trocado de barbearia durante o await
      if (StateManager.isContextChanged(fetchId)) return;

      // Verifica cache novamente após aguardar o preload
      const shop      = CacheManager.get(`${fetchId}:shop`);
      const servicos  = CacheManager.get(`${fetchId}:servicos`);
      const portfolio = CacheManager.get(`${fetchId}:portfolio`);

      if (shop && servicos && portfolio) {
        this.#renderizar(shop, servicos, portfolio);
        this.#shopIdCache = fetchId;
        return;
      }

      // Fallback: preload falhou ou não existia → busca direto na rede
      const [shopNet, servicosNet, portfolioNet] = await Promise.all([
        BarbershopRepository.getById(fetchId),
        BarbeariaPage.#fetchServicos(fetchId),
        BarbeariaPage.#fetchPortfolio(fetchId),
      ]);

      if (StateManager.isContextChanged(fetchId)) return;

      if (!shopNet) { this.#mostrarErro(); return; }

      CacheManager.set(`${fetchId}:shop`,      shopNet,      5 * 60 * 1000);
      CacheManager.set(`${fetchId}:servicos`,  servicosNet,  5 * 60 * 1000);
      CacheManager.set(`${fetchId}:portfolio`, portfolioNet, 5 * 60 * 1000);

      this.#renderizar(shopNet, servicosNet, portfolioNet);
      this.#shopIdCache = fetchId;
    } catch (err) {
      if (!StateManager.isContextChanged(fetchId)) {
        LoggerService.error('[BarbeariaPage] erro ao carregar:', err);
        this.#mostrarErro();
      }
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

  /**
   * Busca os barbeiros vinculados ao salão.
   * Garante que o dono aparecerá primeiro.
   * @param {object} shop — objeto completo com .id e .owner_id
   * @returns {Promise<object[]>}
   */
  static async #fetchBarbeiros(shop) {
    return BarbershopRepository.getBarbersByShop(shop.id, shop.owner_id ?? null);
  }

  /**
   * Cria uma row de barbeiro: BarbeiroCard + cadeira de produção + cadeiras de fila.
   * @param {object}      opts
   * @param {object}      opts.barbeiro
   * @param {boolean}     opts.isOwner
   * @param {object[]}    opts.filaEntradas       entradas filtradas para este barbeiro
   * @param {boolean}     opts.podeInteragir
   * @param {Function|null} opts.onCadeiraVaziaClick  callback de clique em cadeira vazia
   * @returns {HTMLDivElement}
   */
  static #criarRow({ barbeiro, isOwner, filaEntradas, podeInteragir, onCadeiraVaziaClick }) {
    const row = document.createElement('div');
    row.className = 'cdr-row';
    if (barbeiro.id) row.dataset.barberId = barbeiro.id;

    row.appendChild(BarbeiroCard.criar({
      nome:       barbeiro.full_name ?? 'Barbeiro',
      avatarPath: barbeiro.avatar_path ?? null,
      updatedAt:  barbeiro.updated_at ?? null,
      isOwner,
    }));

    const wrap = document.createElement('div');
    wrap.className = 'cdr-cadeiras-wrap';

    // Cadeira de produção (atendimento)
    const emServico = filaEntradas.find(e => e.status === 'in_service') ?? null;
    wrap.appendChild(Cadeira.criar({
      tipo:           'producao',
      entrada:        emServico,
      posicao:        0,
      podeInteragir:  podeInteragir && !emServico,
      onClick:        (!emServico && onCadeiraVaziaClick) ? onCadeiraVaziaClick : null,
    }));

    // Cadeiras de fila (até 3 posições visíveis)
    const naFila   = filaEntradas.filter(e => e.status === 'waiting');
    const filaWrap = document.createElement('div');
    filaWrap.className = 'cdr-fila-wrap';
    for (let i = 0; i < 3; i++) {
      const e = naFila[i] ?? null;
      filaWrap.appendChild(Cadeira.criar({
        tipo:          'fila',
        entrada:       e,
        posicao:       i + 1,
        podeInteragir: podeInteragir && !e,
        onClick:       (!e && onCadeiraVaziaClick) ? onCadeiraVaziaClick : null,
      }));
    }
    wrap.appendChild(filaWrap);
    row.appendChild(wrap);
    return row;
  }

  /**
   * Row skeleton para exibição enquanto dados carregam.
   * @returns {HTMLDivElement}
   */
  static #criarSkeletonRow() {
    const row = document.createElement('div');
    row.className = 'cdr-row cdr-row--skel';
    row.setAttribute('aria-hidden', 'true');
    row.appendChild(BarbeiroCard.criarSkeleton());
    const wrap = document.createElement('div');
    wrap.className = 'cdr-cadeiras-wrap';
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'cdr-cadeira cdr-cadeira--skel';
      wrap.appendChild(c);
    }
    row.appendChild(wrap);
    return row;
  }

  // ══════════════════════════════════════════════════════════
  // RENDERS — cada método tem responsabilidade única (SRP)
  // ══════════════════════════════════════════════════════════

  #renderizar(shop, servicos, portfolio) {
    this.#servicos = servicos;
    this.#shopData = shop;
    this.#renderCapa(shop);
    this.#renderInfo(shop);
    this.#renderAcoes(shop);
    this.#renderServicos(servicos);
    this.#renderPortfolio(portfolio);
    this.#renderBarbeiros(shop); // fire-and-forget: preenche carousel async
    this.#mostrarConteudo();
  }

  /**
   * Preenche a section de barbeiros com rows interativas.
   * Cada row contém BarbeiroCard + cadeiras de produção e fila.
   * Clientes autenticados podem clicar em cadeiras vazias para entrar na fila.
   * Chamado fire-and-forget (e no re-render pós-entrada).
   * @param {object} shop — registro completo da barbearia (inclui owner_id)
   */
  async #renderBarbeiros(shop) {
    const el = this.#refs.barbeirosScroll;
    if (!el) return;

    // Skeleton imediato: 3 rows placeholder
    el.innerHTML = '';
    for (let i = 0; i < 3; i++) el.appendChild(BarbeariaPage.#criarSkeletonRow());

    const cacheKey = `${shop.id}:barbeiros`;
    let barbeiros = CacheManager.get(cacheKey);
    let filaAtiva = [];

    try {
      const [b, f] = await Promise.all([
        barbeiros
          ? Promise.resolve(barbeiros)
          : BarbeariaPage.#fetchBarbeiros(shop).then(data => {
              CacheManager.set(cacheKey, data, 5 * 60 * 1000);
              return data;
            }),
        FilaController.getFilaAtiva(shop.id),
      ]);
      barbeiros = b;
      filaAtiva  = f;
    } catch (err) {
      LoggerService.warn('[BarbeariaPage] #renderBarbeiros:', err?.message);
      barbeiros = barbeiros ?? [];
      filaAtiva  = [];
    }

    // Stale-check: usuário pode ter navegado para outra barbearia durante o await
    if (this.#shopId !== shop.id) return;

    if (!barbeiros.length) {
      el.innerHTML = '';
      const secao = el.closest('.bp-barbeiros-secao');
      if (secao) secao.hidden = true;
      return;
    }

    const podeInteragir = ClienteController.podeInteragir();

    el.innerHTML = '';
    for (const b of barbeiros) {
      const filaB = filaAtiva.filter(e => e.professional?.id === b.id);
      el.appendChild(BarbeariaPage.#criarRow({
        barbeiro:           b,
        isOwner:            b.id === shop.owner_id,
        filaEntradas:       filaB,
        podeInteragir,
        onCadeiraVaziaClick: podeInteragir
          ? () => this.#onCadeiraClick(b.id)
          : null,
      }));
    }

    // Inicia animação DigText na seção de barbeiros
    if (typeof DigText !== 'undefined' && this.#refs.filaDig) {
      this.#refs.filaDig.textContent = '';
      const TEXTO_FILA = 'Escolha um barbeiro de sua preferência e entre para a fila — seu corte está a um toque de distância.';
      this.#digFila = new DigText(this.#refs.filaDig, [TEXTO_FILA], { velocidade: 28, loop: false });
      this.#digFila.iniciar();
    }
  }

  /**
   * Handler de clique em uma cadeira vazia.
   * Abre o modal de seleção de serviços e registra o cliente na fila.
   * @param {string} professionalId UUID do barbeiro da cadeira
   */
  async #onCadeiraClick(professionalId) {
    if (!ClienteController.podeInteragir()) return;

    const serviceIds = await ModalController.abrirSelecaoServicos({ servicos: this.#servicos });
    if (!serviceIds?.length) return;

    try {
      await ClienteController.entrarNaFila({
        barbershopId:   this.#shopId,
        professionalId,
        serviceIds,
      });
      NotificationService.mostrarToast(
        'Na fila!',
        'Você entrou na fila. Aguarde sua vez.',
        NotificationService.TIPOS.SISTEMA,
      );
      if (this.#shopData) await this.#renderBarbeiros(this.#shopData);
    } catch (err) {
      LoggerService.error('[BarbeariaPage] erro ao entrar na fila:', err);
      NotificationService.mostrarToast(
        'Erro',
        err?.message ?? 'Não foi possível entrar na fila.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  /** Capa e logo da barbearia. Usa .src — não innerHTML, sem risco XSS. */
  #renderCapa(shop) {
    if (this.#refs.capaImg) {
      const path = shop.cover_path ?? shop.logo_path;
      // ResourceLoader.loadImage injeta ?v={bust} para evitar cache de imagem antiga
      if (path) this.#refs.capaImg.src = ResourceLoader.loadImage(ApiService.getLogoUrl(path));
    }
    if (this.#refs.logoImg && shop.logo_path) {
      this.#refs.logoImg.src = ResourceLoader.loadImage(ApiService.getLogoUrl(shop.logo_path));
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

    // ── Boas-vindas + CTA de login ──────────────────────────
    if (this.#refs.boasVindas) {
      const isLogado  = typeof AppState !== 'undefined' && AppState.get('isLogado');
      const perfil    = typeof AppState !== 'undefined' ? AppState.get('perfil') : null;
      const nomeUser  = (perfil?.full_name ?? '').trim() || 'visitante';
      const nomeLoja  = shop.name ?? 'esta barbearia';
      const cr        = shop.close_reason?.toLowerCase() ?? null;

      let textoPlano;
      if (cr === 'almoco') {
        textoPlano = `Ei, ${nomeUser}! 🍽️ Os barbeiros da ${nomeLoja} estão no almoço — mas a fila está aberta! Entre agora e garanta o próximo corte.`;
      } else if (cr === 'janta') {
        textoPlano = `Ei, ${nomeUser}! 🌙 Os barbeiros da ${nomeLoja} estão jantando — mas você pode entrar na fila agora e ser o próximo a ser atendido!`;
      } else {
        textoPlano = `Olá, ${isLogado ? nomeUser : 'visitante'} — Bem-vindo à ${nomeLoja}`;
      }

      this.#refs.boasVindas.textContent = textoPlano;

      if (typeof DigText !== 'undefined') {
        this.#refs.boasVindas.textContent = '';
        this.#dig = new DigText(this.#refs.boasVindas, [textoPlano], { velocidade: 36, loop: false });
        this.#iniciarDig();
      }
    }

    // ── CTA de login/cadastro (apenas para visitantes) ──────
    if (this.#refs.ctaLogin) {
      const isLogado = typeof AppState !== 'undefined' && AppState.get('isLogado');
      if (isLogado) {
        this.#refs.ctaLogin.hidden = true;
        this.#refs.ctaLogin.textContent = '';
      } else {
        const router = (typeof App !== 'undefined' && App) || null;
        this.#refs.ctaLogin.hidden = false;
        this.#refs.ctaLogin.textContent =
          '✂️ Faça login ou cadastre-se — agende seu corte, favorite barbearias e aproveite o BarberFlow!';
        // Listener único por abertura de tela
        this.#refs.ctaLogin.onclick = () => { if (router) router.nav('login'); };
      }
    }

    if (this.#refs.endereco) {
      const addr = [shop.address, shop.city, shop.state].filter(Boolean).join(', ');
      this.#refs.endereco.textContent = addr;
    }
    if (this.#refs.badge || this.#refs.capaStatus) {
      const cr        = shop.close_reason ?? null;
      const badgeLabel = StatusFechamentoModal.labelStatus(shop.is_open, cr);
      const badgeVar   = StatusFechamentoModal.classBadge(shop.is_open, cr);
      if (this.#refs.badge) {
        this.#refs.badge.textContent = badgeLabel;
        this.#refs.badge.className   = `bp-badge ${badgeVar}`;
      }
      if (this.#refs.capaStatus) {
        this.#refs.capaStatus.textContent = badgeLabel;
        this.#refs.capaStatus.className   = `bp-capa-status bp-badge ${badgeVar}`;
        this.#refs.capaStatus.hidden      = false;
      }
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
      // Na página de detalhe o toggle é completo (favoritar e desfavoritar)
      const ativo = BarbershopService.isFavorito(this.#shopId);
      this.#refs.favBtn.classList.toggle('ativo', ativo);
      const ico = this.#refs.favBtn.querySelector('.cfb-ico');
      if (ico) ico.textContent = ativo ? '⭐' : '☆';
      this.#refs.favBtn.setAttribute('aria-pressed', String(ativo));
      this.#refs.favBtn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      this.#refs.favBtn.disabled = false;
      this.#refs.favBtn.removeAttribute('aria-disabled');
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

  /**
   * Limpa visualmente o conteúdo da barbearia anterior.
   * Chamado em abrirPorId() — antes do skeleton — para garantir que
   * nenhum dado antigo fica visível enquanto os novos carregam.
   */
  #limparConteudo() {
    if (this.#refs.capaImg)  { this.#refs.capaImg.src  = ''; }
    if (this.#refs.logoImg)  { this.#refs.logoImg.src  = ''; this.#refs.logoImg.alt = ''; }
    if (this.#refs.nome)     { this.#refs.nome.textContent     = ''; }
    if (this.#refs.endereco) { this.#refs.endereco.textContent = ''; }
    if (this.#refs.rating)   { this.#refs.rating.textContent   = ''; }
    if (this.#refs.likes)    { this.#refs.likes.textContent    = ''; }
    if (this.#refs.since)    { this.#refs.since.textContent    = ''; }
    if (this.#refs.servicosLista) { this.#refs.servicosLista.innerHTML = ''; }
    if (this.#refs.portfolioGrid) { this.#refs.portfolioGrid.innerHTML = ''; }
    if (this.#refs.barbeirosScroll) { this.#refs.barbeirosScroll.innerHTML = ''; }
    if (this.#refs.filaDig)         { this.#refs.filaDig.textContent = ''; }
    if (this.#digFila)              { this.#digFila.parar?.(); this.#digFila = null; }
    if (this.#refs.boasVindas) { this.#refs.boasVindas.textContent = ''; }
    if (this.#refs.ctaLogin)   { this.#refs.ctaLogin.hidden = true; this.#refs.ctaLogin.textContent = ''; }
    if (this.#refs.favBtn) {
      this.#refs.favBtn.dataset.barbershopId = '';
      this.#refs.favBtn.classList.remove('ativo');
      const ico = this.#refs.favBtn.querySelector('.cfb-ico');
      if (ico) ico.textContent = '☆';
      this.#refs.favBtn.setAttribute('aria-pressed', 'false');
      this.#refs.favBtn.title = 'Adicionar aos favoritos';
      this.#refs.favBtn.disabled = false;
      this.#refs.favBtn.removeAttribute('aria-disabled');
    }
    // Reseta o dig para que a nova barbearia inicie a animação do zero
    this.#pararDig();
    this.#dig = null;
    // Invalida o cache de tela para forçar re-fetch ao entrar novamente
    this.#shopIdCache = null;
    this.#servicos    = [];
    this.#shopData    = null;
  }

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
