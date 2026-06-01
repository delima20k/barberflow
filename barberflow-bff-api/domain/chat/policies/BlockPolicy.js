'use strict';

class BlockPolicy {
  #blockRepository;

  constructor({ blockRepository }) {
    if (!blockRepository) throw new TypeError('BlockPolicy.blockRepository obrigatorio.');
    this.#blockRepository = blockRepository;
  }

  async canExchange(leftUserId, rightUserId) {
    if (!leftUserId || !rightUserId || leftUserId === rightUserId) return false;
    return !(await this.#blockRepository.hasBidirectionalBlock(leftUserId, rightUserId));
  }
}

module.exports = { BlockPolicy };
