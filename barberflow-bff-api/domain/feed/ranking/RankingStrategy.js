'use strict';

class RankingStrategy {
  rank() {
    throw new Error('RankingStrategy.rank deve ser implementado.');
  }

  score() {
    return 0;
  }

  static stableTieBreak(left, right) {
    const time = right.createdAt.getTime() - left.createdAt.getTime();
    return time || right.id.localeCompare(left.id);
  }
}

module.exports = { RankingStrategy };
