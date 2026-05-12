'use strict';

// =============================================================
// QueueRealtimeNotifier.js — Gateway WebSocket para queue_entries.
//
// Responsabilidade ÚNICA: manter canais Supabase Realtime ativos
// para atualizações da tabela queue_entries por barbearia e
// despachar CustomEvent 'barberflow:fila-atualizada' quando a
// fila mudar.
//
// Quem consome o evento é responsável por reagir (re-render,
// cálculo de posição, etc.) — esta classe só notifica.
//
// Suporta múltiplas barbearias simultâneas via #canais (Map).
// Idempotente: iniciar() duas vezes para o mesmo shop é no-op.
//
// Evento despachado:
//   'barberflow:fila-atualizada'
//   detail: { fila: object[], barbershopId: string }
//
// Dependências: SupabaseService.js, QueueRepository.js, LoggerService.js
// =============================================================

class QueueRealtimeNotifier {

  /** @type {Map<string, object>} shopId → canal Supabase */
  static #canais = new Map();

  /** @type {Set<string>} shopIds com fetch em andamento (evita race condition) */
  static #buscando = new Set();

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre canal Realtime para a barbearia informada.
   * Idempotente: chamadas duplicadas para o mesmo shopId são ignoradas.
   *
   * @param {string} barbershopId
   */
  static iniciar(barbershopId) {
    if (!barbershopId) return;
    if (QueueRealtimeNotifier.#canais.has(barbershopId)) return;

    try {
      const client = SupabaseService.client;
      if (!client) return;

      const canal = client
        .channel(`fila-barbershop:${barbershopId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'queue_entries',
            filter: `barbershop_id=eq.${barbershopId}`,
          },
          () => QueueRealtimeNotifier.#onUpdate(barbershopId),
        )
        .subscribe();

      QueueRealtimeNotifier.#canais.set(barbershopId, canal);
    } catch (err) {
      LoggerService.warn('[QueueRealtimeNotifier] Canal indisponível:', err?.message);
    }
  }

  /**
   * Encerra canal(s) Realtime.
   * Sem argumento: encerra todos.
   *
   * @param {string} [barbershopId] — omitir para encerrar todos
   */
  static parar(barbershopId) {
    if (barbershopId !== undefined) {
      QueueRealtimeNotifier.#removerCanal(barbershopId);
    } else {
      for (const id of [...QueueRealtimeNotifier.#canais.keys()]) {
        QueueRealtimeNotifier.#removerCanal(id);
      }
    }
  }

  /**
   * Retorna true se há canal ativo para o shopId.
   * @param {string} barbershopId
   * @returns {boolean}
   */
  static estaAtivo(barbershopId) {
    return QueueRealtimeNotifier.#canais.has(barbershopId);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Chamado pelo Realtime quando qualquer queue_entry da barbearia é atualizada.
   * Re-busca a fila completa (fonte de verdade) e despacha o evento DOM.
   * @param {string} barbershopId
   */
  static async #onUpdate(barbershopId) {
    // Guarda in-flight: ignora evento se já há um fetch em andamento para este shop.
    // Evita race condition com eventos Realtime em rajada.
    if (QueueRealtimeNotifier.#buscando.has(barbershopId)) return;
    QueueRealtimeNotifier.#buscando.add(barbershopId);

    try {
      const fila = await QueueRepository.getByBarbershop(barbershopId);

      document.dispatchEvent(
        new CustomEvent('barberflow:fila-atualizada', {
          detail: { fila, barbershopId },
        }),
      );
    } catch (err) {
      LoggerService.warn('[QueueRealtimeNotifier] Erro ao buscar fila:', err?.message);
    } finally {
      QueueRealtimeNotifier.#buscando.delete(barbershopId);
    }
  }

  /**
   * Remove e desincreve o canal para um shopId específico.
   * @param {string} barbershopId
   */
  static #removerCanal(barbershopId) {
    const canal = QueueRealtimeNotifier.#canais.get(barbershopId);
    if (!canal) return;

    try {
      SupabaseService.client.removeChannel(canal);
    } catch (_) { /* Realtime já desconectado */ }

    QueueRealtimeNotifier.#canais.delete(barbershopId);
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueRealtimeNotifier;
}
