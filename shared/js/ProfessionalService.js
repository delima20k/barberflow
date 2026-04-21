'use strict';

// =============================================================
// ProfessionalService.js — Serviço de negócio para profissionais
// (barbeiros). Espelha o padrão de BarbershopService:
//  • cache de IDs curtidos/favoritados
//  • factory de botões padronizados (.card-like-btn, .card-fav-btn)
//  • event delegation global único (idempotente)
//  • sincronização visual de TODOS os botões do mesmo id
//
// Dependências: ProfileRepository, SupabaseService, AppState,
//               AuthGuard, NotificationService, LoggerService
// =============================================================

class ProfessionalService {

  // ═══════════════════════════════════════════════════════════
  // CACHE — preenchido 1× após login
  // ═══════════════════════════════════════════════════════════
  static #FAV_IDS      = new Set();
  static #LIKE_IDS     = new Set();
  static #CARREGADO    = false;
  static #PROMISE      = null;
  static #DELEGATION   = false;

  /**
   * Carrega em cache os IDs de profissionais curtidos e favoritados
   * pelo usuário logado. Idempotente.
   */
  static async carregarInteracoes(force = false) {
    if (ProfessionalService.#CARREGADO && !force) {
      return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
    }
    if (ProfessionalService.#PROMISE) return ProfessionalService.#PROMISE;

    ProfessionalService.#PROMISE = (async () => {
      try {
        const user = await SupabaseService.getUser?.();
        if (!user?.id) {
          ProfessionalService.#FAV_IDS  = new Set();
          ProfessionalService.#LIKE_IDS = new Set();
          return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
        }
        const [favs, likes] = await Promise.allSettled([
          ProfileRepository.getUserProfessionalFavs(user.id),
          ProfileRepository.getUserProfessionalLikes(user.id),
        ]);
        ProfessionalService.#FAV_IDS  = favs.status  === 'fulfilled' ? favs.value  : new Set();
        ProfessionalService.#LIKE_IDS = likes.status === 'fulfilled' ? likes.value : new Set();
        ProfessionalService.#CARREGADO = true;
        return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
      } catch (e) {
        LoggerService.warn('[ProfessionalService] carregarInteracoes falhou:', e?.message);
        return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
      } finally {
        ProfessionalService.#PROMISE = null;
      }
    })();
    return ProfessionalService.#PROMISE;
  }

  static isFavorito(proId)  { return !!proId && ProfessionalService.#FAV_IDS.has(proId); }
  static isCurtido(proId)   { return !!proId && ProfessionalService.#LIKE_IDS.has(proId); }

  // ═══════════════════════════════════════════════════════════
  // CÁLCULO DE ESTRELAS A PARTIR DE CURTIDAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Limiares (cumulativos) de curtidas para preencher cada estrela.
   * Atingiu 1 curtida → 1★ · 5 → 2★ · 15 → 3★ · 40 → 4★ · 100 → 5★.
   * Mantido estático para escalabilidade e consistência de UI.
   */
  static #STAR_THRESHOLDS = [1, 5, 15, 40, 100];

  /**
   * Converte o número de curtidas em quantidade de estrelas cheias (0-5).
   * @param {number} likes
   * @returns {number} 0..5
   */
  static estrelasPorCurtidas(likes) {
    const n = Math.max(0, Number(likes) || 0);
    if (n === 0) return 0.0;
    // Média ponderada Bayesiana: cada curtida = 5.0, prior 3.0 com 5 votos
    const score = (3.0 * 5 + 5.0 * n) / (5 + n);
    return Math.round(score * 10) / 10;
  }

  /**
   * Retorna a string visual "★★★☆☆" correspondente ao número de curtidas.
   * @param {number} likes
   * @returns {string}
   */
  static renderStars(likes) {
    const cheias = ProfessionalService.estrelasPorCurtidas(likes);
    return '★'.repeat(cheias) + '☆'.repeat(Math.max(0, 5 - cheias));
  }

  // ═══════════════════════════════════════════════════════════
  // FACTORY DOS BOTÕES (stateless — lê cache e devolve <button>)
  // ═══════════════════════════════════════════════════════════

  /** Botão de curtir barbeiro — visual idêntico ao top-card__likes das barbearias. */
  static criarBotaoLike(proId, countInicial = 0) {
    const ativo = ProfessionalService.isCurtido(proId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'top-card__likes' + (ativo ? ' ativo' : '');
    btn.dataset.action = 'professional-like';
    btn.setAttribute('aria-label', 'Curtir barbeiro');
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Remover curtida' : 'Curtir barbeiro';
    btn.innerHTML =
      `<span class="tcl-ico">👍</span>` +
      `<span class="dc-count">${Math.max(0, Number(countInicial) || 0)}</span>`;
    ProfessionalService.#instalarDelegation();
    return btn;
  }

  /** Botão de favoritar barbeiro. */
  static criarBotaoFavorito(proId) {
    const ativo = ProfessionalService.isFavorito(proId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-fav-btn' + (ativo ? ' ativo' : '');
    btn.dataset.action = 'professional-favorite';
    btn.setAttribute('aria-label', 'Favoritar barbeiro');
    btn.setAttribute('aria-pressed', String(ativo));
    btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.innerHTML = `<span class="cfb-ico">${ativo ? '⭐' : '☆'}</span>`;
    ProfessionalService.#instalarDelegation();
    return btn;
  }

  // ═══════════════════════════════════════════════════════════
  // DELEGATION GLOBAL (um único listener idempotente)
  // ═══════════════════════════════════════════════════════════

  static #instalarDelegation() {
    if (ProfessionalService.#DELEGATION) return;
    ProfessionalService.#DELEGATION = true;
    document.addEventListener('click', (e) => {
      const btnLike = e.target.closest('[data-action="professional-like"]');
      const btnFav  = e.target.closest('[data-action="professional-favorite"]');
      const btn     = btnLike || btnFav;
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const router = typeof App !== 'undefined' ? App : null;
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('favoritar', router)) return;

      if (btnLike) ProfessionalService.#toggleLike(btn);
      else         ProfessionalService.#toggleFavorito(btn);
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // HANDLERS PRIVADOS
  // ═══════════════════════════════════════════════════════════

  static async #toggleLike(btn) {
    const card  = btn.closest('[data-professional-id]');
    if (!card) return;
    const proId = card.dataset.professionalId;

    const era    = btn.classList.contains('ativo');
    const novo   = !era;

    if (novo) ProfessionalService.#LIKE_IDS.add(proId);
    else      ProfessionalService.#LIKE_IDS.delete(proId);

    ProfessionalService.#sincronizarBotoes(proId, 'professional-like', novo);

    // Persiste no banco em background
    try {
      const user = await SupabaseService.getUser?.();
      if (user?.id) await ProfileRepository.toggleProfessionalLike(user.id, proId);
    } catch (e) {
      LoggerService.warn('[ProfessionalService] toggleLike falhou:', e?.message);
    }
  }

  static async #toggleFavorito(btn) {
    const card  = btn.closest('[data-professional-id]');
    if (!card) return;
    const proId = card.dataset.professionalId;

    const era  = btn.classList.contains('ativo');
    const novo = !era;

    if (novo) ProfessionalService.#FAV_IDS.add(proId);
    else      ProfessionalService.#FAV_IDS.delete(proId);

    ProfessionalService.#sincronizarBotoes(proId, 'professional-favorite', novo);

    if (typeof NotificationService !== 'undefined') {
      const msg = novo ? 'Você favoritou este Barbeiro ⭐' : 'Você desfavoritou este Barbeiro';
      NotificationService.mostrarToast(msg, '', NotificationService.TIPOS.SISTEMA);
    }

    try {
      const user = await SupabaseService.getUser?.();
      if (user?.id) await ProfileRepository.toggleFavoriteBarber(user.id, proId);
    } catch (e) {
      LoggerService.warn('[ProfessionalService] toggleFavorito falhou:', e?.message);
    }
  }

  /**
   * Atualiza visualmente TODOS os botões de um profissional
   * (pode aparecer em várias seções — home, lista, favoritos).
   * Também atualiza estrelas+pontuação com base no novo contador.
   * @private
   */
  static #sincronizarBotoes(proId, action, ativo) {
    document.querySelectorAll(`[data-professional-id="${CSS.escape(proId)}"]`).forEach(card => {
      card.querySelectorAll(`[data-action="${action}"]`).forEach(btn => {
        btn.classList.toggle('ativo', ativo);
        btn.setAttribute('aria-pressed', String(ativo));

        if (action === 'professional-like') {
          // Suporta .dc-count (novo top-card__likes) e .clb-cnt (legado)
          const cnt = btn.querySelector('.dc-count') || btn.querySelector('.clb-cnt');
          let novoTotal = 0;
          if (cnt) {
            const n = parseInt(cnt.textContent, 10) || 0;
            novoTotal = Math.max(0, ativo ? n + 1 : n - 1);
            cnt.textContent = novoTotal;
          }
          btn.title = ativo ? 'Remover curtida' : 'Curtir barbeiro';

          // Atualiza estrelas e pontuação do card (se tiver .bc-rating — padrão legado)
          const starsEl = card.querySelector('.bc-stars');
          const valEl   = card.querySelector('.bc-rating-val');
          const cntEl   = card.querySelector('.bc-rating-cnt');
          if (starsEl) starsEl.textContent = ProfessionalService.renderStars(novoTotal);
          if (valEl)   valEl.textContent   = ProfessionalService.estrelasPorCurtidas(novoTotal).toFixed(1);
          if (cntEl)   cntEl.textContent   = `(${novoTotal})`;

          // Atualiza estrelas individuais no card (padrão tc-star unificado)
          const novaVal = ProfessionalService.estrelasPorCurtidas(novoTotal);
          const numEl  = card.querySelector('.dc-rating-num');
          if (numEl) numEl.textContent = novaVal.toFixed(1);
          card.querySelectorAll('.tc-star').forEach((s, i) => {
            const pct = Math.min(100, Math.max(0, Math.round((novaVal - i) * 100)));
            s.style.setProperty('--pct', `${pct}%`);
          });
        } else {
          const ico = btn.querySelector('.cfb-ico');
          if (ico) ico.textContent = ativo ? '⭐' : '☆';
          btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
        }
      });
    });
  }
}
