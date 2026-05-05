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
  // Contador de geração: incrementado a cada limparCache() para invalidar
  // qualquer Promise in-flight e evitar que dados da sessão anterior
  // sobrescrevam o cache da nova sessão (race condition).
  static #GEN          = 0;
  static #DELEGATION   = false;

  /**
   * Carrega em cache os IDs de profissionais curtidos e favoritados
   * pelo usuário logado. Idempotente.
   */
  static async carregarInteracoes(force = false) {
    if (ProfessionalService.#CARREGADO && !force) {
      return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
    }
    // force=true ignora Promise em voo e inicia nova busca
    if (!force && ProfessionalService.#PROMISE) return ProfessionalService.#PROMISE;

    // Captura a geração atual — a Promise só grava no cache se ainda for válida
    const gen = ProfessionalService.#GEN;

    ProfessionalService.#PROMISE = (async () => {
      try {
        const user = await SupabaseService.getUser?.();
        if (gen !== ProfessionalService.#GEN) {
          return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
        }
        if (!user?.id) {
          ProfessionalService.#FAV_IDS   = new Set();
          ProfessionalService.#LIKE_IDS  = new Set();
          ProfessionalService.#CARREGADO = true; // evita re-fetches para usuário anônimo
          return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
        }
        const [favs, likes] = await Promise.allSettled([
          ProfileRepository.getUserProfessionalFavs(user.id),
          ProfileRepository.getUserProfessionalLikes(user.id),
        ]);
        if (gen !== ProfessionalService.#GEN) {
          return { favs: ProfessionalService.#FAV_IDS, likes: ProfessionalService.#LIKE_IDS };
        }
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

  /**
   * Limpa o cache de favoritos e curtidas de barbeiros.
   * Incrementa #GEN para invalidar qualquer Promise in-flight, evitando
   * que dados da sessão anterior sobrescrevam o cache após a troca de usuário.
   */
  static limparCache() {
    ProfessionalService.#GEN++;
    ProfessionalService.#FAV_IDS   = new Set();
    ProfessionalService.#LIKE_IDS  = new Set();
    ProfessionalService.#CARREGADO = false;
    ProfessionalService.#PROMISE   = null;
  }

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
    btn.title = ativo ? 'Já favoritado' : 'Adicionar aos favoritos';
    btn.innerHTML = `<span class="cfb-ico">${ativo ? '⭐' : '☆'}</span>`;
    // Nos cards o botão é add-only: desabilita quando já favoritado
    if (ativo) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
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
      const acao   = btnLike ? 'professional-like' : 'professional-favorite';
      if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao(acao, router)) return;

      if (btnLike) ProfessionalService.#toggleLike(btn);
      else {
        // Fora da página de detalhe, o botão é add-only: ignora clique se já ativo
        const naTelaDetalhe = btnFav.closest('#tela-barbeiro') !== null;
        if (!naTelaDetalhe && btnFav.classList.contains('ativo')) return;
        ProfessionalService.#toggleFavorito(btn);
      }
    }, true);
  }

  // ═══════════════════════════════════════════════════════════
  // HANDLERS PRIVADOS
  // ═══════════════════════════════════════════════════════════

  static async #toggleLike(btn) {
    const card  = btn.closest('[data-professional-id]');
    if (!card) return;
    const proId = card.dataset.professionalId;

    const era  = btn.classList.contains('ativo');
    const novo = !era;

    // Calcula novoTotal a partir do botão clicado (valor canônico)
    const cntEl    = btn.querySelector('.dc-count') || btn.querySelector('.clb-cnt');
    const current  = parseInt(cntEl?.textContent || '0', 10);
    const novoTotal = Math.max(0, novo ? current + 1 : current - 1);

    if (novo) ProfessionalService.#LIKE_IDS.add(proId);
    else      ProfessionalService.#LIKE_IDS.delete(proId);

    ProfessionalService.#sincronizarBotoes(proId, 'professional-like', novo, novoTotal);

    // Persiste no banco em background e re-sincroniza com o total real do banco
    try {
      const user = await SupabaseService.getUser?.();
      if (user?.id) {
        await ProfileRepository.toggleProfessionalLike(user.id, proId);
        // Busca o contador real (inclui curtidas de todos os usuários)
        const realCount = await ProfileRepository.getProfessionalLikeCount(proId);
        // Proteção: nunca reverter abaixo do valor otimista (trigger pode não estar rodando)
        const finalCount = Math.max(realCount, novoTotal);
        // #sincronizarBotoes já atualiza estrelas e dc-rating-num via atualizarEstrelaCard
        ProfessionalService.#sincronizarBotoes(proId, 'professional-like', novo, finalCount);
      }
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
  static #sincronizarBotoes(proId, action, ativo, novoTotal = null) {
    document.querySelectorAll(`[data-professional-id="${CSS.escape(proId)}"]`).forEach(el => {
      // el pode ser o próprio botão de detalhe (beiro-fav-btn tem data-professional-id
      // diretamente) ou um card container que contém botões de ação como filhos.
      const btns = el.dataset.action === action
        ? [el]
        : [...el.querySelectorAll(`[data-action="${action}"]`)];
      btns.forEach(btn => {
        btn.classList.toggle('ativo', ativo);
        btn.setAttribute('aria-pressed', String(ativo));

        if (action === 'professional-like') {
          // Usa valor canônico passado — todos os cards recebem o mesmo total
          const cnt = btn.querySelector('.dc-count') || btn.querySelector('.clb-cnt');
          if (cnt && novoTotal !== null) cnt.textContent = novoTotal;
          btn.title = ativo ? 'Remover curtida' : 'Curtir barbeiro';

          // Legado (.bc-rating) — busca no container (el); harmless se el === btn
          const total = novoTotal ?? (parseInt(cnt?.textContent || '0', 10));
          const starsEl = el.querySelector('.bc-stars');
          const valEl   = el.querySelector('.bc-rating-val');
          const cntEl   = el.querySelector('.bc-rating-cnt');
          if (starsEl) starsEl.textContent = ProfessionalService.renderStars(total);
          if (valEl)   valEl.textContent   = ProfessionalService.estrelasPorCurtidas(total).toFixed(1);
          if (cntEl)   cntEl.textContent   = `(${total})`;

          // Padrão tc-star unificado — delegado ao método central
          BarbershopService.atualizarEstrelaCard(el, ProfessionalService.estrelasPorCurtidas(total));
        } else {
          const ico = btn.querySelector('.cfb-ico');
          if (ico) ico.textContent = ativo ? '⭐' : '☆';
          // Fora da página de detalhe: add-only — desabilita quando favoritado
          const naTelaDetalhe = btn.closest('#tela-barbeiro') !== null;
          if (!naTelaDetalhe) {
            btn.disabled = ativo;
            btn.title = ativo ? 'Já favoritado' : 'Adicionar aos favoritos';
            if (ativo) btn.setAttribute('aria-disabled', 'true');
            else       btn.removeAttribute('aria-disabled');
          } else {
            btn.title = ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
          }
        }
      });
    });
  }
}
