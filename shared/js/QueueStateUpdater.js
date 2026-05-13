'use strict';

// =============================================================
// QueueStateUpdater.js — Rastreia mudança de posição do cliente
//                         na fila em tempo real.
//
// Responsabilidade ÚNICA: ouvir 'barberflow:fila-atualizada',
// localizar o registro do cliente atual, calcular seu rank entre
// as entradas 'waiting' e despachar 'barberflow:fila-posicao-atualizada'
// SOMENTE quando a posição mudar (anti-flood).
//
// Trabalha em par com QueueRealtimeNotifier (que emite
// 'barberflow:fila-atualizada') e QueuePositionNotificationService
// (caminho alternativo via notifications table).
//
// Evento despachado (somente quando posição muda):
//   'barberflow:fila-posicao-atualizada'
//   detail: { position: number, isNext: boolean,
//             barbershopId: string, entradaId: string }
//
// Dependências: LoggerService.js
// =============================================================

class QueueStateUpdater {

  /** @type {string|null} clientId monitorado */
  static #clientId = null;

  /** @type {number|null} última posição conhecida */
  static #posicaoAnterior = null;

  /** @type {Function|null} referência ao listener (para removeEventListener) */
  static #listener = null;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o rastreamento para o cliente informado.
   * Idempotente: chamar novamente substitui o clientId monitorado.
   *
   * @param {string} clientId — UUID do perfil do cliente
   */
  static iniciar(clientId) {
    if (!clientId) return;

    QueueStateUpdater.parar(); // limpa estado anterior

    QueueStateUpdater.#clientId = clientId;
    QueueStateUpdater.#listener = (evt) => QueueStateUpdater.#onFilaAtualizada(evt);

    document.addEventListener('barberflow:fila-atualizada', QueueStateUpdater.#listener);
  }

  /**
   * Para o rastreamento e reseta todo estado interno.
   * Seguro chamar mesmo se não estiver ativo.
   */
  static parar() {
    if (QueueStateUpdater.#listener) {
      document.removeEventListener('barberflow:fila-atualizada', QueueStateUpdater.#listener);
      QueueStateUpdater.#listener = null;
    }
    QueueStateUpdater.#clientId       = null;
    QueueStateUpdater.#posicaoAnterior = null;
  }

  /**
   * Retorna a posição atual conhecida do cliente (ou null).
   * @returns {number|null}
   */
  static posicaoAtual() {
    return QueueStateUpdater.#posicaoAnterior;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Handler do evento 'barberflow:fila-atualizada'.
   * Calcula rank do cliente entre os 'waiting' e despacha evento
   * somente se a posição mudou.
   *
   * @param {CustomEvent} evt
   * @param {object[]} evt.detail.fila
   * @param {string}   evt.detail.barbershopId
   */
  static #onFilaAtualizada({ detail: { fila, barbershopId } = {} }) {
    const clientId = QueueStateUpdater.#clientId;
    if (!clientId || !Array.isArray(fila)) return;

    // Filtra apenas entradas waiting, ordena por posição
    const waiting = fila
      .filter(e => e.status === 'waiting')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    // Encontra a entrada do cliente
    const entrada = waiting.find(e => e.client?.id === clientId);
    if (!entrada) return; // cliente não está na fila de espera

    // Rank é a posição entre os waiting (1-based)
    const rank = waiting.indexOf(entrada) + 1;

    // Anti-flood: só despacha se posição mudou
    if (rank === QueueStateUpdater.#posicaoAnterior) return;

    const posicaoAnt = QueueStateUpdater.#posicaoAnterior;
    QueueStateUpdater.#posicaoAnterior = rank;

    document.dispatchEvent(
      new CustomEvent('barberflow:fila-posicao-atualizada', {
        detail: {
          position:        rank,
          isNext:          rank === 1,
          barbershopId,
          entradaId:       entrada.id ?? null,
          posicaoAnterior: posicaoAnt,
        },
      }),
    );
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueStateUpdater;
}
