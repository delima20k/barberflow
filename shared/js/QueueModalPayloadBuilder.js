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
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Constrói a parte do corpo referente ao nome da barbearia.
   * Centraliza o padrão DRY entre os 3 métodos públicos.
   *
   * @param {string|undefined} nomeBarbearia
   * @param {string} [prefixo=' na '] — separador exibido antes do nome
   * @returns {string} fragmento HTML escapado, ou string vazia
   */
  static #shopPart(nomeBarbearia, prefixo = ' na ') {
    if (!nomeBarbearia) return '';
    return `${prefixo}<strong>${FluxoDeFila.escapar(nomeBarbearia)}</strong>`;
  }

  /**
   * Retorna o texto do corpo da modal de acordo com a posição do cliente.
   * Mensagens diferenciadas por posição: 1º, 2º, 3º ou posterior.
   *
   * @param {number}      posicao  — rank do cliente na fila (≥1)
   * @param {string}      shopPart — fragmento HTML do nome da barbearia (pode ser vazio)
   * @returns {string}
   */
  static #textoCorpo(posicao, shopPart) {
    // shopPart já contém o espaço inicial (' na <strong>...</strong>') ou é ''
    const shop = shopPart;
    if (posicao === 1) {
      return `Sua posição foi atualizada${shop}. Você agora é o próximo da fila. `
           + 'Fique atento pois em breve será chamado.';
    }
    if (posicao === 2) {
      return `Sua posição foi atualizada para <strong>2º lugar</strong>${shop}. `
           + 'Fique atento pois você será um dos próximos.';
    }
    return `Sua posição foi atualizada para <strong>${posicao}º lugar</strong>${shop}. `
         + 'A fila avançou.';
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Monta config para modal de atualização de posição.
   * Mensagem diferenciada por posição: 1º (próximo), 2º, 3º+.
   *
   * @param {number} posicao — posição atual na fila (≥1)
   * @param {object} [opts]
   * @param {string} [opts.nomeBarbearia] — nome exibido no corpo
   * @returns {object} config-object para FluxoDeFila.abrir()
   */
  static montarPayloadPosicao(posicao, { nomeBarbearia } = {}) {
    const shopPart = QueueModalPayloadBuilder.#shopPart(nomeBarbearia);
    const corpo    = QueueModalPayloadBuilder.#textoCorpo(posicao, shopPart);

    return {
      icone:  '💈',
      titulo: 'Posição atualizada',
      corpo,
      acoes:  [{ label: 'Entendido', valor: 'ok', variante: 'primario' }],
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
    const shopPart = QueueModalPayloadBuilder.#shopPart(nomeBarbearia);

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
    const shopPart = QueueModalPayloadBuilder.#shopPart(nomeBarbearia, ' — ');

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

  /**
   * Monta config para modal de confirmação de presença física.
   * Exibido logo após o cliente entrar na fila (status=waiting).
   *
   * @param {object} [opts]
   * @param {string} [opts.nomeBarbearia]
   * @param {string} [opts.clienteNome]
   * @returns {object} config-object para FluxoDeFila.abrir()
   */
  static montarPayloadPresencaFisica({ nomeBarbearia, clienteNome } = {}) {
    const shopPart = QueueModalPayloadBuilder.#shopPart(nomeBarbearia);
    const nome     = FluxoDeFila.escapar(clienteNome ?? 'você');

    return {
      icone:  '🏠',
      titulo: 'Você já está na barbearia?',
      corpo:  `${nome}, confirme sua presença para que o barbeiro saiba que você chegou${shopPart}.`,
      acoes:  [
        { label: '✅ Sim, já estou!',  valor: 'sim', variante: 'primario'   },
        { label: '🚶 Estou chegando', valor: 'nao', variante: 'secundario' },
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════
  // UMD export (Node.js / testes)
  // ═══════════════════════════════════════════════════════════
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueModalPayloadBuilder;
}
