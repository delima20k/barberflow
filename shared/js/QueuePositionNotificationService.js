'use strict';

// =============================================================
// QueuePositionNotificationService.js — Intercepta notificações
//                                        de fila via barberflow:notificacao-nova.
//
// Responsabilidade ÚNICA: ouvir o evento DOM 'barberflow:notificacao-nova',
// filtrar notificações do tipo 'queue_update' (geradas pelo trigger DB
// `trg_notify_queue_on_done`) e despachar 'barberflow:fila-posicao-atualizada'.
//
// Garante cobertura redundante com QueueStateUpdater: se o canal
// Realtime de queue_entries falhar, as notificações do usuário
// ainda chegam via canal de notifications.
//
// Deduplicação por notif.id: cada notificação é processada no máximo
// uma vez por ciclo de vida (parar() limpa o Set).
//
// Evento despachado (quando queue_update chega):
//   'barberflow:fila-posicao-atualizada'
//   detail: { position: number, isNext: boolean, barbershopId: string }
//
// Dependências: LoggerService.js
// =============================================================

class QueuePositionNotificationService {

  /** @type {Set<string>} IDs de notificações já processadas */
  static #processadas = new Set();

  /** Tamanho máximo do Set de deduplicação (evita memory leak em sessões longas) */
  static #MAX_PROCESSADAS = 200;

  /** @type {Function|null} referência ao listener (para removeEventListener) */
  static #listener = null;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o interceptor de notificações de fila.
   * Idempotente: segunda chamada sem parar() é no-op.
   */
  static iniciar() {
    if (QueuePositionNotificationService.#listener) return; // já ativo

    QueuePositionNotificationService.#listener = (evt) =>
      QueuePositionNotificationService.#onNotifNova(evt);

    document.addEventListener(
      'barberflow:notificacao-nova',
      QueuePositionNotificationService.#listener,
    );
  }

  /**
   * Para o interceptor e limpa todo estado interno.
   * Seguro chamar mesmo se não estiver ativo.
   */
  static parar() {
    if (QueuePositionNotificationService.#listener) {
      document.removeEventListener(
        'barberflow:notificacao-nova',
        QueuePositionNotificationService.#listener,
      );
      QueuePositionNotificationService.#listener = null;
    }
    QueuePositionNotificationService.#processadas.clear();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Handler de 'barberflow:notificacao-nova'.
   * Filtra type=queue_update, deduplica por notif.id e despacha evento.
   *
   * @param {CustomEvent} evt
   * @param {object} evt.detail.notif
   */
  static #onNotifNova({ detail: { notif } = {} }) {
    if (!notif || notif.type !== 'queue_update') return;
    if (!notif.data) return;

    // Deduplicação com cap de memória
    const notifId = notif.id;
    if (notifId && QueuePositionNotificationService.#processadas.has(notifId)) return;
    if (notifId) {
      if (QueuePositionNotificationService.#processadas.size >= QueuePositionNotificationService.#MAX_PROCESSADAS) {
        // Remove o primeiro elemento (mais antigo) para manter o Set limitado
        QueuePositionNotificationService.#processadas.delete(
          QueuePositionNotificationService.#processadas.values().next().value,
        );
      }
      QueuePositionNotificationService.#processadas.add(notifId);
    }

    // JSONB do banco pode chegar serializado como string em alguns contextos
    const data = notif.data && typeof notif.data === 'string'
      ? (() => { try { return JSON.parse(notif.data); } catch { return null; } })()
      : notif.data;

    if (!data) return;

    const position     = data.position     ?? null;
    const isNext       = data.is_next       ?? false;
    const barbershopId = data.barbershop_id ?? null;

    if (position === null || !barbershopId) {
      LoggerService.warn('[QueuePositionNotificationService] Notif queue_update sem position ou barbershopId', notif);
      return;
    }

    document.dispatchEvent(
      new CustomEvent('barberflow:fila-posicao-atualizada', {
        detail: { position, isNext, barbershopId },
      }),
    );
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueuePositionNotificationService;
}
