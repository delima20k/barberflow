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

  // ── privado ─────────────────────────────────────────────────────────────────

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
