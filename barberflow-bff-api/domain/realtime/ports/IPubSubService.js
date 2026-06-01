'use strict';

/**
 * IPubSubService — Port abstrato para publicação e assinatura de mensagens.
 *
 * Implementação concreta: RedisPubSubAdapter (infrastructure/realtime).
 *
 * @abstract
 */
class IPubSubService {
  /**
   * Assina um canal e registra o callback para cada mensagem recebida.
   * @param {string} channel
   * @param {(event: object) => void} callback
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async subscribe(channel, callback) {
    throw new Error(`${this.constructor.name}.subscribe() não implementado`);
  }

  /**
   * Cancela a assinatura de um canal e remove todos os callbacks associados.
   * @param {string} channel
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async unsubscribe(channel) {
    throw new Error(`${this.constructor.name}.unsubscribe() não implementado`);
  }

  /**
   * Publica um evento serializado em um canal.
   * @param {string} channel
   * @param {object} event — objeto serializável (ex: RealtimeEvent.toJSON())
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async publish(channel, event) {
    throw new Error(`${this.constructor.name}.publish() não implementado`);
  }

  /**
   * Encerra todas as conexões e libera recursos.
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error(`${this.constructor.name}.disconnect() não implementado`);
  }
}

module.exports = { IPubSubService };
