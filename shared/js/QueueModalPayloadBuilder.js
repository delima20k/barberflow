'use strict';

// =============================================================
// QueueModalPayloadBuilder.js — Fábrica de payloads para modais
//                               e toasts de posição na fila.
//
// Responsabilidade ÚNICA: construir config-objects prontos para
// FluxoDeFila.abrir() — sem jamais chamar o modal diretamente.
//
// O chamador decide quando (e se) abrir o modal/toast.
// Toda string dinâmica é escapada via FluxoDeFila.escapar().
//
// Dependências: FluxoDeFila.js
// =============================================================

class QueueModalPayloadBuilder {

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Monta config para modal de atualização de posição genérica.
   *
   * @param {number} posicao — posição atual na fila (≥1)
   * @param {object} [opts]
   * @param {string} [opts.nomeBarbearia] — nome exibido no corpo
   * @returns {object} config-object para FluxoDeFila.abrir()
   */
  static montarPayloadPosicao(posicao, { nomeBarbearia } = {}) {
    const shopPart = nomeBarbearia
      ? ` na <strong>${FluxoDeFila.escapar(nomeBarbearia)}</strong>`
      : '';

    return {
      icone:  '💈',
      titulo: 'Fila atualizada',
      corpo:  `Sua posição${shopPart} é agora <strong>${posicao}</strong>.`,
      acoes:  [{ label: 'Ok, entendi', valor: 'ok', variante: 'primario' }],
    };
  }

  /**
   * Monta config para modal de "você é o próximo".
   * Texto especial de chamada de ação mais urgente.
   *
   * @param {object} [opts]
   * @param {string} [opts.nomeBarbearia]
   * @returns {object} config-object para FluxoDeFila.abrir()
   */
  static montarPayloadProximoNaFila({ nomeBarbearia } = {}) {
    const shopPart = nomeBarbearia
      ? ` na <strong>${FluxoDeFila.escapar(nomeBarbearia)}</strong>`
      : '';

    return {
      icone:     '✂️',
      titulo:    'É a sua vez!',
      corpo:     `Você é o próximo${shopPart}. Dirija-se à cadeira de atendimento.`,
      acoes:     [{ label: 'Estou chegando!', valor: 'ok', variante: 'primario' }],
      tocarSom:  true,
    };
  }

  /**
   * Monta config enxuto (sem botões) para uso como toast/notificação inline.
   * Posição 1 → texto de "próximo".
   *
   * @param {number} posicao
   * @param {object} [opts]
   * @param {string} [opts.nomeBarbearia]
   * @returns {object} config-object mínimo
   */
  static montarPayloadToast(posicao, { nomeBarbearia } = {}) {
    const shopPart = nomeBarbearia
      ? ` — ${FluxoDeFila.escapar(nomeBarbearia)}`
      : '';

    const corpo = posicao === 1
      ? `Você é o próximo${shopPart}! Dirija-se à cadeira.`
      : `Você está na posição <strong>${posicao}</strong>${shopPart}.`;

    return {
      icone:  '💈',
      titulo: posicao === 1 ? 'É a sua vez!' : 'Fila avançou',
      corpo,
      acoes:  [],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueModalPayloadBuilder;
}
