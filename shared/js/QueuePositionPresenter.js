'use strict';

// =============================================================
// QueuePositionPresenter.js — Apresentador visual de mudança de
//                             posição na fila.
//
// Responsabilidade ÚNICA: ouvir o evento DOM
// 'barberflow:fila-posicao-atualizada' (emitido por
// QueueStateUpdater ou QueuePositionNotificationService) e
// abrir a modal FluxoDeFila com o payload correto para a posição
// recebida.
//
// Não calcula posição — quem calcula é QueueStateUpdater.
// Não constrói texto — quem constrói é QueueModalPayloadBuilder.
// Não faz realtime — quem faz é QueueRealtimeNotifier.
// Este presenter apenas conecta os eventos ao modal existente.
//
// Anti-flood: enquanto um modal estiver aberto, eventos adicionais
// são descartados — evita empilhamento de modais.
//
// Idempotente: chamar iniciar() múltiplas vezes atualiza o
// nomeBarbearia sem duplicar o listener.
//
// Evento consumido:
//   'barberflow:fila-posicao-atualizada'
//   detail: { position: number, isNext: boolean, barbershopId: string }
//
// Dependências: FluxoDeFila.js, QueueModalPayloadBuilder.js,
//               LoggerService.js
// =============================================================

class QueuePositionPresenter {

  /** @type {string|null} Nome da barbearia atual (exibido na modal) */
  static #nomeBarbearia = null;

  /** @type {string|null} URL do logo da barbearia (para iconesDuplos) */
  static #shopLogoUrl = null;

  /** @type {Function|null} Referência ao listener (para removeEventListener) */
  static #listener = null;

  /** @type {boolean} Guarda anti-flood: true enquanto FluxoDeFila.abrir() aguarda */
  static #modalAberto = false;

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o presenter para o cliente atual.
   * Idempotente: segunda chamada apenas atualiza nomeBarbearia / shopLogoUrl
   * sem registrar listener duplicado.
   *
   * @param {string|null} [nomeBarbearia] — nome da barbearia a exibir na modal
   * @param {string|null} [shopLogoUrl]   — URL do logo da barbearia
   */
  static iniciar(nomeBarbearia = null, shopLogoUrl = null) {
    QueuePositionPresenter.#nomeBarbearia = nomeBarbearia ?? null;
    QueuePositionPresenter.#shopLogoUrl   = shopLogoUrl   ?? null;

    if (QueuePositionPresenter.#listener) return; // já ativo — só atualizou o nome

    QueuePositionPresenter.#listener = (evt) =>
      QueuePositionPresenter.#onPosicaoAtualizada(evt);

    document.addEventListener(
      'barberflow:fila-posicao-atualizada',
      QueuePositionPresenter.#listener,
    );
  }

  /**
   * Para o presenter e reseta todo estado interno.
   * Seguro chamar mesmo se não estiver ativo.
   */
  static parar() {
    if (QueuePositionPresenter.#listener) {
      document.removeEventListener(
        'barberflow:fila-posicao-atualizada',
        QueuePositionPresenter.#listener,
      );
      QueuePositionPresenter.#listener = null;
    }
    QueuePositionPresenter.#nomeBarbearia = null;
    QueuePositionPresenter.#shopLogoUrl   = null;
    QueuePositionPresenter.#modalAberto   = false;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Handler de 'barberflow:fila-posicao-atualizada'.
   * Constrói o payload via QueueModalPayloadBuilder e abre FluxoDeFila.
   * Garante apenas um modal aberto por vez (anti-flood).
   *
   * @param {CustomEvent} evt
   * @param {object}  evt.detail
   * @param {number}  evt.detail.position         — rank atual do cliente (1-based)
   * @param {boolean} evt.detail.isNext            — true se position === 1
   * @param {string}  evt.detail.barbershopId
   * @param {number|null} evt.detail.posicaoAnterior — posição antes da atualização
   */
  static async #onPosicaoAtualizada({ detail: { position, posicaoAnterior = null } = {} }) {
    // Guarda de posição inválida
    if (!position || position <= 0) return;

    // Anti-flood: descarta evento enquanto modal anterior ainda está aberto
    if (QueuePositionPresenter.#modalAberto) return;

    QueuePositionPresenter.#modalAberto = true;
    try {
      const clienteNome = (typeof AuthService !== 'undefined')
        ? (AuthService.getPerfil?.()?.full_name ?? null)
        : null;

      const config = QueueModalPayloadBuilder.montarPayloadPosicao(
        position,
        {
          nomeBarbearia:   QueuePositionPresenter.#nomeBarbearia,
          posicaoAnterior,
          clienteNome,
          shopLogoUrl:     QueuePositionPresenter.#shopLogoUrl,
        },
      );

      // Som de notificação (mp3 hair-trimmer, corte em 3s) + vibração junto
      // com a modal — best-effort (autoplay pode ser bloqueado sem gesto).
      if (typeof PushSoundService !== 'undefined') {
        try { PushSoundService.alertar(); } catch (_) { /* som é best-effort */ }
      }

      await FluxoDeFila.abrir(config);
    } catch (err) {
      LoggerService.warn('[QueuePositionPresenter] Erro ao abrir modal:', err?.message);
    } finally {
      QueuePositionPresenter.#modalAberto = false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueuePositionPresenter;
}
