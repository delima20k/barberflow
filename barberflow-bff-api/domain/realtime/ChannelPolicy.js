'use strict';

/**
 * ChannelPolicy — Regras de autorização por canal no gateway realtime.
 *
 * Tipos de canal suportados:
 *   fila.{shopId}               — fila ao vivo da barbearia (leitura pública)
 *   notificacoes.{userId}       — notificações pessoais (apenas o próprio usuário)
 *   barbershop.status.{shopId}  — status de abertura (leitura pública)
 *   presence.{shopId}           — presença de usuários (leitura pública, escrita servidor)
 *
 * Publicação é sempre reservada ao servidor via use cases internos.
 */
class ChannelPolicy {
  /**
   * Mapa de regras por tipo de canal (primeiro segmento).
   * @type {Map<string, { canSubscribe(userId: string, parts: string[]): boolean }>}
   */
  static #RULES = new Map([
    // fila.{shopId} — qualquer usuário autenticado pode assinar
    ['fila', {
      canSubscribe: (_userId, _parts) => true,
    }],

    // notificacoes.{userId} — apenas o próprio usuário
    ['notificacoes', {
      canSubscribe: (userId, parts) => parts[1] === userId,
    }],

    // chat.{userId} - eventos de conversa chegam no canal privado do user
    ['chat', {
      canSubscribe: (userId, parts) => parts[1] === userId,
    }],

    // barbershop.status.{shopId} — qualquer autenticado
    ['barbershop', {
      canSubscribe: (_userId, _parts) => true,
    }],

    // presence.{shopId} — qualquer autenticado
    ['presence', {
      canSubscribe: (_userId, _parts) => true,
    }],
  ]);

  /**
   * Retorna true se userId pode assinar o canal.
   * @param {string} userId
   * @param {string} channel
   * @returns {boolean}
   */
  static canSubscribe(userId, channel) {
    if (!userId || typeof userId !== 'string' || !channel || typeof channel !== 'string') {
      return false;
    }
    const parts = channel.split('.');
    const rule  = ChannelPolicy.#RULES.get(parts[0]);
    if (!rule) return false;
    return rule.canSubscribe(userId, parts);
  }

  /**
   * Retorna true se o canal é de um tipo reconhecido.
   * @param {string} channel
   * @returns {boolean}
   */
  static isValidChannel(channel) {
    if (!channel || typeof channel !== 'string') return false;
    return ChannelPolicy.#RULES.has(channel.split('.')[0]);
  }

  /**
   * Retorna o tipo (primeiro segmento) do canal, ou null se inválido.
   * @param {string} channel
   * @returns {string|null}
   */
  static channelType(channel) {
    if (!channel || typeof channel !== 'string') return null;
    const tipo = channel.split('.')[0];
    return ChannelPolicy.#RULES.has(tipo) ? tipo : null;
  }
}

module.exports = { ChannelPolicy };
