'use strict';

class IMessageCipher {
  async seal(_message) { throw new Error('IMessageCipher.seal nao implementado.'); }
  async open(_payload) { throw new Error('IMessageCipher.open nao implementado.'); }
}

module.exports = { IMessageCipher };
