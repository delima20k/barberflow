'use strict';

// =============================================================
// NavigationManager.js — Navegação controlada com pré-carregamento
//
// Responsabilidade única: orquestrar a transição entre contextos
// (ex: trocar de barbearia) garantindo que os dados novos são
// pré-carregados DURANTE a animação de entrada, eliminando o
// flash de conteúdo antigo e minimizando o tempo de skeleton.
//
// Fluxo de navegação:
//   1. beforeNavigate(id) — detecta troca → limpa estado anterior → inicia preload
//   2. navigate(navFn)    — executa a navegação (dispara animação de tela)
//   3. awaitPreload(id)   — chamado pelo renderer; aguarda preload sem bloquear UI
//
// Pattern: Observer-like via Promise — o renderer aguarda a conclusão do preload.
// Lazy loading: recursos só são buscados quando o usuário navega para o contexto.
//
// Dependências: CacheManager.js, StateManager.js,
//               BarbershopRepository.js, ApiService.js, LoggerService.js
// =============================================================

class NavigationManager {

  // TTL dos dados pré-carregados no CacheManager (5 minutos)
  static #TTL = 5 * 60 * 1000;

  // Map: contextId → Promise<void> dos preloads em andamento.
  // Garante que preloads duplicados para o mesmo contexto não são disparados.
  static #preloads = new Map();

  // ══════════════════════════════════════════════════════════
  // CICLO DE NAVEGAÇÃO — API PÚBLICA
  // ══════════════════════════════════════════════════════════

  /**
   * Ponto de entrada da navegação. Deve ser chamado no clique do card,
   * ANTES de navegar para a tela — permite que o preload ocorra em paralelo
   * com a animação de transição (~320–720 ms).
   *
   * Se o contexto não mudou → no-op (mesma barbearia já aberta).
   * Se mudou → atualiza estado → invalida cache anterior → inicia preload.
   *
   * @param {string} contextId — UUID do novo contexto (ex: barbershop id)
   */
  static beforeNavigate(contextId) {
    if (!StateManager.isContextChanged(contextId)) return;

    // Atualiza contexto: invalida cache do anterior + renova cache-bust de imagens
    StateManager.setCurrentContext(contextId);

    // Dispara preload em background — fire-and-forget; erros tratados internamente
    NavigationManager.preloadResources(contextId);
  }

  /**
   * Inicia (ou retorna o existente) o pré-carregamento de todos os recursos
   * de um contexto. Idempotente: chamadas duplicadas para o mesmo contextId
   * retornam a Promise já armazenada em #preloads.
   *
   * @param {string} contextId
   * @returns {Promise<void>} — resolve quando dados estão em CacheManager
   */
  static preloadResources(contextId) {
    // Já em andamento: retorna mesma Promise para evitar fetch duplicado
    if (NavigationManager.#preloads.has(contextId)) {
      return NavigationManager.#preloads.get(contextId);
    }

    // Todos os dados já em cache — resolve sem rede
    if (NavigationManager.#allCached(contextId)) return Promise.resolve();

    const promise = NavigationManager.#doPreload(contextId)
      .catch(err => {
        // Swallow: log sem propagar — awaitPreload sempre resolve
        if (typeof LoggerService !== 'undefined') {
          LoggerService.warn('[NavigationManager] preload falhou:', err?.message ?? err);
        }
      })
      .finally(() => NavigationManager.#preloads.delete(contextId));

    NavigationManager.#preloads.set(contextId, promise);
    return promise;
  }

  /**
   * Executa a função de navegação de tela.
   * Ponto de extensão para interceptors futuros (analytics, guards, etc.).
   *
   * @param {Function} navFn — função que dispara a navegação (ex: () => router.nav('barbearia'))
   */
  static navigate(navFn) {
    if (typeof navFn === 'function') navFn();
  }

  /**
   * Aguarda a conclusão do preload de um contexto.
   * NUNCA rejeita — sempre resolve. Se o preload falhou ou inexiste,
   * resolve imediatamente, permitindo fallback ao fetch direto no renderer.
   *
   * @param {string} contextId
   * @returns {Promise<void>}
   */
  static awaitPreload(contextId) {
    // #preloads já têm .catch() embutido → nunca rejeitam
    return NavigationManager.#preloads.get(contextId) ?? Promise.resolve();
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADO — PRELOAD
  // ══════════════════════════════════════════════════════════

  /**
   * Verifica se todos os dados do contexto já estão em cache.
   * @param {string} contextId
   * @returns {boolean}
   */
  static #allCached(contextId) {
    return !!(
      CacheManager.get(`${contextId}:shop`) &&
      CacheManager.get(`${contextId}:servicos`) &&
      CacheManager.get(`${contextId}:portfolio`)
    );
  }

  /**
   * Busca os dados do contexto e os armazena no CacheManager.
   * Lança erro em caso de falha de rede — o caller (.catch em preloadResources) trata.
   * @param {string} contextId
   * @returns {Promise<void>}
   */
  static async #doPreload(contextId) {
    const [shop, servicos, portfolio] = await Promise.all([
      BarbershopRepository.getById(contextId),
      NavigationManager.#fetchServicos(contextId),
      NavigationManager.#fetchPortfolio(contextId),
    ]);

    // Shop não encontrado — não popula cache; renderer exibirá mensagem de erro
    if (!shop) return;

    CacheManager.set(`${contextId}:shop`,      shop,      NavigationManager.#TTL);
    CacheManager.set(`${contextId}:servicos`,  servicos,  NavigationManager.#TTL);
    CacheManager.set(`${contextId}:portfolio`, portfolio, NavigationManager.#TTL);
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADO — FETCHERS
  // NavigationManager é o owner do pré-carregamento; os fetchers
  // são duplicados aqui intencionalmente (SRP: cada classe responsável
  // pelo próprio acesso à rede dentro de seu domínio).
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
}
