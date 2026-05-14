'use strict';

// =============================================================
// BarbershopAvailabilityService.js
//
// Responsabilidade ÚNICA: centralizar toda a lógica de
// disponibilidade da barbearia para interações do cliente.
//
// Responde perguntas como:
//   - O cliente pode clicar nas cadeiras?
//   - O cliente pode entrar na fila?
//   - Qual mensagem exibir quando bloqueado?
//
// CAMADA: application — sem acesso ao DOM, sem efeitos colaterais.
// Todos os métodos são estáticos e puros.
//
// Dependências: StatusFechamentoModal.js (constantes de tipo)
//
// Extensível: novos status (manutencao, feriado, lotado) devem
//   adicionar um getter aqui e ajustar canClientClickChair /
//   canClientJoinQueue sem tocar no código consumidor.
// =============================================================

class BarbershopAvailabilityService {

  // ── Constantes internas (camada application não depende de interfaces) ──────
  static #ALMOCO = 'almoco';
  static #JANTA  = 'janta';
  static #NORMAL = 'normal';

  // ── Normalização interna ──────────────────────────────────

  /**
   * Extrai e normaliza o close_reason de um shopData.
   * Retorna null quando inexistente ou vazio.
   * @param {object|null} shopData
   * @returns {string|null}
   */
  static #razao(shopData) {
    const r = (shopData?.close_reason ?? '').toLowerCase().trim();
    return r || null;
  }

  // ── Consultas de estado ───────────────────────────────────

  /**
   * Retorna true quando a barbearia está aberta para atendimento.
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static isBarbershopOpen(shopData) {
    return shopData?.is_open === true;
  }

  /**
   * Retorna true quando a barbearia está fechada normalmente
   * (sem pausa de almoço ou janta).
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static isBarbershopClosed(shopData) {
    if (shopData?.is_open !== false) return false;
    const r = BarbershopAvailabilityService.#razao(shopData);
    // close_reason = null → fechado normal
    // close_reason = 'normal' → nunca gravado no banco (MinhaBarbeariaPage converte para null),
    //   mas tratado defensivamente para evitar regressão futura
    return r === null || r === 'normal';
  }

  /**
   * Retorna true quando a barbearia está em pausa para almoço.
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static isLunchPause(shopData) {
    return shopData?.is_open === false &&
      BarbershopAvailabilityService.#razao(shopData) === BarbershopAvailabilityService.#ALMOCO;
  }

  /**
   * Retorna true quando a barbearia está em pausa para janta.
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static isDinnerPause(shopData) {
    return shopData?.is_open === false &&
      BarbershopAvailabilityService.#razao(shopData) === BarbershopAvailabilityService.#JANTA;
  }

  // ── Permissões do cliente ─────────────────────────────────

  /**
   * Retorna true quando o cliente pode clicar em uma cadeira para
   * cortar o cabelo ou entrar na produção.
   *
   * Regra: apenas barbearia aberta permite interação.
   * Pausas (almoço/janta) e fechado normal bloqueiam igualmente.
   *
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static canClientClickChair(shopData) {
    return BarbershopAvailabilityService.isBarbershopOpen(shopData);
  }

  /**
   * Retorna true quando o cliente pode entrar na fila de espera.
   * Mesma regra de canClientClickChair: apenas barbearia aberta.
   *
   * @param {object|null} shopData
   * @returns {boolean}
   */
  static canClientJoinQueue(shopData) {
    return BarbershopAvailabilityService.isBarbershopOpen(shopData);
  }

  // ── Mensagem de bloqueio ──────────────────────────────────

  /**
   * Retorna a mensagem de bloqueio correta para o estado atual da barbearia.
   * Mensagens de almoço e janta variam conforme o número de barbeiros (singular/plural).
   * A mensagem de fechamento normal inclui o nome da barbearia.
   *
   * Mensagens (singular / plural):
   *   almoco  → "O barbeiro / Os barbeiros estão em pausa para almoço. Aguarde até retornar(em)."
   *   janta   → "O barbeiro / Os barbeiros estão em pausa para janta. Aguarde até retornar(em)."
   *   fechada → "A barbearia {nome} está fechada. Aguarde ela abrir novamente."
   *
   * @param {object|null} shopData
   * @param {number}      [numeroBarbeiros=1]  total de barbeiros ativos (determina plural)
   * @returns {string}
   */
  static getClosedMessage(shopData, numeroBarbeiros = 1) {
    const nome   = shopData?.name ?? 'A barbearia';
    const r      = BarbershopAvailabilityService.#razao(shopData);
    const plural = Number.isInteger(numeroBarbeiros) && numeroBarbeiros > 1;

    if (r === BarbershopAvailabilityService.#ALMOCO) {
      return plural
        ? 'Os barbeiros estão em pausa para almoço. Aguarde até retornarem.'
        : 'O barbeiro está em pausa para almoço. Aguarde até retornar.';
    }

    if (r === BarbershopAvailabilityService.#JANTA) {
      return plural
        ? 'Os barbeiros estão em pausa para janta. Aguarde até retornarem.'
        : 'O barbeiro está em pausa para janta. Aguarde até retornar.';
    }

    return `A barbearia ${nome} está fechada. Aguarde ela abrir novamente.`;
  }

  /**
   * Retorna o ícone correspondente ao motivo de fechamento da barbearia.
   * @param {object|null} shopData
   * @returns {'🍽️'|'🌙'|'🔒'}
   */
  static getClosedIcon(shopData) {
    const r = BarbershopAvailabilityService.#razao(shopData);
    if (r === BarbershopAvailabilityService.#ALMOCO) return '🍽️';
    if (r === BarbershopAvailabilityService.#JANTA)  return '🌙';
    return '🔒';
  }

  /**
   * Retorna o título correspondente ao motivo de fechamento da barbearia.
   * @param {object|null} shopData
   * @returns {string}
   */
  static getClosedTitle(shopData) {
    const r = BarbershopAvailabilityService.#razao(shopData);
    if (r === BarbershopAvailabilityService.#ALMOCO) return 'Pausa para Almoço';
    if (r === BarbershopAvailabilityService.#JANTA)  return 'Pausa para Janta';
    return 'Barbearia Fechada';
  }
}
