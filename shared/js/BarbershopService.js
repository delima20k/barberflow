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
    if (likes + dislikes === 0) return 0.0;
    const ratio = likes / (likes + dislikes);
    const raw   = ratio * 5.0 - dislikes * 0.1;
    return Math.max(0.0, Math.min(5.0, Math.round(raw * 10) / 10));
  }

  /**
   * Atualiza os elementos de estrela/pontuação dentro de um card destaque.
   * Busca `.dc-stars-fill`, `.dc-rating-num` e `.dc-score-val` pelo card pai.
   * @param {HTMLElement} card — o elemento .destaque-card
   * @param {number} score — 0.0 a 5.0
   */
  static #atualizarEstrelaCard(card, score) {
    const fill = card.querySelector('.dc-stars-fill');
    const num  = card.querySelector('.dc-rating-num');
    const val  = card.querySelector('.dc-score-val');
    if (fill) fill.style.width = `${(score / 5) * 100}%`;
    if (num)  num.textContent  = score.toFixed(1);
    if (val)  val.textContent  = score.toFixed(1);
  }

  /**
   * Toggle de curtida (like) em um card de barbearia.
   * Persiste no banco via BarbershopRepository (usuário logado) ou
   * usa localStorage como fallback para anônimos.
   * @param {HTMLElement} btn — botão [data-action="barbershop-like"]
   */
  static async toggleBarbershopLike(btn) {
    const card         = btn.closest('[data-barbershop-id]');
    if (!card) return;
    const barbershopId = card.dataset.barbershopId;

    // Desabilita botão de dislike no mesmo card se ativo
    const dislikeBtn = card.querySelector('[data-action="barbershop-dislike"]');
    const eraDislike = dislikeBtn?.classList.contains('ativo');

    const eraLike = btn.classList.contains('ativo');
    btn.classList.toggle('ativo');
    const span = btn.querySelector('.dc-count');

    // Atualiza contador visual
    let likes    = parseInt(card.dataset.likes    ?? 0);
    let dislikes = parseInt(card.dataset.dislikes ?? 0);

    if (eraDislike) {
      dislikeBtn.classList.remove('ativo');
      dislikes = Math.max(0, dislikes - 1);
      card.dataset.dislikes = dislikes;
      const ds = dislikeBtn.querySelector('.dc-count');
      if (ds) ds.textContent = dislikes;
    }

    if (eraLike) {
      likes = Math.max(0, likes - 1);
    } else {
      likes += 1;
    }
    card.dataset.likes = likes;
    if (span) span.textContent = likes;

    BarbershopService.#atualizarEstrelaCard(card,
      BarbershopService.calcRatingScore(likes, dislikes));

    // Persiste no banco (silencioso se não logado)
    BarbershopService.#persistirInteracao(barbershopId, 'like', eraLike ? 'remove' : 'add');
  }

  /**
   * Toggle de descurtida (dislike) em um card de barbearia.
   * @param {HTMLElement} btn — botão [data-action="barbershop-dislike"]
   */
  static async toggleBarbershopDislike(btn) {
    const card         = btn.closest('[data-barbershop-id]');
    if (!card) return;
    const barbershopId = card.dataset.barbershopId;

    // Desabilita botão de like se ativo
    const likeBtn   = card.querySelector('[data-action="barbershop-like"]');
    const eraLike   = likeBtn?.classList.contains('ativo');
    const eraDislike = btn.classList.contains('ativo');

    btn.classList.toggle('ativo');

    let likes    = parseInt(card.dataset.likes    ?? 0);
    let dislikes = parseInt(card.dataset.dislikes ?? 0);

    if (eraLike) {
      likeBtn.classList.remove('ativo');
      likes = Math.max(0, likes - 1);
      card.dataset.likes = likes;
      const ls = likeBtn.querySelector('.dc-count');
      if (ls) ls.textContent = likes;
    }

    if (eraDislike) {
      dislikes = Math.max(0, dislikes - 1);
    } else {
      dislikes += 1;
    }
    card.dataset.dislikes = dislikes;
    const span = btn.querySelector('.dc-count');
    if (span) span.textContent = dislikes;

    BarbershopService.#atualizarEstrelaCard(card,
      BarbershopService.calcRatingScore(likes, dislikes));

    BarbershopService.#persistirInteracao(barbershopId, 'dislike', eraDislike ? 'remove' : 'add');
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
    btn.classList.toggle('ativo');
    btn.setAttribute('aria-pressed', String(!eraFav));
    btn.title = eraFav ? 'Adicionar aos favoritos' : 'Remover dos favoritos';

    BarbershopService.#persistirInteracao(barbershopId, 'favorite', eraFav ? 'remove' : 'add');
  }

  /**
   * Persiste ou remove uma interação no banco (silencioso se não logado).
   * @private
   */
  static async #persistirInteracao(barbershopId, type, op) {
    try {
      const user = await SupabaseService.getUser?.();
      if (!user?.id) return; // anônimo — não persiste
      if (op === 'add') {
        await BarbershopRepository.addInteraction(barbershopId, user.id, type);
      } else {
        await BarbershopRepository.removeInteraction(barbershopId, user.id, type);
      }
    } catch (e) {
      LoggerService.warn(`[BarbershopService] toggle ${type} falhou:`, e?.message);
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
          if (type === 'favorite') btn.setAttribute('aria-pressed', 'true');
        }
      });
    } catch (e) {
      LoggerService.warn('[BarbershopService] restaurarInteracoes falhou:', e?.message);
    }
  }
}
