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
  #telaEl           = null;
  #shopId           = null;   // UUID da barbearia atual
  #shopIdCache      = null;   // último ID renderizado (evita re-fetch na volta)
  #carregando       = false;  // mutex contra fetches paralelos
  #dig              = null;   // instância DigText de boas-vindas
  #digFila          = null;   // instância DigText da seção de barbeiros
  #servicos         = [];     // serviços em cache para os handlers de cadeira
  #shopData         = null;   // objeto completo da barbearia atual
  #numeroBarbeiros  = 0;      // total de barbeiros ativos (usado na mensagem de fechamento)
  #canalFila        = null;   // canal Supabase Realtime de queue_entries
  #canalFilaShopId  = null;   // shop.id do canal ativo (evita reconexão desnecessária)
  #canalShop        = null;   // canal Supabase Realtime de barbershops (status aberto/fechado)
  #canalShopId      = null;   // shop.id do canal de status (evita reconexão desnecessária)
  #timerShopPoll    = null;   // timer de polling periódico de status (fallback quando Realtime falha)
  #canalAtividade   = null;   // canal Supabase Realtime de professional_barbershop_presence
  #canalAtividadeShopId = null; // shop.id do canal de atividade (evita reconexão desnecessária)
  #atividadeStatus  = new Map(); // professional_id → presença { is_available, ... }
  #pushEntradaId    = null;   // entradaId de push deep-link pendente (abre modal após render)
  #highlightBarberId = null;  // barber-id a destacar após abrir barbearia via card do barbeiro

  // ── Constantes ────────────────────────────────────────────
  /** Intervalo de polling de status da barbearia em ms (fallback para Realtime). */
  static #SHOP_POLL_MS = 20_000;

  // ── Refs DOM ──────────────────────────────────────────────
  #refs = {};
  #barbeiroRows         = new Map(); // barbeiro.id -> { rowEl, sig } (reconciliação incremental)
  #renderBarbeirosTimer = null;      // debounce p/ coalescer eventos de fila
  #portfolioViewer      = null;  // PortfolioPrismViewer — lazy, criado no 1º clique
  #portfolioData        = [];    // lista de fotos ativas — alimentado em #renderPortfolio
  #mensalModal          = null;  // overlay do modal de mensalidade — lazy, criado na 1ª abertura
  #mensalModalKeyHandler = null; // handler Escape para remoção limpa no fechar

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

    // Deep-link via Web Push: abre barbearia correta quando usuário clica na notificação
    document.addEventListener('barberflow:push-deep-link', e => {
      const { barbershopId, entradaId } = e.detail ?? {};
      if (!barbershopId) return;
      if (entradaId) this.#pushEntradaId = entradaId;
      this.abrirPorId(barbershopId).catch(() => {});
    });

    // Abrir página pública via evento (ex.: card de barbearia parceira em tela-parcerias)
    document.addEventListener('barberflow:abrir-barbearia', e => {
      const { barbershopId } = e.detail ?? {};
      if (barbershopId) this.abrirPorId(barbershopId).catch(() => {});
    });
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
  async abrirPorId(id, { highlightBarberId = null } = {}) {
    if (!InputValidator.uuid(id).ok) return;
    this.#highlightBarberId = InputValidator.uuid(highlightBarberId).ok ? highlightBarberId : null;

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
    NavigationManager.navigate(() => {
      if (router) router.nav('barbearia');
      // Limpa o ID salvo pelo deep-link de compartilhamento (sobreviveu ao reload do SW).
      try { sessionStorage.removeItem('bf_dl_barbearia'); } catch (_) {}
    });
  }

  // ══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

  /** Faz cache de todos os nós DOM usados pelos renders. */
  #cacheRefs() {
    const q  = sel => this.#telaEl.querySelector(sel);
    const dq = sel => document.querySelector(sel);
    this.#refs = {
      capaImg:       q('#bp-capa'),
      capaStatus:    q('#bp-capa-status'),
      logoImg:       q('#bp-logo'),
      nome:          q('#bp-nome'),
      // Os elementos abaixo vivem em #bp-info-fixa, fora de #tela-barbearia
      infoNome:      dq('#bp-info-nome'),
      endereco:      dq('#bp-endereco'),
      infoCidade:    dq('#bp-info-cidade'),
      badge:         dq('#bp-badge'),
      rating:        dq('#bp-rating'),
      likes:         dq('#bp-likes'),
      likesWrap:     dq('#bp-likes-wrap'),
      since:         dq('#bp-desde'),
      infoWhats:     dq('#bp-info-whats'),
      whatsBtn:      q('#bp-whats-btn'),
      favBtn:        q('#bp-fav-btn'),
      servicosLista: q('#bp-servicos-lista'),
      mensalBanner:  q('#bp-mensal-banner'),
      portfolioGrid:            q('#bp-portfolio-grid'),
      portfolioBarbeirosWrap:   q('#bp-portfolio-barbeiros-wrap'),
      portfolioBarbeiros:       q('#bp-portfolio-barbeiros'),
      barbeirosScroll: q('#bp-barbeiros-scroll'),
      filaDig:         q('#bp-fila-dig'),
      skeleton:      q('#bp-skeleton'),
      conteudo:      q('#bp-conteudo'),
      boasVindas:    q('#bp-boas-vindas'),
      ctaLogin:      q('#bp-cta-login'),
      infoFixa:      dq('#bp-info-fixa'),
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
        // QueuePoller permanece ativo em background para detectar "é sua vez"
        // mesmo quando o usuário navega para outra tela.
        this.#pararRealtimeFila();
        this.#pararRealtimeShop();
        this.#pararRealtimeAtividade();
        this.#pararPollingShop();
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
      // data-parceiro="true" → card de barbearia vinculada; o listener do elemento trata a navegação
      if (!card || card.dataset.parceiro === 'true' || e.target.closest('[data-action]')) return;

      const id = card.dataset.barbershopId;
      if (!InputValidator.uuid(id).ok) {
        LoggerService.warn('[BarbeariaPage] ID inválido interceptado:', id);
        return;
      }

      e.stopPropagation();
      this.abrirPorId(id, { highlightBarberId: card.dataset.highlightBarberId ?? null });
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
      // Canais podem ter sido parados ao navegar para outra tela — reinicia todos
      if (this.#shopData) {
        this.#iniciarRealtimeFila(this.#shopData);
        this.#iniciarRealtimeShop(this.#shopData);
        this.#iniciarRealtimeAtividade(this.#shopData);
        void this.#carregarAtividade(this.#shopData); // re-sync: status pode ter mudado fora da tela
        this.#iniciarPollingShop(this.#shopId);
      }
      return;
    }

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
      // Nota: price_half e category serão adicionados após aplicar migration 20260530000001
      const { data, error } = await ApiService.from('services')
        .select('id, name, category, price, duration_min, image_path, description')
        .eq('barbershop_id', id)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  }

  // INÍCIO ALTERAÇÃO - Portfolio com interactions via BFF (barbearia pública)
  // Corrigido: mantém a query original (owner_type='barbershop') e adiciona
  // fetch de interactions via BFF para os IDs já carregados, garantindo que
  // mensagens/emojis/curtidas subam animados ao abrir o viewer em tela cheia.
  // Nenhuma mudança no conjunto de imagens exibidas — apenas interactions enriquecidas.
  static async #fetchPortfolio(id) {
    let items = [];
    try {
      const { data, error } = await ApiService.from('portfolio_images')
        .select('id, thumbnail_path, title')
        .eq('owner_id', id)
        .eq('owner_type', 'barbershop')
        .eq('status', 'active')
        .order('likes_count', { ascending: false })
        .limit(9);
      if (error) return [];
      items = data ?? [];
    } catch { return []; }

    if (!items.length) return items;

    // Busca interactions para estas imagens via BFF (best-effort)
    try {
      if (typeof BffApiService !== 'undefined') {
        const ids = items.map(img => img.id).filter(Boolean).join(',');
        if (ids) {
          const { data: intData } = await BffApiService.barbearias.listarInteracoes(ids);
          if (intData && typeof intData === 'object') {
            items = items.map(img => ({
              ...img,
              interactions: Array.isArray(intData[img.id]) ? intData[img.id] : [],
            }));
          }
        }
      }
    } catch { /* best-effort — retorna itens sem interactions se BFF indisponível */ }

    return items;
  }
  // FIM ALTERAÇÃO

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
   * @param {object}        opts
   * @param {object}        opts.barbeiro
   * @param {boolean}       opts.isOwner
   * @param {object[]}      opts.filaEntradas            entradas filtradas para este barbeiro
   * @param {boolean}       opts.podeInteragir
   * @param {Function|null} opts.onProducaoVaziaClick    callback: clique em cadeira de produção vazia
   * @param {Function|null} opts.onCadeiraVaziaClick     callback: clique em cadeira de fila vazia (última)
   * @param {Function|null} opts.onProducaoArrivingClick callback: cliente clica na própria cadeira em arriving
   * @param {string|null}   opts.clienteLogadoId         id do cliente autenticado (ou null)
   * @returns {HTMLDivElement}
   */
  static #criarRow({ barbeiro, isOwner, filaEntradas, podeInteragir, onProducaoVaziaClick, onCadeiraVaziaClick, onProducaoArrivingClick = null, onMinhaFilaLongPress = null, clienteLogadoId = null, statusEl = null }) {
    const row = document.createElement('div');
    row.className = `cdr-row${isOwner ? ' cdr-row--owner' : ''}`;

    row.appendChild(BarbeiroCard.criar({
      nome:       barbeiro.full_name ?? 'Barbeiro',
      avatarPath: barbeiro.avatar_path ?? null,
      updatedAt:  barbeiro.updated_at ?? null,
      isOwner,
      barberId:   barbeiro.id ?? null,
      statusEl,
    }));

    const wrap = document.createElement('div');
    wrap.className = 'cdr-cadeiras-wrap';

    // Cadeira de produção (atendimento)
    const emServico      = filaEntradas.find(e => e.status === 'in_service') ?? null;
    const ehMinhaEntrada = emServico != null && emServico.client?.id === clienteLogadoId;
    wrap.appendChild(Cadeira.criar({
      tipo:            'producao',
      entrada:         emServico,
      posicao:         0,
      podeInteragir:   podeInteragir && !emServico,
      onClick:         (!emServico && onProducaoVaziaClick) ? onProducaoVaziaClick : null,
      confirmacao:     emServico?.client_confirmed ?? null,
      onArrivingClick: (ehMinhaEntrada && (emServico?.client_confirmed === 'arriving' || emServico?.client_confirmed === null) && onProducaoArrivingClick)
        ? () => onProducaoArrivingClick(emServico)
        : null,
    }));

    // Cadeiras de fila — dinâmicas: ocupadas + sempre 1 vazia ao final
    const naFila   = filaEntradas.filter(e => e.status === 'waiting');
    const filaWrap = document.createElement('div');
    filaWrap.className = 'cdr-fila-wrap';
    naFila.forEach((e, i) => {
      const ehMinhaFila = e.client?.id === clienteLogadoId || e.client_id === clienteLogadoId;
      filaWrap.appendChild(Cadeira.criar({
        tipo:          'fila',
        entrada:       e,
        posicao:       i + 1,
        podeInteragir: false,
        onClick:       null,
        onLongPress:   ehMinhaFila && onMinhaFilaLongPress
          ? () => onMinhaFilaLongPress(e)
          : null,
      }));
    });
    // Cadeira vazia sempre ao final — permite entrar na fila de espera
    filaWrap.appendChild(Cadeira.criar({
      tipo:          'fila',
      entrada:       null,
      posicao:       naFila.length + 1,
      podeInteragir,
      onClick:       onCadeiraVaziaClick ?? null,
    }));
    wrap.appendChild(filaWrap);
    row.appendChild(wrap);
    return row;
  }

  /**
   * Row skeleton para exibição enquanto dados carregam.
   * @returns {HTMLDivElement}
   */
  /** Assinatura que resume tudo que afeta o DOM da row pública. */
  static #assinaturaRowPublica(b, filaB, isOwner, podeInteragir, clienteLogadoId, atividade = '') {
    const chairs = filaB
      .map(e => `${e.id}:${e.status}:${e.client_confirmed ?? ''}:${e.client?.avatar_path ?? ''}:${(e.client_id ?? e.user_id) === clienteLogadoId ? 'me' : ''}`)
      .join('|');
    return [
      b.id, b.full_name, b.avatar_path, b.updated_at,
      isOwner ? '1' : '0', podeInteragir ? '1' : '0', clienteLogadoId ?? '', atividade, chairs,
    ].join('§');
  }

  /**
   * Agenda um re-render dos barbeiros com debounce — coalesce a rajada de eventos
   * queue_entries (recálculo de posição) de UMA operação num único re-render.
   */
  #agendarRenderBarbeiros(shop, delay = 160) {
    if (!shop?.id) return;
    if (this.#renderBarbeirosTimer) clearTimeout(this.#renderBarbeirosTimer);
    this.#renderBarbeirosTimer = setTimeout(() => {
      this.#renderBarbeirosTimer = null;
      if (this.#shopData?.id === shop.id) this.#renderBarbeiros(this.#shopData).catch(() => {});
    }, delay);
  }

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
    this.#renderServicos(servicos, shop);
    this.#renderMensalBanner(shop, servicos);
    this.#renderPortfolio(portfolio);
    this.#renderStories(shop);            // fire-and-forget: preenche carrossel de stories
    this.#renderBarbeiros(shop);          // fire-and-forget: preenche carousel async
    this.#renderPortfolioBarbeiros(shop); // fire-and-forget: portfólio dos barbeiros
    this.#iniciarRealtimeFila(shop);
    this.#iniciarRealtimeShop(shop);
    this.#iniciarRealtimeAtividade(shop);
    void this.#carregarAtividade(shop);   // fire-and-forget: presença Ativo/Inativo do dono
    this.#iniciarPollingShop(shop.id);
    this.#mostrarConteudo();
  }

  /**
   * Carrega e exibe os stories da barbearia pública no carrossel.
   * Modo individual: 1 card por story, thumbnail estática, viewer no índice clicado.
   * Fire-and-forget — não bloqueia o render principal.
   * @param {object} shop
   */
  #renderStories(shop) {
    if (typeof StoriesWidget === 'undefined') return;
    const section = this.#telaEl?.querySelector?.('.bp-stories-section');
    if (!section) return;

    let scroll = section.querySelector('.stories-scroll');
    if (!scroll) {
      scroll = document.createElement('div');
      scroll.className = 'stories-scroll';
      section.insertBefore(scroll, section.firstChild);
    }

    const logoSrc = shop.logo_path
      ? (typeof SupabaseService !== 'undefined' ? SupabaseService.getLogoUrl(shop.logo_path, shop.updated_at) : null)
      : null;

    new StoriesWidget(scroll, {
      barbershopId: shop.id,
      shopName:     shop.name ?? shop.trade_name ?? '',
      shopLogoSrc:  logoSrc,
      context:      'public-shop',
    }).carregar().catch(() => {});
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

    // Skeleton só no 1º load (sem rows reais no container). Em re-render de
    // fila NÃO limpa tudo — senão volta a tempestade de innerHTML total.
    if (!el.querySelector('.cdr-row:not(.cdr-row--skel)')) {
      el.innerHTML = '';
      for (let i = 0; i < 3; i++) el.appendChild(BarbeariaPage.#criarSkeletonRow());
    }

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
        CadeiraService.getFilaAtiva(shop.id),
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

    // Push deep-link: se o usuário abriu o app clicando em notificação de chamada
    this.#dispararModalPushSeNecessario(filaAtiva, shop);
    this.#numeroBarbeiros = barbeiros.length;

    if (!barbeiros.length) {
      el.innerHTML = '';
      this.#barbeiroRows.clear();
      const secao = el.closest('.bp-barbeiros-secao');
      if (secao) secao.hidden = true;
      return;
    }

    const barbeariaAberta      = (typeof BarbershopAvailabilityService !== 'undefined')
      ? BarbershopAvailabilityService.canClientClickChair(shop)
      : (shop?.is_open === true);
    const clientePodeInteragir = ClienteController.podeInteragir();
    // podeInteragir controla apenas o affordance visual (CSS interativo)
    // Os callbacks são passados sempre que o cliente pode interagir,
    // independente do estado da barbearia, para que o modal de "fechada" apareça
    const podeInteragir        = clientePodeInteragir && barbeariaAberta;
    const clienteLogadoId      = typeof AuthService !== 'undefined' ? (AuthService.getPerfil?.()?.id ?? null) : null;

    // Reconciliação por barbeiro.id + assinatura: só recria a row do barbeiro
    // cuja fila/estado mudou; pula as inalteradas. Sem innerHTML='' no container
    // → elimina a tempestade de re-render que travava a página pública.
    el.querySelectorAll('.cdr-row--skel').forEach(s => s.remove());
    const vivos = new Set();
    for (const b of barbeiros) {
      const filaB   = filaAtiva.filter(e => e.professional?.id === b.id);
      const isOwner = b.id === shop.owner_id;
      // Dono Inativo: cliente não usa as cadeiras dele até reativar (default ATIVO)
      const donoAtivo = !isOwner || this.#donoDisponivel(b.id);
      const atividade = isOwner ? (donoAtivo ? 'A' : 'I') : '';
      const sig     = BarbeariaPage.#assinaturaRowPublica(b, filaB, isOwner, podeInteragir, clienteLogadoId, atividade);
      vivos.add(b.id);
      const atual = this.#barbeiroRows.get(b.id);
      let rowEl;
      if (atual && atual.sig === sig) {
        rowEl = atual.rowEl; // inalterada — reaproveita
      } else {
        rowEl = BarbeariaPage.#criarRow({
          barbeiro:              b,
          isOwner,
          filaEntradas:          filaB,
          podeInteragir:         podeInteragir && donoAtivo,
          clienteLogadoId,
          // Texto Ativo/Inativo acima do avatar — só na row do dono (mesmo
          // componente da Minha Barbearia; muda em tempo real via canal)
          statusEl: (isOwner && typeof BarbeiroAtividadeStatus !== 'undefined')
            ? BarbeiroAtividadeStatus.criarParagrafo({ professionalId: b.id, isAvailable: donoAtivo })
            : null,
          onProducaoVaziaClick:     clientePodeInteragir ? (cadeiraEl) => this.#onProducaoClick(b.id, cadeiraEl) : null,
          onCadeiraVaziaClick:      clientePodeInteragir ? (cadeiraEl) => this.#onCadeiraClick(b.id, cadeiraEl) : null,
          onProducaoArrivingClick:  clientePodeInteragir ? (entrada) => this.#onProducaoArrivingClick(entrada) : null,
          onMinhaFilaLongPress:     clientePodeInteragir ? (entrada) => this.#onMinhaCadeiraEsperaLongPress(entrada) : null,
        });
        if (atual) atual.rowEl.remove();
        this.#barbeiroRows.set(b.id, { rowEl, sig });
      }
      el.appendChild(rowEl); // mantém/reordena
    }
    // Remove rows de barbeiros que sumiram da lista
    for (const [id, info] of this.#barbeiroRows) {
      if (!vivos.has(id)) { info.rowEl.remove(); this.#barbeiroRows.delete(id); }
    }

    this.#aplicarHighlight();

    // QueuePoller fallback: garante polling ativo se cliente já está na fila ao abrir a página
    const perfilPoller = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    if (perfilPoller?.id) {
      const minhaEntrada = filaAtiva.find(
        e => (e.client_id ?? e.user_id) === perfilPoller.id,
      );
      if (minhaEntrada) {
        QueuePoller.iniciar(shop.id, perfilPoller.id, () => {
          if (this.#shopData?.id === shop.id) {
            this.#renderBarbeiros(this.#shopData).catch(() => {});
          }
        });
      }

    }

    // Inicia animação DigText na seção de barbeiros
    if (typeof DigText !== 'undefined' && this.#refs.filaDig) {
      this.#refs.filaDig.textContent = '';
      const TEXTO_FILA = 'Escolha um barbeiro de sua preferência e entre para a fila — seu corte está a um toque de distância.';
      this.#digFila = new DigText(this.#refs.filaDig, [TEXTO_FILA], { velocidade: 28, loop: false });
      this.#digFila.iniciar();
    }
  }

  /** Aplica borda pulsante ao card do barbeiro de origem (vindo da tela-barbeiro). */
  #aplicarHighlight() {
    if (!this.#highlightBarberId || !this.#refs.barbeirosScroll) return;
    const el = this.#refs.barbeirosScroll.querySelector(
      `[data-barber-id="${CSS.escape(this.#highlightBarberId)}"]`,
    );
    const row = el?.closest('.cdr-row');
    if (!row) return;
    row.classList.add('cdr-row--highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    row.addEventListener('click', () => row.classList.remove('cdr-row--highlight'), { once: true });
    this.#highlightBarberId = null;
  }

  /**
   * Inicia canal Supabase Realtime ouvindo INSERT/UPDATE/DELETE em
   * queue_entries da barbearia atual. Re-renderiza as cadeiras em tempo real.
   * Guard por shop.id — evita reconexão se a barbearia não mudou.
   * @param {object} shop
   */
  #iniciarRealtimeFila(shop) {
    if (!shop?.id) return;
    if (this.#canalFilaShopId === shop.id && this.#canalFila) return;

    this.#pararRealtimeFila();

    try {
      this.#canalFila = SupabaseService.channel(`fila:${shop.id}`)
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'queue_entries',
            filter: `barbershop_id=eq.${shop.id}`,
          },
          (payload) => this.#onFilaRealtime(payload, shop),
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            LoggerService.info('[BarbeariaPage] Realtime fila conectado');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            LoggerService.warn('[BarbeariaPage] Realtime falhou:', status, err?.message);
            // QueuePoller é o fallback — ativo se cliente estiver na fila
          }
        });
      this.#canalFilaShopId = shop.id;
    } catch (e) {
      LoggerService.warn('[BarbeariaPage] Realtime indisponível:', e?.message);
    }
  }

  /**
   * Para o canal Realtime da fila e limpa referências.
   */
  #pararRealtimeFila() {
    if (this.#canalFila) {
      try { SupabaseService.removeChannel(this.#canalFila); } catch (_) {}
      this.#canalFila       = null;
      this.#canalFilaShopId = null;
    }
  }

  /**
   * Inicia canal Realtime que escuta UPDATE na barbearia atual.
   * Mantém this.#shopData sincronizado quando o profissional abre/fecha a barbearia,
   * garantindo que os guards de disponibilidade usem dados frescos sem reload.
   * @param {object} shop
   */
  #iniciarRealtimeShop(shop) {
    if (!shop?.id) return;
    if (this.#canalShopId === shop.id && this.#canalShop) return;

    this.#pararRealtimeShop();

    try {
      this.#canalShop = SupabaseService.channel(`shop-status:${shop.id}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'barbershops',
            filter: `id=eq.${shop.id}`,
          },
          (payload) => this.#onShopRealtime(payload),
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            LoggerService.warn('[BarbeariaPage] Realtime shop falhou:', status, err?.message);
          }
        });
      this.#canalShopId = shop.id;
    } catch (e) {
      LoggerService.warn('[BarbeariaPage] Realtime shop indisponível:', e?.message);
    }
  }

  // ── Presença dos barbeiros (Ativo/Inativo) ────────────────

  /**
   * Disponibilidade do DONO com default ATIVO: dono sem linha de presença
   * nunca marcou ausência → tratado como ativo (mesma régua da Minha Barbearia).
   * @param {string} professionalId
   * @returns {boolean}
   */
  #donoDisponivel(professionalId) {
    if (!professionalId) return true;
    const entry = this.#atividadeStatus.get(professionalId);
    return entry ? entry.is_available === true : true;
  }

  /** true quando o professionalId é o dono da barbearia atual E está Inativo. */
  #donoInativo(professionalId) {
    return professionalId != null
      && professionalId === this.#shopData?.owner_id
      && !this.#donoDisponivel(professionalId);
  }

  /**
   * Feedback de cadeira bloqueada (barbeiro indisponível): balança a cadeira
   * para os lados e mostra um balão acima dela (CadeiraBloqueadaFeedback).
   * Fallback: toast quando o elemento da cadeira não está disponível.
   * @param {HTMLElement|null} cadeiraEl
   */
  #feedbackCadeiraBloqueada(cadeiraEl = null) {
    if (cadeiraEl && typeof CadeiraBloqueadaFeedback !== 'undefined') {
      CadeiraBloqueadaFeedback.mostrar(cadeiraEl);
      return;
    }
    NotificationService.mostrarToast(
      'Barbeiro indisponível',
      'O barbeiro está inativo no momento. Aguarde ele ficar ativo.',
      NotificationService.TIPOS.SISTEMA,
    );
  }

  /**
   * Carrega o mapa de presença dos barbeiros (rota pública do BFF) e agenda
   * re-render. Fire-and-forget — não bloqueia o render principal.
   * @param {object} shop
   */
  async #carregarAtividade(shop) {
    if (!shop?.id || typeof BarbeiroAtividadeStatus === 'undefined') return;
    const lista = await BarbeiroAtividadeStatus.listar(shop.id);
    if (this.#shopId !== shop.id) return; // stale: navegou para outra barbearia durante o await
    this.#atividadeStatus = BarbeiroAtividadeStatus.mapa(lista);
    this.#agendarRenderBarbeiros(shop);
  }

  /**
   * Assina presença via BarbeiroAtividadeStatus.assinar (broadcast +
   * postgres_changes — mesmo canal usado pelo toggle do dono): o texto
   * Ativo/Inativo muda no instante do clique, sem re-fetch.
   * @param {object} shop
   */
  #iniciarRealtimeAtividade(shop) {
    if (!shop?.id || typeof BarbeiroAtividadeStatus === 'undefined') return;
    if (this.#canalAtividade && this.#canalAtividadeShopId === shop.id) return;
    this.#pararRealtimeAtividade();
    this.#canalAtividade = BarbeiroAtividadeStatus.assinar(shop.id, payload => {
      const row = (payload?.new && payload.new.professional_id) ? payload.new : payload?.old;
      if (!row?.professional_id) return;
      if (payload?.eventType === 'DELETE') {
        this.#atividadeStatus.delete(row.professional_id); // linha removida → volta ao default
      } else {
        this.#atividadeStatus.set(row.professional_id, {
          ...row,
          is_available: row.is_available === true,
        });
      }
      this.#agendarRenderBarbeiros(this.#shopData ?? shop);
    });
    this.#canalAtividadeShopId = this.#canalAtividade ? shop.id : null;
  }

  /** Para o canal Realtime de atividade e limpa referências. */
  #pararRealtimeAtividade() {
    if (this.#canalAtividade) {
      try { BarbeiroAtividadeStatus.desassinar(this.#canalAtividade); } catch (_) {}
      this.#canalAtividade = null;
      this.#canalAtividadeShopId = null;
    }
  }

  /** Para o canal Realtime de status da barbearia e limpa referências. */
  #pararRealtimeShop() {
    if (this.#canalShop) {
      try { SupabaseService.removeChannel(this.#canalShop); } catch (_) {}
      this.#canalShop   = null;
      this.#canalShopId = null;
    }
  }

  // ── Polling de status da barbearia (fallback quando Realtime falha) ───

  /**
   * Inicia polling periódico de status da barbearia.
   * Serve como fallback quando o canal Realtime de barbershops não entrega eventos.
   * @param {string} shopId
   */
  #iniciarPollingShop(shopId) {
    this.#pararPollingShop();
    this.#timerShopPoll = setInterval(
      () => this.#pollShopStatus(shopId).catch(() => {}),
      BarbeariaPage.#SHOP_POLL_MS,
    );
  }

  /** Para o polling periódico de status da barbearia e limpa o timer. */
  #pararPollingShop() {
    if (this.#timerShopPoll !== null) {
      clearInterval(this.#timerShopPoll);
      this.#timerShopPoll = null;
    }
  }

  /**
   * Poll único: busca is_open e close_reason do banco.
   * Se o status mudou em relação a this.#shopData, notifica via #onShopRealtime.
   * Para o polling automaticamente quando a barbearia já está aberta
   * (Realtime assume o controle para mudanças subsequentes).
   * @param {string} shopId
   */
  async #pollShopStatus(shopId) {
    if (!this.#shopData || this.#shopId !== shopId) return;

    // Se a barbearia já está aberta, não há necessidade de continuar polling
    if (this.#shopData.is_open === true) {
      this.#pararPollingShop();
      return;
    }

    const { data } = await ApiService.from('barbershops')
      .select('is_open, close_reason')
      .eq('id', shopId)
      .single();

    // Stale-check: o usuário pode ter navegado para outra barbearia durante o await
    if (!data || this.#shopId !== shopId) return;

    // Só re-renderiza se houve mudança real
    if (data.is_open === this.#shopData.is_open) return;

    // Delega para #onShopRealtime — reutiliza atualização de estado, cache e re-render
    this.#onShopRealtime({ new: data });
  }

  /**
   * Callback do Realtime de barbershops.
   * Mescla is_open e close_reason em this.#shopData — mantém guards corretos.
   * Atualiza também o cache para que a próxima navegação use dados frescos.
   * @param {object} payload — payload do Supabase Realtime
   */
  async #onShopRealtime(payload) {
    const novo = payload?.new;
    if (!novo || !this.#shopData) return;

    const statusMudou = novo.is_open !== undefined && novo.is_open !== this.#shopData.is_open;

    this.#shopData = {
      ...this.#shopData,
      ...novo,
      close_reason: novo.close_reason ?? this.#shopData.close_reason ?? null,
    };

    // Atualiza o cache para evitar dado obsoleto na próxima navegação à mesma barbearia
    const cached = CacheManager.get(`${this.#shopId}:shop`);
    if (cached) CacheManager.set(`${this.#shopId}:shop`, this.#shopData, 5 * 60 * 1000);

    // Atualiza badge e re-renderiza cadeiras imediatamente (sem reload)
    this.#atualizarBadge(this.#shopData);
    if (statusMudou) this.#renderBarbeiros(this.#shopData).catch(() => {});

    try {
      const servicos = await BarbeariaPage.#fetchServicos(this.#shopId);
      this.#servicos = servicos;
      CacheManager.set(`${this.#shopId}:servicos`, servicos, 5 * 60 * 1000);
      this.#renderServicos(servicos, this.#shopData);
      this.#renderMensalBanner(this.#shopData, servicos);
    } catch (err) {
      LoggerService.warn('[BarbeariaPage] realtime serviços falhou:', err?.message ?? err);
    }
  }

  /**
   * Se o app foi aberto via clique em push notification de chamada para cadeira,
   * verifica se a entrada ainda está `in_service` e aciona a modal existente.
   * Guard: limpa `#pushEntradaId` após o primeiro disparo — não reabre em re-renders.
   * @param {object[]} filaAtiva — entradas com status waiting|in_service
   * @param {object}   shop
   */
  #dispararModalPushSeNecessario(filaAtiva, shop) {
    const entradaId = this.#pushEntradaId;
    if (!entradaId) return;

    const entrada = filaAtiva.find(e => e.id === entradaId && e.status === 'in_service');
    if (!entrada) return;

    // Limpa antes de acionar — evita re-abertura em renders subsequentes
    this.#pushEntradaId = null;

    const perfil      = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    const nome        = perfil?.full_name ?? entrada.client?.full_name ?? entrada.guest_name ?? '';
    const shopLogoUrl = (typeof ApiService !== 'undefined' && shop?.logo_path)
      ? ApiService.getLogoUrl(shop.logo_path, shop.updated_at)
      : null;

    if (typeof CadeiraConfirmacaoService !== 'undefined') {
      CadeiraConfirmacaoService.iniciarFluxo(entradaId, nome, shopLogoUrl).catch(() => {});
    }
  }

  /**
   * Callback disparado pelo Realtime ao detectar mudança em queue_entries.
   * Re-renderiza cadeiras e dispara confirmação de presença se o cliente
   * foi promovido para in_service.
   * @param {object} payload — payload do Supabase Realtime
   * @param {object} shop
   */
  async #onFilaRealtime(payload, shop) {
    if (this.#shopId !== shop.id) return;
    if (!this.#shopData) return;

    // Re-render com debounce: coalesce a rajada de eventos de uma operação num
    // único render (estado ATUAL da barbearia via this.#shopData).
    this.#agendarRenderBarbeiros(this.#shopData);

    // Detecta se este cliente foi promovido para in_service
    const entrada = payload?.new;
    if (!entrada?.id || entrada.status !== 'in_service') return;

    const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    if (!perfil?.id) return;

    const esteCliente = (entrada.client_id ?? entrada.user_id) === perfil.id;
    if (!esteCliente) return;

    // CadeiraConfirmacaoService tem guard interno — não reabre se já processado
    if (typeof CadeiraConfirmacaoService !== 'undefined') {
      const nome = perfil.full_name ?? '';
      const shopLogoUrl = (typeof ApiService !== 'undefined' && shop?.logo_path)
        ? ApiService.getLogoUrl(shop.logo_path, shop.updated_at)
        : null;
      CadeiraConfirmacaoService.iniciarFluxo(entrada.id, nome, shopLogoUrl).catch(() => {});
    }
  }

  /**
   * Exibe modal contextual quando a barbearia está fechada ou em pausa.
   * Ícone, título e mensagem (singular/plural de barbeiros) via BarbershopAvailabilityService.
   */
  async #mostrarModalBarbeariaFechada() {
    await FluxoDeFila.abrir({
      id:        'barbearia-fechada',
      icone:     BarbershopAvailabilityService.getClosedIcon(this.#shopData),
      titulo:    BarbershopAvailabilityService.getClosedTitle(this.#shopData),
      corpo:     FluxoDeFila.escapar(
        BarbershopAvailabilityService.getClosedMessage(this.#shopData, this.#numeroBarbeiros),
      ),
      acoes:     [{ label: 'Entendi', valor: 'ok', variante: 'primario' }],
      fecharBtn: false,
    });
  }

  /**
   * Handler de clique em uma cadeira vazia.
   * Abre o modal de seleção de serviços e registra o cliente na fila.
   * @param {string} professionalId UUID do barbeiro da cadeira
   */
  async #onCadeiraClick(professionalId, cadeiraEl = null) {
    if (!ClienteController.podeInteragir()) {
      const router = (typeof App !== 'undefined' && App) || null;
      if (router) router.push('cadastro');
      return;
    }

    // Guard: bloqueia entrada na fila quando barbearia está fechada ou em pausa
    if (!BarbershopAvailabilityService.canClientJoinQueue(this.#shopData)) {
      await this.#mostrarModalBarbeariaFechada();
      return;
    }

    // Guard: dono Inativo — balança a cadeira e avisa acima dela até ele reativar
    if (this.#donoInativo(professionalId)) {
      this.#feedbackCadeiraBloqueada(cadeiraEl);
      return;
    }

    const perfil  = AuthService.getPerfil();
    let filaAtiva = [];
    try {
      filaAtiva = await CadeiraService.getFilaAtiva(this.#shopId);
      const jaAssentado = perfil?.id && filaAtiva.some(
        e => (e.client_id ?? e.client?.id) === perfil.id &&
             (e.status === 'in_service' || e.status === 'waiting'),
      );
      if (jaAssentado) {
        NotificationService.mostrarToast(
          'Você já está na fila',
          'Aguarde ser chamado pelo barbeiro.',
          NotificationService.TIPOS.SISTEMA,
        );
        return;
      }
    } catch (_) { /* rede — deixa prosseguir; backend rejeita duplicata */ }

    const serviceIds = await ModalController.abrirSelecaoServicos({
      servicos: this.#servicos,
      barbershopId: this.#shopId,
    });
    if (serviceIds === null) return;

    // Auto-promoção: se a cadeira de produção deste barbeiro está vazia, vai direto para atendimento
    const producaoOcupada = filaAtiva.some(
      e => e.professional?.id === professionalId && e.status === 'in_service',
    );
    if (!producaoOcupada) {
      await this.#executarFluxoProducao(professionalId, perfil, serviceIds);
      return;
    }

    try {
      await ClienteController.entrarNaFila({
        barbershopId:   this.#shopId,
        professionalId,
        serviceIds,
      });
      if (this.#shopData) await this.#renderBarbeiros(this.#shopData);
      // iniciarPresenter=true: cliente está na fila de espera e precisa de notificações de posição
      this.#iniciarPollers(perfil?.id, true);
    } catch (err) {
      LoggerService.error('[BarbeariaPage] erro ao entrar na fila:', err);
      NotificationService.mostrarToast(
        'Erro',
        err?.message ?? 'Não foi possível entrar na fila.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  async #onMinhaCadeiraEsperaLongPress(entrada) {
    const perfil = AuthService.getPerfil?.();
    const entradaClienteId = entrada?.client?.id ?? entrada?.client_id ?? null;
    if (!perfil?.id || !entrada?.id || entradaClienteId !== perfil.id || entrada.status !== 'waiting') return;

    let confirmar = true;
    if (typeof FluxoDeFila !== 'undefined') {
      const clienteNome = perfil.full_name ?? entrada?.client?.full_name ?? 'cliente';
      const resposta = await FluxoDeFila.abrir({
        id: 'sair-fila-espera',
        icone: '↩',
        titulo: 'Desistir de esperar?',
        corpo: FluxoDeFila.escapar(
          `${clienteNome}, deseja realmente desistir de esperar? Voce perdera sua posicao na fila.`,
        ),
        acoes: [
          { label: 'Sim', valor: 'sair', variante: 'primario' },
          { label: 'Continuar esperando', valor: 'cancelar', variante: 'secundario' },
        ],
        fecharBtn: true,
      });
      confirmar = resposta === 'sair';
    } else {
      confirmar = window.confirm('Deseja realmente desistir de esperar? Voce perdera sua posicao na fila.');
    }

    if (!confirmar) return;

    try {
      await QueueRepository.updateStatus(entrada.id, 'cancelled');
      QueuePoller.parar?.();
      QueuePositionPresenter.parar?.();
      QueueStateUpdater.parar?.();
      NotificationService.mostrarToast(
        'Voce saiu da fila',
        'Sua cadeira de espera foi liberada.',
        NotificationService.TIPOS.SISTEMA,
      );
      if (this.#shopData) await this.#renderBarbeiros(this.#shopData);
    } catch (err) {
      LoggerService.error('[BarbeariaPage] erro ao sair da fila:', err);
      NotificationService.mostrarToast(
        'Erro',
        err?.message ?? 'Nao foi possivel sair da fila agora.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  /**
   * Exibe modal de confirmação de chegada para o cliente que já está em 'arriving'.
   * Ao confirmar: persiste client_confirmed='yes' e notifica o barbeiro.
   * @param {object|null} entrada queue_entry em in_service
   */
  async #onProducaoArrivingClick(entrada) {
    if (!ClienteController.podeInteragir()) return;
    const perfil   = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    const resposta = await FluxoDeFila.abrir({
      id:        'modal-confirmar-chegada',
      icone:     '🏠',
      titulo:    'Você chegou?',
      corpo:     'Avise o barbeiro que você está na barbearia!',
      acoes:     [{ label: '✅ Sim, já cheguei!', valor: 'confirmado', variante: 'primario' }],
      fecharBtn: true,
    });
    if (resposta !== 'confirmado') return;
    await ChegadaProducaoService.confirmarChegada({
      entradaId:      entrada?.id ?? null,
      professionalId: entrada?.professional?.id ?? null,
      barbershopId:   this.#shopId,
      clienteNome:    perfil?.full_name ?? '',
    });
    this.#renderBarbeiros(this.#shopData).catch(() => {});
  }

  /**
   * Handler de clique na cadeira de PRODUÇÃO vazia (app cliente).
   * Aplica guards e delega o fluxo ao #executarFluxoProducao.
   * @param {string} professionalId UUID do barbeiro da cadeira
   */
  async #onProducaoClick(professionalId, cadeiraEl = null) {
    if (!ClienteController.podeInteragir()) {
      const router = (typeof App !== 'undefined' && App) || null;
      if (router) router.push('cadastro');
      return;
    }

    // Guard: bloqueia clique quando barbearia está fechada ou em pausa
    if (!BarbershopAvailabilityService.canClientClickChair(this.#shopData)) {
      await this.#mostrarModalBarbeariaFechada();
      return;
    }

    // Guard: dono Inativo — balança a cadeira e avisa acima dela até ele reativar
    if (this.#donoInativo(professionalId)) {
      this.#feedbackCadeiraBloqueada(cadeiraEl);
      return;
    }

    const perfil = AuthService.getPerfil();

    // Guard: impede double-entry se o cliente já está na produção ou fila desta barbearia
    try {
      const filaAtiva   = await CadeiraService.getFilaAtiva(this.#shopId);
      const jaAssentado = perfil?.id && filaAtiva.some(
        e => (e.client_id ?? e.client?.id) === perfil.id &&
             (e.status === 'in_service' || e.status === 'waiting'),
      );
      if (jaAssentado) {
        NotificationService.mostrarToast(
          'Você já está na fila',
          'Aguarde ser chamado pelo barbeiro.',
          NotificationService.TIPOS.SISTEMA,
        );
        return;
      }
    } catch (_) { /* rede — deixa prosseguir; backend rejeita duplicata */ }

    const serviceIds = await ModalController.abrirSelecaoServicos({
      servicos: this.#servicos,
      barbershopId: this.#shopId,
    });
    if (serviceIds === null) return;

    await this.#executarFluxoProducao(professionalId, perfil, serviceIds);
  }

  /**
   * Fluxo de entrada na cadeira de PRODUÇÃO.
   * Reutilizado por #onProducaoClick (clique direto) e #onCadeiraClick
   * (auto-promoção quando a produção está vazia).
   * @param {string}      professionalId
   * @param {object|null} perfil
   * @param {string[]}    serviceIds
   */
  async #executarFluxoProducao(professionalId, perfil, serviceIds) {
    try {
      const entrada = await ChegadaProducaoService.iniciarFluxo({
        barbershopId:   this.#shopId,
        professionalId,
        clientId:       perfil?.id ?? null,
        serviceIds,
        shopData:       this.#shopData,
        clientePerfil:  perfil,
      });

      if (!entrada) return;

      if (this.#shopData) await this.#renderBarbeiros(this.#shopData);
      // iniciarPresenter=false: cliente em produção — sem notificações de posição na fila
      this.#iniciarPollers(perfil?.id, false);
    } catch (err) {
      LoggerService.error('[BarbeariaPage] erro ao sentar em produção:', err);
      NotificationService.mostrarToast(
        'Erro',
        err?.message ?? 'Não foi possível sentar na cadeira.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  /**
   * Inicia os pollers de sincronização após o cliente entrar na fila ou na produção.
   * @param {string|null}  perfilId         UUID do cliente logado
   * @param {boolean}      iniciarPresenter  true = fila de espera (envia notificações de posição)
   *                                        false = produção direta (sem notificações de posição)
   */
  #iniciarPollers(perfilId, iniciarPresenter) {
    if (!perfilId) return;
    QueuePoller.iniciar(this.#shopId, perfilId, () => {
      if (this.#shopData) {
        this.#renderBarbeiros(this.#shopData)
          .catch(err => LoggerService.warn('[BarbeariaPage] QueuePoller re-render falhou:', err));
      }
    });
    QueueRealtimeNotifier.iniciar(this.#shopId);
    QueueStateUpdater.iniciar(perfilId);
    if (iniciarPresenter) QueuePositionPresenter.iniciar(
      this.#shopData?.name ?? null,
      (typeof ApiService !== 'undefined' && this.#shopData?.logo_path)
        ? ApiService.getLogoUrl(this.#shopData.logo_path)
        : null,
    );
  }

  /** Capa e logo da barbearia. Usa .src — não innerHTML, sem risco XSS. */
  #renderCapa(shop) {
    if (this.#refs.capaImg) {
      const path = shop.cover_path ?? shop.logo_path;
      // ResourceLoader.loadImage injeta ?v={bust} para evitar cache de imagem antiga
      if (path) this.#refs.capaImg.src = ResourceLoader.loadImage(ApiService.getLogoUrl(path, shop.updated_at));
    }
    if (this.#refs.logoImg && shop.logo_path) {
      this.#refs.logoImg.src = ResourceLoader.loadImage(ApiService.getLogoUrl(shop.logo_path, shop.updated_at));
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
          '✂️ Cadastre-se agora — agende seu corte, favorite barbearias e aproveite o BarberFlow!';
        // Listener único por abertura de tela
        this.#refs.ctaLogin.onclick = () => { if (router) router.push('cadastro'); };
      }
    }

    if (this.#refs.endereco) {
      this.#refs.endereco.textContent = shop.address || '';
      this.#refs.endereco.hidden = !shop.address;
    }
    if (this.#refs.infoNome) {
      this.#refs.infoNome.textContent = shop.name ?? '';
    }
    if (this.#refs.infoCidade) {
      const partes = [shop.neighborhood, shop.city, shop.state].filter(Boolean);
      this.#refs.infoCidade.textContent = partes.join(' · ');
      this.#refs.infoCidade.hidden = partes.length === 0;
    }
    if (this.#refs.infoWhats) {
      this.#refs.infoWhats.textContent = shop.whatsapp
        ? `📲 Para mais informações: WhatsApp ${shop.whatsapp}` : '';
      this.#refs.infoWhats.hidden = !shop.whatsapp;
    }
    this.#atualizarBadge(shop);
    if (this.#refs.rating) {
      // Valor bruto — sem "⭐". Decoração fica no HTML/CSS.
      this.#refs.rating.textContent = Number(shop.rating_avg ?? 0).toFixed(1);
    }
    const likesCount = Number(shop.likes_count ?? 0);
    if (this.#refs.likesWrap) {
      this.#refs.likesWrap.dataset.barbershopId = this.#shopId;
      this.#refs.likesWrap.dataset.likes        = likesCount;
      this.#refs.likesWrap.dataset.dislikes     = Number(shop.dislikes_count ?? 0);
    }
    if (this.#refs.likes) {
      const cnt = this.#refs.likes.querySelector('.dc-count');
      if (cnt) cnt.textContent = likesCount;
      this.#refs.likes.classList.remove('ativo');
      this.#refs.likes.setAttribute('aria-pressed', 'false');
    }
    if (this.#refs.since && shop.founded_year) {
      // Card publico segue o texto do card Minha Barbearia.
      this.#refs.since.textContent = `Desde ${shop.founded_year}`;
      this.#refs.since.hidden = false;
    } else if (this.#refs.since) {
      this.#refs.since.textContent = '';
      this.#refs.since.hidden = true;
    }
  }

  /** Atualiza o badge de status (aberta/almoço/janta/fechada) no header e na capa. */
  #atualizarBadge(shop) {
    if (!this.#refs.badge && !this.#refs.capaStatus) return;
    const cr         = shop?.close_reason ?? null;
    const badgeLabel = StatusFechamentoModal.labelStatus(shop?.is_open, cr);
    const badgeVar   = StatusFechamentoModal.classBadge(shop?.is_open, cr);
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

  /** Botões WhatsApp, Favoritar e assegura delegation de like. */
  #renderAcoes(shop) {
    const isProfissional = typeof Pro !== 'undefined';

    BarbershopService.assegurarDelegacao();

    // WhatsApp: liberado no perfil publico; cadeira/agendamento seguem restritos ao cliente.
    if (this.#refs.whatsBtn) {
      if (shop.whatsapp) {
        const digits = shop.whatsapp.replace(/\D/g, '');
        this.#refs.whatsBtn.href   = `https://wa.me/${digits}`;
        this.#refs.whatsBtn.hidden = false;
      } else {
        this.#refs.whatsBtn.hidden = true;
      }
    }

    // Like: oculto para profissional (não pode curtir)
    if (this.#refs.likesWrap) {
      this.#refs.likesWrap.hidden = isProfissional;
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
  #renderServicos(lista, shop = null) {
    const el = this.#refs.servicosLista;
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = '<p class="bp-vazio">Nenhum servi\u00e7o cadastrado.</p>';
      return;
    }

    const s   = InputValidator.sanitizar;
    const fmt = v => `R$\u00a0${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

    const itens = lista.filter(sv => !BarbeariaPage.#isMensalidadeServico(sv, shop)).map(sv => {
      const nome  = s(sv.name ?? '');
      const preco = (sv.category === 'luzes' && sv.price_half != null)
        ? `${fmt(sv.price_half)} / ${fmt(sv.price)}`
        : fmt(sv.price);

      return `
        <div class="bp-serv-item" role="listitem">
          <h2 class="bp-serv-nome">${nome}</h2>
          <span class="bp-serv-preco">${preco}</span>
        </div>`;
    });

    // Mensalidade agora \u00e9 banner pr\u00f3prio (shop.monthly_plan_*) \u2014 n\u00e3o entra na lista.
    let html = '<div class="bp-serv-carousel" role="list">';
    for (let i = 0; i < itens.length; i += 5) {
      html += `<div class="bp-serv-coluna">${itens.slice(i, i + 5).join('')}</div>`;
    }
    html += '</div>';

    el.innerHTML = html;
    
    // Insere e exibe o separador entre serviços e mensalidade
    const divider = this.#obterDivider();
    if (divider) divider.hidden = false;
  }

  /** Cria e insere o divider entre carousel de serviços e banner de mensalidade. */
  #obterDivider() {
    let el = document.getElementById('bp-divider');
    if (el) return el;
    
    if (!this.#refs.servicosLista || typeof document === 'undefined') return null;

    el = document.createElement('div');
    el.id = 'bp-divider';
    el.className = 'bp-divider';
    el.hidden = true;
    const secaoServicos = this.#refs.servicosLista.closest?.('.bp-secao');
    (secaoServicos ?? this.#refs.servicosLista).insertAdjacentElement('afterend', el);
    return el;
  }

  static #isMensalidadeServico(servico, shop = null) {
    const texto = [
      servico?.category,
      servico?.name,
      servico?.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (/\b(mensalidade|mensal|mensalista)\b/.test(texto)) return true;

    const precoShop = Number(shop?.monthly_plan_price ?? 0);
    const precoServico = Number(servico?.price ?? 0);
    const mensagemShop = String(shop?.monthly_plan_message ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const textoConfereComMensagem = Boolean(mensagemShop) && texto.includes(mensagemShop);
    const pareceCadastroMensal = precoShop > 0
      && precoServico === precoShop
      && Number(servico?.duration_min ?? 30) === 30
      && !servico?.image_path;

    return pareceCadastroMensal || textoConfereComMensagem;
  }

  #obterMensalBanner() {
    if (this.#refs.mensalBanner) return this.#refs.mensalBanner;
    if (!this.#refs.servicosLista || typeof document === 'undefined') return null;

    const el = document.createElement('div');
    el.id = 'bp-mensal-banner';
    el.className = 'bp-mensal-banner';
    el.hidden = true;
    const secaoServicos = this.#refs.servicosLista.closest?.('.bp-secao');
    (secaoServicos ?? this.#refs.servicosLista).insertAdjacentElement('afterend', el);
    this.#refs.mensalBanner = el;
    return el;
  }

  /**
   * Card trigger de mensalidade na p\u00e1gina p\u00fablica.
   * Exibe bot\u00e3o compacto com pre\u00e7o; clique abre modal separado.
   * N\u00e3o renderiza junto \u00e0 lista de servi\u00e7os.
   * @param {object}        shop
   * @param {Array<object>} servicos
   */
  #renderMensalBanner(shop, servicos = []) {
    const el = this.#obterMensalBanner();
    if (!el) return;

    const mensalidadeServico = servicos.find(sv => BarbeariaPage.#isMensalidadeServico(sv, shop)) ?? null;
    const precoShop    = Number(shop?.monthly_plan_price ?? 0);
    const precoServico = Number(mensalidadeServico?.price ?? 0);
    const preco        = precoShop > 0 ? precoShop : precoServico;

    if (!preco || preco <= 0) {
      el.hidden = true;
      el.innerHTML = '';
      // Também oculta o divider quando não há mensalidade
      const divider = document.getElementById('bp-divider');
      if (divider) divider.hidden = true;
      return;
    }

    const s      = InputValidator.sanitizar;
    const val    = `R$\u00a0${Number(preco).toFixed(2).replace('.', ',')}`;
    const msgRaw = shop?.monthly_plan_message ?? mensalidadeServico?.description ?? mensalidadeServico?.name ?? '';
    const msg    = msgRaw ? s(String(msgRaw)) : '';
    const tituloMensalidade = 'Plano Mensalidade';
    const descricaoMensalidade = `Avise a barbearia <span style="font-weight: bold; color: #8b4513;"><strong>${s(shop?.name ?? 'barbearia')}</strong></span> que você está interessado no plano mensal. Peça mais detalhes ou solicite sua inclusão de forma simples e rápida! <span style="font-weight: bold; background: linear-gradient(to right, #d4af37, #8b4513); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Clique no banner</span>.`;

    el.innerHTML = `
      <h2 class="bp-mensal-banner__titulo">${s(tituloMensalidade)}</h2>
      <p class="bp-mensal-banner__descricao">${descricaoMensalidade}</p>
      <button class="bp-mensal-trigger" type="button" aria-label="Ver plano de mensalidade">
        <div class="bp-mensal-trigger__linha">
          <span class="bp-mensal-trigger__tag">Mensalidade</span>
          <span class="bp-mensal-trigger__valor">${val}<span class="bp-mensal-trigger__per">/m\u00eas</span></span>
        </div>
        ${msg ? `<p class="bp-mensal-trigger__msg">${msg}</p>` : ''}
        <span class="bp-mensal-trigger__icone" aria-hidden="true">&#8250;</span>
      </button>`;
    el.hidden = false;

    // Também exibe o divider (separador)
    const divider = document.getElementById('bp-divider');
    if (divider) divider.hidden = false;

    // onclick sobrescreve handler anterior \u2014 sem listeners duplicados em re-renders
    el.querySelector('.bp-mensal-trigger').onclick = () =>
      this.#abrirMensalModal(preco, msgRaw, shop);
  }

  /**
   * Cria o overlay do modal de mensalidade de forma lazy (1\u00aa abertura).
   * @returns {HTMLElement|null}
   */
  #obterMensalModal() {
    if (this.#mensalModal) return this.#mensalModal;
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'bp-mensal-modal-overlay';
    el.hidden = true;
    document.body.appendChild(el);
    this.#mensalModal = el;
    return el;
  }

  /**
   * Abre o modal de mensalidade com os dados da barbearia.
   * @param {number} preco
   * @param {string} msgRaw
   * @param {object} shop
   */
  #abrirMensalModal(preco, msgRaw, shop) {
    const overlay = this.#obterMensalModal();
    if (!overlay) return;

    const s       = InputValidator.sanitizar;
    const val     = `R$\u00a0${Number(preco).toFixed(2).replace('.', ',')}`;
    const msg     = msgRaw ? s(String(msgRaw)) : '';
    const shopName = s(String(shop?.name ?? 'a barbearia'));
    overlay.innerHTML = `
      <div class="bp-mensal-modal-card" role="dialog" aria-modal="true" aria-labelledby="bp-mensal-modal-titulo">
        <button class="bp-mensal-modal-fechar" type="button" aria-label="Fechar modal de mensalidade">
          <span aria-hidden="true">&#x2715;</span>
        </button>
        <div class="bp-mensal-modal-corpo">
          <span class="bp-mensal-modal-detalhe" aria-hidden="true"></span>
          <p class="bp-mensal-modal-tag">Plano de mensalidade</p>
          <h2 class="bp-mensal-modal-titulo" id="bp-mensal-modal-titulo">Fale com ${shopName}</h2>
          <p class="bp-mensal-modal-valor">${val}<span class="bp-mensal-modal-per">/m\u00eas</span></p>
          ${msg ? `<p class="bp-mensal-modal-msg">${msg}</p>` : ''}
          <p class="bp-mensal-modal-orientacao">Escolha como deseja continuar.</p>
          <div class="bp-mensal-modal-acoes">
            <button class="btn btn-outline btn-full bp-mensal-modal-chat" type="button">Entrar no chat</button>
            <button class="btn btn-gold btn-full bp-mensal-modal-interesse" type="button">Enviar interesse</button>
          </div>
        </div>
      </div>`;

    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('bp-mensal-modal-overlay--visivel'));

    // Fechar no X
    overlay.querySelector('.bp-mensal-modal-fechar').onclick = () => this.#fecharMensalModal();
    overlay.querySelector('.bp-mensal-modal-chat').onclick = async (e) => {
      const router = (typeof App !== 'undefined' && App)
                  || (typeof Pro !== 'undefined' && Pro)
                  || null;
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', router)) return;

      const btn = e.currentTarget;
      const textoOriginal = btn.textContent;
      try {
        if (!shop?.owner_id || typeof ConversationRepository === 'undefined') {
          throw new Error('Conversa indisponivel no momento.');
        }
        btn.disabled = true;
        btn.textContent = 'Abrindo...';
        const { data, error } = await ConversationRepository.buscarOuCriar(shop?.owner_id);
        if (error || !data?.id) throw error ?? new Error('Nao foi possivel abrir a conversa.');

        try { sessionStorage.setItem('bf_open_conversation_id', data.id); } catch {}
        this.#fecharMensalModal(true);
        router?.nav?.('mensagens');
        setTimeout(() => {
          if (typeof MessagesWidget !== 'undefined') {
            MessagesWidget.abrirConversaPersistida(data.id);
          }
        }, 160);
      } catch (err) {
        if (typeof NotificationService !== 'undefined') {
          NotificationService.mostrarToast(
            'Nao foi possivel abrir o chat',
            err?.message || 'Tente novamente.',
            NotificationService.TIPOS?.ERRO || NotificationService.TIPOS?.SISTEMA,
          );
        }
      } finally {
        btn.disabled = false;
        btn.textContent = textoOriginal;
      }
    };
    overlay.querySelector('.bp-mensal-modal-interesse').onclick = (e) => {
      if (typeof MensalidadeInterestService === 'undefined') return;
      MensalidadeInterestService.enviar({
        barbershopId: shop?.id ?? this.#shopId,
        planName: 'Plano Mensalidade',
        monthlyPrice: preco,
        btn: e.currentTarget,
        abrirConversa: false,
        onSuccess: () => {
          this.#fecharMensalModal(true);
          if (typeof NotificationService !== 'undefined') {
            NotificationService.mostrarToast(
              'Interesse enviado',
              'A barbearia recebeu sua mensagem.',
              NotificationService.TIPOS?.SUCESSO || NotificationService.TIPOS?.ENGAJAMENTO,
            );
          }
        },
      }).catch(() => {});
    };

    // Fechar clicando fora do card
    overlay.onclick = (e) => { if (e.target === overlay) this.#fecharMensalModal(); };

    // Fechar no Escape
    this.#mensalModalKeyHandler = (e) => { if (e.key === 'Escape') this.#fecharMensalModal(); };
    document.addEventListener('keydown', this.#mensalModalKeyHandler);

    // Foca o bot\u00e3o de fechar para acessibilidade
    setTimeout(() => overlay.querySelector('.bp-mensal-modal-fechar')?.focus(), 50);
  }

  /**
   * Fecha o modal de mensalidade.
   * @param {boolean} [imediato=false] \u2014 fecha sem anima\u00e7\u00e3o (chamado em navega\u00e7\u00e3o)
   */
  #fecharMensalModal(imediato = false) {
    const overlay = this.#mensalModal;
    if (!overlay || overlay.hidden) return;

    if (this.#mensalModalKeyHandler) {
      document.removeEventListener('keydown', this.#mensalModalKeyHandler);
      this.#mensalModalKeyHandler = null;
    }

    if (imediato) {
      overlay.hidden = true;
      overlay.classList.remove('bp-mensal-modal-overlay--visivel');
      overlay.innerHTML = '';
      return;
    }

    overlay.classList.remove('bp-mensal-modal-overlay--visivel');
    overlay.classList.add('bp-mensal-modal-overlay--saindo');
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('bp-mensal-modal-overlay--saindo');
      overlay.innerHTML = '';
    }, 230);
  }

  #abrirPortfolioViewer(index) {
    if (!this.#portfolioData.length || typeof PortfolioPrismViewer === 'undefined') return;
    // Filtra apenas itens com thumbnail para que o viewer não receba faces em branco
    let vi = 0;
    const items = this.#portfolioData
      .filter(img => img.thumbnail_path)
      .map(img => {
        const url = ApiService.getPortfolioThumbUrl?.(img.thumbnail_path) ?? '';
        // INÍCIO ALTERAÇÃO - professionalId correto para imagens da barbearia
        // Usa this.#shopData.owner_id (user UUID do dono) em vez de img.owner_id
        // (que é o UUID da barbearia). Sem isso, #handlePublicMessage retorna cedo
        // (!professionalId falsy) e a mensagem nunca é enviada nem salva no banco.
        const professionalId = img.professional_id
          ?? img.professionalId
          ?? this.#shopData?.owner_id
          ?? '';
        // FIM ALTERAÇÃO
        return {
          id: img.id,
          title: img.title ?? `Foto ${++vi}`,
          professionalId,
          professionalName: img.professional_name ?? img.professionalName ?? img.barber_name ?? img.barberName ?? '',
          professionalAvatarUrl: img.professional_avatar_url ?? img.professionalAvatarUrl ?? img.avatar_url ?? img.avatarUrl ?? '',
          fullUrl: url,
          thumbUrl: url,
          likesCount: img.likes_count ?? img.likesCount ?? 0,
          interactions: img.interactions ?? [],
          liked: Boolean(img.liked),
          portfolioPublicActions: Boolean(img.id),
        };
      });
    const target = items[index] ?? items[0];
    if (!target) return;
    this.#portfolioViewer ??= new PortfolioPrismViewer();
    this.#portfolioViewer.open(target, items);
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
    this.#portfolioData = lista;

    // vi conta apenas itens válidos — data-port-index mapeia para o array filtrado do viewer
    let vi = 0;
    el.innerHTML = lista.map(img => {
      if (!img.thumbnail_path) return '<div class="bp-port-item bp-port-item--vazio"></div>';
      const url = ApiService.getPortfolioThumbUrl?.(img.thumbnail_path)
               ?? ApiService.getLogoUrl(img.thumbnail_path) ?? '';
      return `<div class="bp-port-item" data-port-index="${vi++}" style="cursor:pointer;">
        <img src="${s(url)}" alt="${s(img.title ?? '')}" loading="lazy"
             onerror="this.closest('.bp-port-item').classList.add('bp-port-item--vazio')">
      </div>`;
    }).join('');

    // Delegação: onclick garante handler único mesmo após re-renders (não acumula listeners)
    el.onclick = e => {
      const item = e.target.closest('[data-port-index]');
      if (!item) return;
      this.#abrirPortfolioViewer(Number(item.dataset.portIndex));
    };
  }

  /**
   * Carrega e exibe a section de portfólio dos barbeiros.
   * Fire-and-forget — não bloqueia o render principal.
   */
  #renderPortfolioBarbeiros(shop) {
    const el   = this.#refs.portfolioBarbeiros;
    const wrap = this.#refs.portfolioBarbeirosWrap;
    if (!el || !wrap) return;

    const shopId = shop.id;
    PortfolioBarbeirosSection.iniciar(shopId, shop.owner_id ?? null, el)
      .then(temFotos => {
        // Stale-check: usuário pode ter navegado para outra barbearia
        if (this.#shopId !== shopId) return;
        wrap.hidden = !temFotos;
      })
      .catch(() => { if (wrap) wrap.hidden = true; });
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
    if (this.#refs.likesWrap) {
      this.#refs.likesWrap.dataset.barbershopId = '';
      this.#refs.likesWrap.dataset.likes    = '0';
      this.#refs.likesWrap.dataset.dislikes = '0';
    }
    if (this.#refs.likes) {
      const cnt = this.#refs.likes.querySelector('.dc-count');
      if (cnt) cnt.textContent = '0';
      this.#refs.likes.classList.remove('ativo');
      this.#refs.likes.setAttribute('aria-pressed', 'false');
    }
    if (this.#refs.since)    { this.#refs.since.textContent    = ''; }
    if (this.#refs.servicosLista) { this.#refs.servicosLista.innerHTML = ''; }
    if (this.#refs.portfolioGrid) { this.#refs.portfolioGrid.innerHTML = ''; }
    if (this.#refs.portfolioBarbeiros) { this.#refs.portfolioBarbeiros.innerHTML = ''; }
    if (this.#refs.portfolioBarbeirosWrap) { this.#refs.portfolioBarbeirosWrap.hidden = true; }
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
    // Fecha modal de mensalidade se estiver aberto
    this.#fecharMensalModal(true);
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
