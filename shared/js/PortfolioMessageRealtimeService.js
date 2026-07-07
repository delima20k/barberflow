'use strict';

/**
 * PortfolioMessageRealtimeService — Assinatura Supabase Realtime para
 * mensagens de portfólio recebidas pelo barbeiro.
 *
 * Escuta INSERT na tabela `portfolio_messages` filtrado por
 * `professional_id = profissionalId` e despacha o CustomEvent
 * `barberflow:portfolio-message-nova` para que a UI possa reagir.
 *
 * API pública (toda estática):
 *   PortfolioMessageRealtimeService.iniciar(profissionalId)
 *   PortfolioMessageRealtimeService.parar()
 *   PortfolioMessageRealtimeService.estaAtivo(profissionalId) → boolean
 */
class PortfolioMessageRealtimeService {

  /** @type {object|null} Canal Supabase ativo */
  static #canal = null;

  /** @type {string|null} ID do profissional inscrito */
  static #proId = null;

  /** @type {object|null} Canal Supabase de curtidas (stories + portfolio) */
  static #canalLikes = null;

  /** @type {string|null} owner_id inscrito para curtidas em tempo real */
  static #ownerLikes = null;

  /**
   * Inicia a assinatura para o profissional.
   * Se já houver assinatura ativa para o mesmo profissional, não faz nada.
   * Se for um profissional diferente, encerra a anterior antes de criar nova.
   *
   * @param {string} profissionalId — UUID do barbeiro logado
   */
  static iniciar(profissionalId) {
    if (typeof SupabaseService === 'undefined') return;
    if (!profissionalId) return;

    if (PortfolioMessageRealtimeService.#proId === profissionalId &&
        PortfolioMessageRealtimeService.#canal !== null) {
      return; // já ativo para este profissional
    }

    PortfolioMessageRealtimeService.parar();

    try {
      const canal = SupabaseService
        .channel(`portfolio-msgs:${profissionalId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'portfolio_messages',
            filter: `professional_id=eq.${profissionalId}`,
          },
          (payload) => PortfolioMessageRealtimeService.#despachar(payload.new),
        )
        .subscribe();

      PortfolioMessageRealtimeService.#canal = canal;
      PortfolioMessageRealtimeService.#proId  = profissionalId;
    } catch (err) {
      console.error('[PortfolioMessageRealtimeService] Falha ao iniciar canal:', err);
    }
  }

  /**
   * Encerra a assinatura ativa (se houver).
   */
  static parar() {
    if (PortfolioMessageRealtimeService.#canal === null) return;
    try {
      if (typeof SupabaseService !== 'undefined') {
        SupabaseService.removeChannel(PortfolioMessageRealtimeService.#canal);
      }
    } catch (err) {
      console.error('[PortfolioMessageRealtimeService] Falha ao remover canal:', err);
    } finally {
      PortfolioMessageRealtimeService.#canal = null;
      PortfolioMessageRealtimeService.#proId  = null;
    }
  }

  /**
   * Retorna se há assinatura ativa para o profissional informado.
   *
   * @param {string} profissionalId
   * @returns {boolean}
   */
  static estaAtivo(profissionalId) {
    return PortfolioMessageRealtimeService.#canal !== null &&
           PortfolioMessageRealtimeService.#proId  === profissionalId;
  }

  /**
   * Inicia a assinatura de CURTIDAS em tempo real para o profissional dono.
   *
   * Assina UPDATE em `stories` e `portfolio_images` filtrado por
   * `owner_id = ownerId` (triggers atômicos atualizam likes_count a cada
   * curtida). Despacha:
   *   - portfolio_images → 'barberflow:portfolio-like' (só contagem)
   *   - stories          → 'barberflow:story-like-sync'
   * para que os viewers/cards atualizem o contador ao vivo.
   *
   * Idempotente: mesma ownerId com canal ativo → no-op.
   * @param {string} ownerId — UUID do profissional logado (= profiles.id)
   */
  static iniciarLikes(ownerId) {
    if (typeof SupabaseService === 'undefined') return;
    if (!ownerId) return;

    if (PortfolioMessageRealtimeService.#ownerLikes === ownerId &&
        PortfolioMessageRealtimeService.#canalLikes !== null) {
      return; // já ativo para este dono
    }

    PortfolioMessageRealtimeService.pararLikes();

    try {
      const canal = SupabaseService
        .channel(`portfolio-likes:${ownerId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'portfolio_images',
            filter: `owner_id=eq.${ownerId}`,
          },
          (payload) => PortfolioMessageRealtimeService.#despacharLikePortfolio(payload.new),
        )
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'stories',
            filter: `owner_id=eq.${ownerId}`,
          },
          (payload) => PortfolioMessageRealtimeService.#despacharLikeStory(payload.new),
        )
        .subscribe();

      PortfolioMessageRealtimeService.#canalLikes = canal;
      PortfolioMessageRealtimeService.#ownerLikes = ownerId;
    } catch (err) {
      console.error('[PortfolioMessageRealtimeService] Falha ao iniciar canal de curtidas:', err);
    }
  }

  /** Encerra a assinatura de curtidas (se houver). */
  static pararLikes() {
    if (PortfolioMessageRealtimeService.#canalLikes === null) return;
    try {
      if (typeof SupabaseService !== 'undefined') {
        SupabaseService.removeChannel(PortfolioMessageRealtimeService.#canalLikes);
      }
    } catch (err) {
      console.error('[PortfolioMessageRealtimeService] Falha ao remover canal de curtidas:', err);
    } finally {
      PortfolioMessageRealtimeService.#canalLikes = null;
      PortfolioMessageRealtimeService.#ownerLikes = null;
    }
  }

  // ── privado ─────────────────────────────────────────────────────────────────

  /**
   * Despacha atualização de contagem de curtida de uma imagem de portfólio.
   * SEM o campo `liked` → os listeners tratam como atualização só-de-contagem
   * e preservam o estado "curtido" do próprio usuário.
   * @param {object} row — linha atualizada de portfolio_images (snake_case)
   */
  static #despacharLikePortfolio(row) {
    if (!row?.id) return;
    document.dispatchEvent(new CustomEvent('barberflow:portfolio-like', {
      bubbles: false,
      detail: {
        imageId:    row.id,
        likesCount: Math.max(0, Number(row.likes_count ?? 0)),
      },
    }));
  }

  /**
   * Despacha atualização de contagem de curtida de um story.
   * @param {object} row — linha atualizada de stories (snake_case)
   */
  static #despacharLikeStory(row) {
    if (!row?.media_id) return;
    document.dispatchEvent(new CustomEvent('barberflow:story-like-sync', {
      bubbles: false,
      detail: {
        mediaId:    row.media_id,
        likesCount: Math.max(0, Number(row.likes_count ?? 0)),
      },
    }));
  }

  /**
   * Despacha CustomEvent com os dados da nova mensagem.
   * @param {object} row — linha inserida no banco (snake_case)
   */
  static #despachar(row) {
    if (!row) return;
    const msg = {
      id:              row.id,
      portfolioImageId: row.portfolio_image_id,
      professionalId:  row.professional_id,
      body:            row.body ?? '',
      createdAt:       row.created_at,
      sender: {
        id:        row.sender_id,
        nome:      null,   // perfil não disponível via Realtime payload
        avatarUrl: null,
      },
    };
    document.dispatchEvent(new CustomEvent('barberflow:portfolio-message-nova', {
      bubbles: false,
      detail:  msg,
    }));
  }
}
