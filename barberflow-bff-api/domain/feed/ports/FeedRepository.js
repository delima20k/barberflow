'use strict';

class FeedRepository {
  async listPage() { throw new Error('FeedRepository.listPage deve ser implementado.'); }
  async listFilters() { throw new Error('FeedRepository.listFilters deve ser implementado.'); }
  async saveItem() { throw new Error('FeedRepository.saveItem deve ser implementado.'); }
  async fanoutToFollowers() { throw new Error('FeedRepository.fanoutToFollowers deve ser implementado.'); }
  async blockAuthor() { throw new Error('FeedRepository.blockAuthor deve ser implementado.'); }
  async unfollow() { throw new Error('FeedRepository.unfollow deve ser implementado.'); }
}

module.exports = { FeedRepository };
