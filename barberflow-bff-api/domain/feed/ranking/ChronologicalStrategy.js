'use strict';

const { RankingStrategy } = require('./RankingStrategy');

class ChronologicalStrategy extends RankingStrategy {
  rank(items) {
    return [...items].sort(RankingStrategy.stableTieBreak);
  }
}

module.exports = { ChronologicalStrategy };
