'use strict';

const { ChatRepository } = require('../../domain/chat/ports/ChatRepository');
const { Conversation } = require('../../domain/chat/entities/Conversation');
const { Message } = require('../../domain/chat/entities/Message');
const { MuteRule } = require('../../domain/chat/policies/MuteRule');

class SupabaseChatRepository extends ChatRepository {
  static MESSAGE_SELECT = 'id, conversation_id, sender_id, client_message_id, body, created_at, deleted_at, retention_until, chat_message_attachments(media_id, variant, kind)';
  #db;

  constructor(db) {
    super();
    if (!db) throw new TypeError('SupabaseChatRepository.db obrigatorio.');
    this.#db = db;
  }

  async findConversation(conversationId) {
    const { data, error } = await this.#db
      .from('chat_conversations')
      .select('id, created_at, archived_at, chat_participants(user_id, joined_at, left_at)')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ? this.#toConversation(data) : null;
  }

  async findByClientMessageId(senderId, clientMessageId) {
    if (!senderId || !clientMessageId) return null;
    const { data, error } = await this.#db
      .from('chat_messages')
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .eq('sender_id', senderId)
      .eq('client_message_id', clientMessageId)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ? this.#toMessage(data) : null;
  }

  async saveMessage(message) {
    const { data, error } = await this.#db
      .from('chat_messages')
      .upsert({
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        client_message_id: message.clientMessageId,
        body: message.body,
        created_at: message.createdAt.toISOString(),
      }, { onConflict: 'sender_id,client_message_id' })
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .single();
    if (error) throw this.#error(error);
    if (message.attachments.length > 0) await this.#saveAttachments(data.id, message.attachments);
    return (await this.#findMessage(data.id)) ?? this.#toMessage(data);
  }

  async findDeliveryContext(messageId) {
    const message = await this.#findMessage(messageId);
    const conversation = message ? await this.findConversation(message.conversationId) : null;
    if (!message || !conversation) return null;
    return {
      message,
      recipients: conversation.recipientIds(message.senderId),
      muteRules: await this.#listMuteRules(message.conversationId),
    };
  }

  async listMessagesReverse({ conversationId, cursor = null, limit = 30 }) {
    const parsedCursor = SupabaseChatRepository.#parseCursor(cursor);
    const { data, error } = await this.#db.rpc('get_chat_messages_reverse', {
      p_conversation_id: conversationId,
      p_limit: limit,
      p_cursor_created_at: parsedCursor?.createdAt ?? null,
      p_cursor_id: parsedCursor?.id ?? null,
    });
    if (error) throw this.#error(error);
    const items = (data ?? []).map(row => this.#toMessage(row).toJSON());
    return { items, nextCursor: items.length === limit ? items[items.length - 1].sortKey : null };
  }

  async countRecentPairMessages(senderId, recipientIds, windowSeconds) {
    const { data, error } = await this.#db.rpc('count_chat_pair_messages', {
      p_sender_id: senderId,
      p_recipient_ids: recipientIds,
      p_window_seconds: windowSeconds,
    });
    if (error) throw this.#error(error);
    return Number(data ?? 0);
  }

  async countRecentDuplicateBodies(conversationId, senderId, body, windowSeconds) {
    const { count, error } = await this.#db
      .from('chat_messages')
      .select('id', { head: true, count: 'exact' })
      .eq('conversation_id', conversationId)
      .eq('sender_id', senderId)
      .eq('body', body)
      .gte('created_at', new Date(Date.now() - windowSeconds * 1000).toISOString());
    if (error) throw this.#error(error);
    return count ?? 0;
  }

  async hasBidirectionalBlock(leftUserId, rightUserId) {
    const { data, error } = await this.#db.rpc('has_chat_block', {
      p_left_user_id: leftUserId,
      p_right_user_id: rightUserId,
    });
    if (error) throw this.#error(error);
    return Boolean(data);
  }

  async softDeleteMessage(messageId, senderId, retentionUntil) {
    const { data, error } = await this.#db
      .from('chat_messages')
      .update({
        body: '',
        deleted_at: new Date().toISOString(),
        retention_until: retentionUntil.toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', senderId)
      .is('deleted_at', null)
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ? this.#toMessage(data) : null;
  }

  async #findMessage(messageId) {
    const { data, error } = await this.#db
      .from('chat_messages')
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .eq('id', messageId)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ? this.#toMessage(data) : null;
  }

  async #saveAttachments(messageId, attachments) {
    const rows = attachments.map(attachment => ({
      message_id: messageId,
      media_id: attachment.mediaId,
      variant: attachment.variant,
      kind: attachment.kind,
    }));
    const { error } = await this.#db.from('chat_message_attachments')
      .upsert(rows, { onConflict: 'message_id,media_id,variant' });
    if (error) throw this.#error(error);
  }

  async #listMuteRules(conversationId) {
    const { data, error } = await this.#db
      .from('chat_mute_rules')
      .select('conversation_id, user_id, muted_until')
      .eq('conversation_id', conversationId);
    if (error) throw this.#error(error);
    return (data ?? []).map(row => MuteRule.restore({
      conversationId: row.conversation_id,
      userId: row.user_id,
      mutedUntil: row.muted_until,
    }));
  }

  #toConversation(row) {
    return Conversation.restore({
      id: row.id,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      participants: (row.chat_participants ?? []).map(participant => ({
        conversationId: row.id,
        userId: participant.user_id,
        joinedAt: participant.joined_at,
        leftAt: participant.left_at,
      })),
    });
  }

  #toMessage(row) {
    return Message.restore({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      clientMessageId: row.client_message_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      retentionUntil: row.retention_until,
      attachments: (row.chat_message_attachments ?? row.attachments ?? []).map(attachment => ({
        mediaId: attachment.media_id,
        variant: attachment.variant,
        kind: attachment.kind,
      })),
    });
  }

  #error(error) {
    return Object.assign(new Error(error.message), { code: error.code });
  }

  static #parseCursor(cursor) {
    if (!cursor || typeof cursor !== 'string') return null;
    const index = cursor.lastIndexOf(':');
    if (index < 1) return null;
    return { createdAt: cursor.slice(0, index), id: cursor.slice(index + 1) };
  }
}

module.exports = { SupabaseChatRepository };
