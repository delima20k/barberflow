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
  #pushEntradaId    = null;   // entradaId de push deep-link pendente (abre modal após render)

  // ── Constantes ────────────────────────────────────────────
  /** Intervalo de polling de status da barbearia em ms (fallback para Realtime). */
  static #SHOP_POLL_MS = 20_000;

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

    // Deep-link via Web Push: abre barbearia correta quando usuário clica na notificação
    document.addEventListener('barberflow:push-deep-link', e => {
      const { barbershopId, entradaId } = e.detail ?? {};
      if (!barbershopId) return;
      if (entradaId) this.#pushEntradaId = entradaId;
      this.abrirPorId(barbershopId).catch(() => {});
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
    const q  = sel => this.#telaEl.querySelector(sel);
    const dq = sel => document.querySelector(sel);
    this.#refs = {
      capaImg:       q('#bp-capa'),
      capaStatus:    q('#bp-capa-status'),
      logoImg:       q('#bp-logo'),
      nome:          q('#bp-nome'),
      // Os elementos abaixo vivem em #bp-info-fixa, fora de #tela-barbearia
      endereco:      dq('#bp-endereco'),
      badge:         dq('#bp-badge'),
      rating:        dq('#bp-rating'),
      likes:         dq('#bp-likes'),
      likesWrap:     dq('#bp-likes-wrap'),
      since:         dq('#bp-desde'),
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
      // Canais podem ter sido parados ao navegar para outra tela — reinicia todos
      if (this.#shopData) {
        this.#iniciarRealtimeFila(this.#shopData);
        this.#iniciarRealtimeShop(this.#shopData);
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
  static #criarRow({ barbeiro, isOwner, filaEntradas, podeInteragir, onProducaoVaziaClick, onCadeiraVaziaClick, onProducaoArrivingClick = null, clienteLogadoId = null }) {
    const row = document.createElement('div');
    row.className = `cdr-row${isOwner ? ' cdr-row--owner' : ''}`;

    row.appendChild(BarbeiroCard.criar({
      nome:       barbeiro.full_name ?? 'Barbeiro',
      avatarPath: barbeiro.avatar_path ?? null,
      updatedAt:  barbeiro.updated_at ?? null,
      isOwner,
      barberId:   barbeiro.id ?? null,
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
      filaWrap.appendChild(Cadeira.criar({
        tipo:          'fila',
        entrada:       e,
        posicao:       i + 1,
        podeInteragir: false,
        onClick:       null,
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
    this.#iniciarRealtimeFila(shop);
    this.#iniciarRealtimeShop(shop);
    this.#iniciarPollingShop(shop.id);
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

    el.innerHTML = '';
    for (const b of barbeiros) {
      const filaB = filaAtiva.filter(e => e.professional?.id === b.id);
      el.appendChild(BarbeariaPage.#criarRow({
        barbeiro:              b,
        isOwner:               b.id === shop.owner_id,
        filaEntradas:          filaB,
        podeInteragir,
        clienteLogadoId,
        onProducaoVaziaClick:     clientePodeInteragir
          ? () => this.#onProducaoClick(b.id)
          : null,
        onCadeiraVaziaClick:      clientePodeInteragir
          ? () => this.#onCadeiraClick(b.id)
          : null,
        onProducaoArrivingClick:  clientePodeInteragir
          ? (entrada) => this.#onProducaoArrivingClick(entrada)
          : null,
      }));
    }

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
  #onShopRealtime(payload) {
    const novo = payload?.new;
    if (!novo || !this.#shopData) return;

    // Guarda contra payload parcial do Realtime (sem is_open definido)
    if (novo.is_open === undefined) return;

    this.#shopData = {
      ...this.#shopData,
      is_open:      novo.is_open,
      close_reason: novo.close_reason ?? null,
    };

    // Atualiza o cache para evitar dado obsoleto na próxima navegação à mesma barbearia
    const cached = CacheManager.get(`${this.#shopId}:shop`);
    if (cached) CacheManager.set(`${this.#shopId}:shop`, this.#shopData, 5 * 60 * 1000);

    // Atualiza badge e re-renderiza cadeiras imediatamente (sem reload)
    this.#atualizarBadge(this.#shopData);
    this.#renderBarbeiros(this.#shopData).catch(() => {});
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
      ? ApiService.getLogoUrl(shop.logo_path)
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

    // Re-renderiza com o estado ATUAL da barbearia (this.#shopData pode ter is_open
    // diferente do shop capturado no closure quando o canal foi criado)
    await this.#renderBarbeiros(this.#shopData).catch(() => {});

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
        ? ApiService.getLogoUrl(shop.logo_path)
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
  async #onCadeiraClick(professionalId) {
    if (!ClienteController.podeInteragir()) return;

    // Guard: bloqueia entrada na fila quando barbearia está fechada ou em pausa
    if (!BarbershopAvailabilityService.canClientJoinQueue(this.#shopData)) {
      await this.#mostrarModalBarbeariaFechada();
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
  async #onProducaoClick(professionalId) {
    if (!ClienteController.podeInteragir()) return;

    // Guard: bloqueia clique quando barbearia está fechada ou em pausa
    if (!BarbershopAvailabilityService.canClientClickChair(this.#shopData)) {
      await this.#mostrarModalBarbeariaFechada();
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
      // Valor bruto — sem "Desde". Decoração fica no HTML/CSS.
      this.#refs.since.textContent = shop.founded_year;
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
    BarbershopService.assegurarDelegacao();
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
