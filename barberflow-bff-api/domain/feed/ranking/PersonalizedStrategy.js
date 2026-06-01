'use strict';

const { EngagementScoreStrategy } = require('./EngagementScoreStrategy');
const { RankingStrategy } = require('./RankingStrategy');

class PersonalizedStrategy extends EngagementScoreStrategy {
  score(item) {
    return super.score(item) + (item.affinityScore * 100);
  }

  rank(items) {
    return [...items].sort((left, right) => (
      this.score(right) - this.score(left) || RankingStrategy.stableTieBreak(left, right)
    ));
  }
}

module.exports = { PersonalizedStrategy };
