'use strict';

const { RankingStrategy } = require('./RankingStrategy');

class EngagementScoreStrategy extends RankingStrategy {
  score(item) {
    return (item.likesCount * 4) + item.viewsCount;
  }

  rank(items) {
    return [...items].sort((left, right) => (
      this.score(right) - this.score(left) || RankingStrategy.stableTieBreak(left, right)
    ));
  }
}

module.exports = { EngagementScoreStrategy };
