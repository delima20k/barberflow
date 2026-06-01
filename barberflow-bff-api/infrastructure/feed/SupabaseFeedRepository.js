'use strict';

const { FeedItem } = require('../../domain/feed/entities/FeedItem');
const { FeedRepository } = require('../../domain/feed/ports/FeedRepository');

class SupabaseFeedRepository extends FeedRepository {
  #db;

  constructor(db) {
    super();
    if (!db) throw new TypeError('SupabaseFeedRepository: db obrigatorio.');
    this.#db = db;
  }

  async saveItem(item) {
    const { data, error } = await this.#db
      .from('feed_items')
      .insert({
        id: item.id,
        author_id: item.authorId,
        source_type: item.sourceType,
        source_id: item.sourceId,
        content_hash: item.contentHash,
        fanout_mode: item.fanoutMode,
        created_at: item.createdAt.toISOString(),
      })
      .select('id, author_id, source_type, source_id, content_hash, fanout_mode, created_at')
      .single();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return this.#toItem(data);
  }

  async hasRecentContentHash(authorId, contentHash) {
    const { count, error } = await this.#db
      .from('feed_items')
      .select('id', { head: true, count: 'exact' })
      .eq('author_id', authorId)
      .eq('content_hash', contentHash)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return (count ?? 0) > 0;
  }

  async countRecentPostsByAuthor(authorId, windowSeconds) {
    const { count, error } = await this.#db
      .from('feed_items')
      .select('id', { head: true, count: 'exact' })
      .eq('author_id', authorId)
      .gte('created_at', new Date(Date.now() - windowSeconds * 1000).toISOString());
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return count ?? 0;
  }

  async countFollowers(authorId) {
    const { count, error } = await this.#db
      .from('feed_follows')
      .select('follower_id', { head: true, count: 'exact' })
      .eq('author_id', authorId)
      .eq('is_active', true);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return count ?? 0;
  }

  async listPage(query) {
    const { data, error } = await this.#db.rpc('get_feed_page', {
      p_user_id: query.userId,
      p_limit: query.limit * 3,
      p_cursor_created_at: query.cursor?.createdAt ?? null,
      p_cursor_id: query.cursor?.id ?? null,
    });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return (data ?? []).map(row => this.#toItem(row));
  }

  async listFilters(userId) {
    const [{ data: blocks, error: blockError }] = await Promise.all([
      this.#db.from('feed_blocks').select('blocked_author_id').eq('user_id', userId),
    ]);
    if (blockError) throw Object.assign(new Error(blockError.message), { code: blockError.code });
    return { blockedAuthorIds: (blocks ?? []).map(row => row.blocked_author_id) };
  }

  async fanoutToFollowers(itemId, authorId, limit) {
    const { data: followers, error } = await this.#db
      .from('feed_follows')
      .select('follower_id')
      .eq('author_id', authorId)
      .eq('is_active', true)
      .limit(limit + 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if ((followers ?? []).length > limit) return { mode: 'pull', userIds: [] };
    const rows = (followers ?? []).map(row => ({ user_id: row.follower_id, feed_item_id: itemId }));
    if (rows.length > 0) {
      const { error: insertError } = await this.#db.from('feed_inbox').upsert(rows, { onConflict: 'user_id,feed_item_id' });
      if (insertError) throw Object.assign(new Error(insertError.message), { code: insertError.code });
    }
    return { mode: 'write', userIds: rows.map(row => row.user_id) };
  }

  async blockAuthor(userId, authorId) {
    const { error } = await this.#db
      .from('feed_blocks')
      .upsert({ user_id: userId, blocked_author_id: authorId }, { onConflict: 'user_id,blocked_author_id' });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }

  async unfollow(userId, authorId) {
    const { error } = await this.#db
      .from('feed_follows')
      .update({ is_active: false })
      .eq('follower_id', userId)
      .eq('author_id', authorId);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }

  #toItem(row) {
    return FeedItem.restore({
      id: row.id,
      authorId: row.author_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      likesCount: row.likes_count,
      viewsCount: row.views_count,
      affinityScore: row.affinity_score,
      fanoutMode: row.fanout_mode,
    });
  }
}

module.exports = { SupabaseFeedRepository };
