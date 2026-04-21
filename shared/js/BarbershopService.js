'use strict';

// =============================================================
// BarbershopService.js — Serviço de negócio para barbearias.
// Aplica regras de negócio (proximidade, ordenação, like) sobre
// os dados retornados pelo BarbershopRepository.
// Nunca acessa Supabase diretamente — delega ao repositório.
//
// Dependências: BarbershopRepository.js, GeoService.js
// =============================================================

// Camada de serviço — contém regras de negócio para barbearias.
class BarbershopService {

  // ═══════════════════════════════════════════════════════════
  // CACHE DE FAVORITOS (barbearias) — preenchido 1× após login
  // ═══════════════════════════════════════════════════════════
  static #FAV_IDS = new Set();
  static #FAV_CARREGADO = false;
  static #FAV_PROMISE = null;
  static #DELEGATION_ATIVA = false;

  /**
   * Carrega todos os IDs de barbearias favoritadas do usuário logado
   * para o cache em memória. Idempotente.
   * @returns {Promise<Set<string>>}
   */
  static async carregarFavoritos(force = false) {
    if (BarbershopService.#FAV_CARREGADO && !force) return BarbershopService.#FAV_IDS;
    if (BarbershopService.#FAV_PROMISE) return BarbershopService.#FAV_PROMISE;

    BarbershopService.#FAV_PROMISE = (async () => {
      try {
        const user = await SupabaseService.getUser?.();
        if (!user?.id) { BarbershopService.#FAV_IDS = new Set(); return BarbershopService.#FAV_IDS; }
        const favs = await ProfileRepository.getFavorites(user.id);
        BarbershopService.#FAV_IDS = new Set((favs ?? []).map(f => f.id).filter(Boolean));
        BarbershopService.#FAV_CARREGADO = true;
        return BarbershopService.#FAV_IDS;
      } catch (e) {
        LoggerService.warn('[BarbershopService] carregarFavoritos falhou:', e?.message);
        return BarbershopService.#FAV_IDS;
      } finally {
        BarbershopService.#FAV_PROMISE = null;
      }
    })();
    return BarbershopService.#FAV_PROMISE;
  }

  /** @returns {boolean} */
  static isFavorito(barbershopId) {
    return !!barbershopId && BarbershopService.#FAV_IDS.has(barbershopId);
  }

  /**
   * Cria o botão de favorito padronizado para qualquer card de barbearia.
   * O card ancestral DEVE ter `data-barbershop-id`.
   * @param {string} barbershopId
   * @returns {HTMLButtonElement}
   */
  static criarBotaoFavoritoCard(barbershopId) {
    const btn = document.createElement('button');
    const ativo = BarbershopService.isFavorito(barbershopId);
    btn.type = 'button';
    btn.className = 'card-fav-btn' + (ativo ? ' ativo' : '');
    btn.dataset.action = 'barbershop-favorite';
    btn.setAttribute('aria-label', 'Favoritar barbearia');
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.innerHTML = `<span class="cfb-ico">${ativo ? '⭐' : '☆'}</span>`;
    BarbershopService.#instalarDelegation();
    return btn;
  }

  /**
   * Instala UM listener global (idempotente) para qualquer botão
   * .card-fav-btn em toda a aplicação — funciona na home, na lista
   * de barbearias e em qualquer tela futura.
   * @private
   */
  static #instalarDelegation() {
    if (BarbershopService.#DELEGATION_ATIVA) return;
    BarbershopService.#DELEGATION_ATIVA = true;
    document.addEventListener('click', (e) => {
      const btnFav     = e.target.closest('[data-action="barbershop-favorite"]');
      const btnLike    = e.target.closest('[data-action="barbershop-like"]');
      const btnDislike = e.target.closest('[data-action="barbershop-dislike"]');
      const btn = btnFav || btnLike || btnDislike;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const router = typeof App !== 'undefined' ? App : null;
      if (btnFav) {
        const guard = typeof AuthGuard !== 'undefined' ? AuthGuard.permitirAcao('barbershop-favorite', router) : true;
        if (!guard) return;
        BarbershopService.toggleBarbershopFavorite(btn);
      } else if (btnLike) {
        if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', router)) return;
        BarbershopService.toggleBarbershopLike(btn);
      } else {
        if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('like', router)) return;
        BarbershopService.toggleBarbershopDislike(btn);
      }
    }, true); // capture — roda antes do click do card
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITÁRIOS PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Calcula distância haversine em km entre dois pontos geográficos.
   * @private
   */
  static #haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, d = Math.PI / 180;
    const dLat = (lat2 - lat1) * d;
    const dLon = (lon2 - lon1) * d;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Enriquece uma lista de barbearias com `distance_km` e ordena por proximidade.
   * Silencioso se GPS não disponível — retorna lista na ordem original.
   * @param {object[]} lista
   * @returns {Promise<object[]>}
   * @private
   */
  static async #enriquecerComGeo(lista) {
    try {
      const perm = await GeoService.verificarPermissao();
      if (perm !== 'granted') return lista;

      const pos = await GeoService.obter();
      return lista
        .map(b => ({
          ...b,
          distance_km: b.latitude
            ? parseFloat(BarbershopService.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(1))
            : null,
        }))
        .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    } catch (_) {
      return lista; // GPS falhou — retorna sem enriquecimento
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Carrega todos os dados necessários para a tela inicial.
   * Retorna um objeto com cards, destaque e barbeiros.
   * As requisições são paralelas para máxima performance.
   * @returns {Promise<{cards: object[], destaque: object[], barbeiros: object[]}>}
   */
  static async loadHome() {
    const [rawCards, destaque, barbeiros] = await Promise.allSettled([
      BarbershopRepository.getAll(10),
      BarbershopRepository.getFeatured(6),
      BarbershopRepository.getBarbers(10),
    ]);

    const cards = rawCards.status === 'fulfilled'
      ? await BarbershopService.#enriquecerComGeo(rawCards.value)
      : [];

    return {
      cards,
      destaque:  destaque.status  === 'fulfilled' ? destaque.value  : [],
      barbeiros: barbeiros.status === 'fulfilled' ? barbeiros.value : [],
    };
  }

  /**
   * Busca barbearias próximas ao usuário dentro do raio especificado.
   * Requer GPS concedido — retorna [] se não disponível.
   * @param {number} radiusKm
   * @returns {Promise<object[]>}
   */
  static async loadNearby(radiusKm = 3) {
    const perm = await GeoService.verificarPermissao();
    if (perm !== 'granted') return [];

    const pos  = await GeoService.obter();
    const data = await BarbershopRepository.getNearby(pos.lat, pos.lng, radiusKm);

    return data
      .map(b => ({
        ...b,
        distance_km: parseFloat(
          BarbershopService.#haversine(pos.lat, pos.lng, b.latitude, b.longitude).toFixed(2)
        ),
      }))
      .filter(b => b.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);
  }

  /**
   * Busca textual enriquecida com geolocalização.
   * @param {string} query
   * @returns {Promise<object[]>}
   */
  static async search(query) {
    const data = await BarbershopRepository.search(query);
    return BarbershopService.#enriquecerComGeo(data);
  }

  // ═══════════════════════════════════════════════════════════
  // LOCALIZAÇÃO DA BARBEARIA
  // ═══════════════════════════════════════════════════════════

  /**
   * Salva a localização GPS atual como endereço da barbearia do owner.
   * Uso: barbeiro ativa o GPS no app → posição salva no banco → aparece no mapa.
   *
   * @param {string} ownerId  — UUID do dono
   * @param {number} lat      — latitude
   * @param {number} lng      — longitude
   * @returns {Promise<object>}
   */
  static async salvarLocalizacaoGPS(ownerId, lat, lng) {
    if (!ownerId) throw new TypeError('[BarbershopService] owner_id inválido');
    if (!isFinite(lat) || !isFinite(lng)) {
      throw new TypeError('[BarbershopService] coordenadas inválidas');
    }
    return BarbershopRepository.updateLocation(ownerId, lat, lng);
  }

  /**
   * Consulta o ViaCEP (gratuito, sem chave) e retorna o endereço estruturado.
   * Não faz geocodificação — apenas converte CEP em logradouro/cidade/UF.
   *
   * @param {string} cep — 8 dígitos (com ou sem hífen)
   * @returns {Promise<{address: string, city: string, state: string, zip_code: string}>}
   */
  static async geocodificarCep(cep) {
    const limpo = String(cep ?? '').replace(/\D/g, '');
    if (limpo.length !== 8) {
      throw new TypeError('[BarbershopService] CEP com formato inválido — esperado 8 dígitos');
    }

    let resposta;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      resposta = await res.json();
    } catch {
      throw new Error('[BarbershopService] Falha ao consultar serviço ViaCEP (rede offline?)');
    }

    if (resposta?.erro) {
      throw new Error(`[BarbershopService] CEP ${limpo} não encontrado no ViaCEP`);
    }

    const address = [resposta.logradouro, resposta.bairro].filter(Boolean).join(', ');
    return {
      address,
      city:     resposta.localidade ?? '',
      state:    resposta.uf          ?? '',
      zip_code: resposta.cep         ?? `${limpo.slice(0,5)}-${limpo.slice(5)}`,
    };
  }

  /**
   * Fluxo completo: CEP → ViaCEP → endereço → Nominatim → coords → banco.
   * Após este método o pin da barbearia aparece no mapa dos clientes.
   *
   * @param {string} ownerId — UUID do dono da barbearia
   * @param {string} cep     — CEP (8 dígitos, com ou sem hífen)
   * @returns {Promise<object>} — registro da barbearia atualizado
   */
  static async salvarLocalizacaoCep(ownerId, cep) {
    // 1. CEP → endereço estruturado
    const { address, city, state, zip_code } = await BarbershopService.geocodificarCep(cep);

    // 2. Endereço → coordenadas via Nominatim (OpenStreetMap, gratuito, sem chave)
    const query   = encodeURIComponent(`${address}, ${city}, ${state}, Brasil`);
    const nomUrl  = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=br`;
    let coords;
    try {
      const res    = await fetch(nomUrl, { headers: { 'Accept-Language': 'pt-BR' } });
      const lista  = await res.json();
      if (!lista?.length) {
        throw new Error(`[BarbershopService] Endereço não encontrado no Nominatim: "${address}, ${city}"`);
      }
      coords = { lat: parseFloat(lista[0].lat), lng: parseFloat(lista[0].lon) };
    } catch (e) {
      if (e.message.includes('BarbershopService')) throw e;
      throw new Error(`[BarbershopService] Falha ao consultar coordenadas: ${e.message}`);
    }

    // 3. Persiste no banco
    return BarbershopRepository.updateLocation(
      ownerId, coords.lat, coords.lng, address, city, state, zip_code
    );
  }

  /**
   * Toggle de like nos stories — atualiza a UI imediatamente (optimistic).
   * @param {HTMLElement} btn — botão .story-like-btn
   */
  static toggleLike(btn) {
    btn.classList.toggle('curtido');
    const span = btn.querySelector('.story-like-count');
    if (!span) return;
    const n = parseInt(span.textContent) || 0;
    span.textContent = btn.classList.contains('curtido') ? n + 1 : n - 1;
  }

  // ═══════════════════════════════════════════════════════════
  // INTERAÇÕES DOS CARDS DESTAQUE (like / dislike / favorite)
  // ═══════════════════════════════════════════════════════════

  /**
   * Calcula e renderiza a pontuação visual (estrelas + número)
   * com base nos contadores de like e dislike.
   *
   * Fórmula:
   *   ratio = likes / (likes + dislikes)
   *   score = CLAMP(ratio * 5.0 - dislikes * 0.1, 0.0, 5.0)
   *   Arredondado a 1 decimal.
   *
   * @param {number} likes
   * @param {number} dislikes
   * @returns {number} score 0.0–5.0
   */
  static calcRatingScore(likes, dislikes) {
    const total = likes + dislikes;
    if (total === 0) return 0.0;
    // Média ponderada: like = 5.0, dislike = 1.0
    const avg = (likes * 5.0 + dislikes * 1.0) / total;
    // Suavização Bayesiana (estabiliza com poucos votos, como iFood/99)
    // Prior: 5 avaliações fantasmas com nota 3.0
    const PRIOR_N = 5, PRIOR_MEAN = 3.0;
    const score = (PRIOR_MEAN * PRIOR_N + avg * total) / (PRIOR_N + total);
    return Math.round(score * 10) / 10;
  }

  /**
   * Gera o HTML de 5 estrelas com preenchimento progressivo individual.
   * Cada estrela é um <span class="tc-star"> com CSS custom property --pct.
   * @param {number} score — 0.0 a 5.0
   * @returns {string} HTML string
   */
  static criarEstrelasHTML(score) {
    const s = Math.max(0, Math.min(5, Number(score) || 0));
    const spans = Array.from({ length: 5 }, (_, i) => {
      const pct = Math.min(100, Math.max(0, Math.round((s - i) * 100)));
      return `<span class="tc-star" style="--pct:${pct}%" aria-hidden="true">★</span>`;
    }).join('');
    return `<span class="tc-stars-row">${spans}</span>`;
  }

  /**
   * Atualiza os elementos de estrela/pontuação dentro de um card.
   * Suporta .tc-star (novo padrão progressivo individual).
   * @param {HTMLElement} card
   * @param {number} score — 0.0 a 5.0
   */
  static #atualizarEstrelaCard(card, score) {
    card.querySelectorAll('.tc-star').forEach((s, i) => {
      const pct = Math.min(100, Math.max(0, Math.round((score - i) * 100)));
      s.style.setProperty('--pct', `${pct}%`);
    });
    const num = card.querySelector('.dc-rating-num');
    const val = card.querySelector('.dc-score-val');
    if (num) num.textContent = score.toFixed(1);
    if (val) val.textContent = score.toFixed(1);
  }

  /**
   * Toggle de curtida (like) em um card de barbearia.
   * Persiste no banco via BarbershopRepository (usuário logado).
   * Rollback do update otimista se a persistência falhar.
   * @param {HTMLElement} btn — botão [data-action="barbershop-like"]
   */
  static async toggleBarbershopLike(btn) {
    const card         = btn.closest('[data-barbershop-id]');
    if (!card) return;
    const barbershopId = card.dataset.barbershopId;

    const dislikeBtn   = card.querySelector('[data-action="barbershop-dislike"]');
    const eraDislike   = dislikeBtn?.classList.contains('ativo');
    const eraLike      = btn.classList.contains('ativo');

    // Estado anterior (para rollback)
    const prevLikes    = parseInt(card.dataset.likes    ?? 0);
    const prevDislikes = parseInt(card.dataset.dislikes ?? 0);
    const prevScore    = BarbershopService.calcRatingScore(prevLikes, prevDislikes);

    // Novos contadores otimistas
    let likes    = prevLikes;
    let dislikes = prevDislikes;
    if (eraDislike) dislikes = Math.max(0, dislikes - 1);
    if (eraLike)    likes    = Math.max(0, likes - 1);
    else            likes   += 1;

    const novoScore = BarbershopService.calcRatingScore(likes, dislikes);

    // 1) Feedback otimista imediato em todos os cards
    BarbershopService.#sincronizarContadores(barbershopId, likes, dislikes, novoScore, !eraLike, false, eraDislike);

    // 2) Persiste no banco
    const resultado = await BarbershopService.#persistirInteracao(barbershopId, 'like', eraLike ? 'remove' : 'add');

    if (resultado === 'noauth') {
      // Usuário deslogou entre o clique e a persistência — rollback
      BarbershopService.#sincronizarContadores(barbershopId, prevLikes, prevDislikes, prevScore, eraLike, eraDislike, false);
      return;
    }
    if (resultado === 'error') {
      // Falha técnica (tabela ausente, rede) — mantém UI otímista, avisa e para aqui
      NotificationService?.mostrarToast?.('Não foi possível salvar. Tente novamente.', '', 'info');
      return;
    }

    // 3) 'ok' — re-sincroniza com valores reais do banco (inclui curtidas de todos)
    await BarbershopService.#sincronizarComBanco(barbershopId);
  }

  /**
   * Toggle de descurtida (dislike) em um card de barbearia.
   * Rollback do update otimista se a persistência falhar.
   * @param {HTMLElement} btn — botão [data-action="barbershop-dislike"]
   */
  static async toggleBarbershopDislike(btn) {
    const card         = btn.closest('[data-barbershop-id]');
    if (!card) return;
    const barbershopId = card.dataset.barbershopId;

    const likeBtn      = card.querySelector('[data-action="barbershop-like"]');
    const eraLike      = likeBtn?.classList.contains('ativo');
    const eraDislike   = btn.classList.contains('ativo');

    // Estado anterior (para rollback)
    const prevLikes    = parseInt(card.dataset.likes    ?? 0);
    const prevDislikes = parseInt(card.dataset.dislikes ?? 0);
    const prevScore    = BarbershopService.calcRatingScore(prevLikes, prevDislikes);

    let likes    = prevLikes;
    let dislikes = prevDislikes;
    if (eraLike)    likes    = Math.max(0, likes - 1);
    if (eraDislike) dislikes = Math.max(0, dislikes - 1);
    else            dislikes += 1;

    const novoScore = BarbershopService.calcRatingScore(likes, dislikes);

    // 1) Feedback otimista imediato em todos os cards
    BarbershopService.#sincronizarContadores(
      barbershopId, likes, dislikes, novoScore, false, !eraDislike, eraLike
    );

    // 2) Persiste no banco
    const resultado = await BarbershopService.#persistirInteracao(barbershopId, 'dislike', eraDislike ? 'remove' : 'add');

    if (resultado === 'noauth') {
      BarbershopService.#sincronizarContadores(barbershopId, prevLikes, prevDislikes, prevScore, eraLike, eraDislike, false);
      return;
    }
    if (resultado === 'error') {
      NotificationService?.mostrarToast?.('Não foi possível salvar. Tente novamente.', '', 'info');
      return;
    }

    // 3) 'ok' — re-sincroniza com valores reais do banco
    await BarbershopService.#sincronizarComBanco(barbershopId);
  }

  /**
   * Toggle de favorito em um card de barbearia.
   * Salva no banco para exibir na tela de favoritas.
   * @param {HTMLElement} btn — botão [data-action="barbershop-favorite"]
   */
  static async toggleBarbershopFavorite(btn) {
    const card         = btn.closest('[data-barbershop-id]');
    if (!card) return;
    const barbershopId = card.dataset.barbershopId;

    const eraFav = btn.classList.contains('ativo');
    const novoEstado = !eraFav;

    // Atualiza cache em memória (estado canônico)
    if (novoEstado) BarbershopService.#FAV_IDS.add(barbershopId);
    else            BarbershopService.#FAV_IDS.delete(barbershopId);

    // Sincroniza TODOS os botões do mesmo barbershopId na tela
    BarbershopService.#sincronizarBotoesFavorito(barbershopId, novoEstado);

    // Feedback visual imediato via toast
    if (typeof NotificationService !== 'undefined') {
      if (eraFav) {
        NotificationService.mostrarToast('Você desfavoritou esta Barbearia', '', NotificationService.TIPOS.SISTEMA);
      } else {
        NotificationService.mostrarToast('Você favoritou esta Barbearia ⭐', '', NotificationService.TIPOS.BARBEARIA);
      }
    }

    BarbershopService.#persistirInteracao(barbershopId, 'favorite', eraFav ? 'remove' : 'add');
  }

  /**
   * Atualiza o visual de TODOS os botões de favorito que apontam para
   * a mesma barbearia (pode aparecer em várias seções simultaneamente).
   * @private
   */
  static #sincronizarBotoesFavorito(barbershopId, ativo) {
    document.querySelectorAll(`[data-barbershop-id="${CSS.escape(barbershopId)}"]`).forEach(card => {
      card.querySelectorAll('[data-action="barbershop-favorite"]').forEach(btn => {
        btn.classList.toggle('ativo', ativo);
        btn.setAttribute('aria-pressed', String(ativo));
        btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
        // Troca ícone só em botões que usam .cfb-ico (card-fav-btn)
        const ico = btn.querySelector('.cfb-ico');
        if (ico) ico.textContent = ativo ? '⭐' : '☆';
      });
    });
  }

  /**
   * Sincroniza contadores, estado dos botões e estrelas em TODOS os cards
   * com o mesmo barbershopId — funciona para like e dislike.
   * @param {string}  barbershopId
   * @param {number}  likes          novo total de likes
   * @param {number}  dislikes       novo total de dislikes
   * @param {number}  score          novo score já calculado
   * @param {boolean} likeAtivo      true se o like deve ficar marcado
   * @param {boolean} dislikeAtivo   true se o dislike deve ficar marcado
   * @param {boolean} removeuOposto  true se o botão oposto foi retirado
   * @private
   */
  static #sincronizarContadores(barbershopId, likes, dislikes, score, likeAtivo, dislikeAtivo, removeuOposto) {
    document.querySelectorAll(`[data-barbershop-id="${CSS.escape(barbershopId)}"]`).forEach(card => {
      // datasets canônicos
      card.dataset.likes    = likes;
      card.dataset.dislikes = dislikes;

      // Botão like
      const likeBtn = card.querySelector('[data-action="barbershop-like"]');
      if (likeBtn) {
        likeBtn.classList.toggle('ativo', likeAtivo);
        const cnt = likeBtn.querySelector('.dc-count');
        if (cnt) cnt.textContent = likes;
      }

      // Botão dislike
      const dislikeBtn = card.querySelector('[data-action="barbershop-dislike"]');
      if (dislikeBtn) {
        dislikeBtn.classList.toggle('ativo', dislikeAtivo);
        const ds = dislikeBtn.querySelector('.dc-count');
        if (ds) ds.textContent = dislikes;
      }

      // Estrelas individuais + número
      BarbershopService.#atualizarEstrelaCard(card, score);
    });
  }

  /**
   * Após persistir no banco, busca os valores reais (likes_count, dislikes_count, rating_score)
   * e re-sincroniza TODOS os cards com os contadores que refletem curtidas de todos os usuários.
   * @private
   */
  static async #sincronizarComBanco(barbershopId) {
    try {
      const stats = await BarbershopRepository.getStats(barbershopId);
      if (!stats) return;
      const { likes_count, dislikes_count, rating_score } = stats;

      document.querySelectorAll(`[data-barbershop-id="${CSS.escape(barbershopId)}"]`).forEach(card => {
        // Proteção: nunca reverter para valores menores que o estado otimista atual.
        // Isso ocorre quando o trigger do banco ainda não está configurado e retorna 0.
        const optLikes    = parseInt(card.dataset.likes    ?? 0);
        const optDislikes = parseInt(card.dataset.dislikes ?? 0);
        const finalLikes    = Math.max(likes_count,    optLikes);
        const finalDislikes = Math.max(dislikes_count, optDislikes);
        // Se banco retornou score 0 mas temos curtidas otimistas, recalcula localmente
        const finalScore = (rating_score > 0)
          ? Number(rating_score)
          : BarbershopService.calcRatingScore(finalLikes, finalDislikes);

        card.dataset.likes    = finalLikes;
        card.dataset.dislikes = finalDislikes;

        const likeBtn    = card.querySelector('[data-action="barbershop-like"]');
        const dislikeBtn = card.querySelector('[data-action="barbershop-dislike"]');
        if (likeBtn) {
          const cnt = likeBtn.querySelector('.dc-count');
          if (cnt) cnt.textContent = finalLikes;
        }
        if (dislikeBtn) {
          const ds = dislikeBtn.querySelector('.dc-count');
          if (ds) ds.textContent = finalDislikes;
        }
        BarbershopService.#atualizarEstrelaCard(card, finalScore);
      });
    } catch (e) {
      LoggerService.warn('[BarbershopService] sincronizarComBanco falhou:', e?.message);
    }
  }

  /**
   * Persiste ou remove uma interação no banco.
   * @returns {Promise<'ok'|'noauth'|'error'>}
   *   'ok'     — salvo com sucesso → pode sincronizar com banco
   *   'noauth' — usuário não logado  → rollback correto
   *   'error'  — falha técnica (tabela ausente, rede) → mantém UI otímista, não faz rollback
   * @private
   */
  static async #persistirInteracao(barbershopId, type, op) {
    try {
      const user = await SupabaseService.getUser?.();
      if (!user?.id) return 'noauth';
      if (op === 'add') {
        await BarbershopRepository.addInteraction(barbershopId, user.id, type);
      } else {
        await BarbershopRepository.removeInteraction(barbershopId, user.id, type);
      }
      return 'ok';
    } catch (e) {
      LoggerService.warn(`[BarbershopService] toggle ${type} falhou:`, e?.message);
      return 'error';
    }
  }

  /**
   * Marca os botões dos cards como ativos com base nas interações do usuário logado.
   * Deve ser chamado após renderizar os cards destaque.
   * @param {NodeListOf<Element>} cards — todos os .destaque-card
   */
  static async restaurarInteracoes(cards) {
    try {
      if (typeof AppState !== 'undefined' && AppState.get('isLogado') !== true) return;
      const user = await SupabaseService.getUser?.();
      if (!user?.id) return;
      const ids = [...cards].map(c => c.dataset.barbershopId).filter(Boolean);
      if (!ids.length) return;
      const interacoes = await BarbershopRepository.getUserInteractions(user.id, ids);
      interacoes.forEach(({ barbershop_id, type }) => {
        const card = [...cards].find(c => c.dataset.barbershopId === barbershop_id);
        if (!card) return;
        const btn = card.querySelector(`[data-action="barbershop-${type}"]`);
        if (btn) {
          btn.classList.add('ativo');
          if (type === 'favorite') {
            btn.setAttribute('aria-pressed', 'true');
            BarbershopService.#FAV_IDS.add(barbershop_id);
            const ico = btn.querySelector('.cfb-ico');
            if (ico) ico.textContent = '⭐';
          }
        }
      });
    } catch (e) {
      LoggerService.warn('[BarbershopService] restaurarInteracoes falhou:', e?.message);
    }
  }
}
