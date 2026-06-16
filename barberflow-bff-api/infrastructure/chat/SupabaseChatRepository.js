'use strict';

const { ChatRepository } = require('../../domain/chat/ports/ChatRepository');
const { Conversation } = require('../../domain/chat/entities/Conversation');
const { Message } = require('../../domain/chat/entities/Message');
const { MuteRule } = require('../../domain/chat/policies/MuteRule');

class SupabaseChatRepository extends ChatRepository {
  static MESSAGE_SELECT = 'id, conversation_id, sender_id, client_message_id, body, encrypted_payload, e2e_key_version, created_at, deleted_at, retention_until, chat_message_attachments(media_id, variant, kind)';
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
        // body sempre string ('' para mensagens cifradas) — satisfaz NOT NULL sem texto puro.
        body: message.body ?? '',
        encrypted_payload: message.encryptedPayload ?? null,
        e2e_key_version: message.e2eKeyVersion ?? null,
        created_at: message.createdAt.toISOString(),
      }, { onConflict: 'sender_id,client_message_id' })
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .single();
    if (error) throw this.#error(error);
    if (message.attachments.length > 0) {
      await this.#saveAttachments(data.id, message.attachments);
      return (await this.#findMessage(data.id)) ?? this.#toMessage(data);
    }
    return this.#toMessage(data);
  }

  async findDeliveryContext(messageId) {
    const message = await this.#findMessage(messageId);
    const conversation = message ? await this.findConversation(message.conversationId) : null;
    if (!message || !conversation) return null;
    return {
      message,
      sender: await this.#buscarRemetente(message.senderId),
      recipients: conversation.recipientIds(message.senderId),
      muteRules: await this.#listMuteRules(message.conversationId),
    };
  }

  async listMessagesReverse({ conversationId, cursor = null, limit = 30 }) {
    const parsedCursor  = SupabaseChatRepository.#parseCursor(cursor);
    const clampedLimit  = Math.min(Math.max(Number(limit) || 30, 1), 100);

    let query = this.#db
      .from('chat_messages')
      .select(SupabaseChatRepository.MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .order('id',          { ascending: false })
      .limit(clampedLimit);

    if (parsedCursor?.createdAt && parsedCursor?.id) {
      query = query.or(
        `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},id.lt.${parsedCursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw this.#error(error);
    const items = await this.#enriquecerMensagensComRemetente(
      (data ?? []).map(row => this.#toMessage(row).toJSON()),
    );
    return { items, nextCursor: items.length === clampedLimit ? items[items.length - 1].sortKey : null };
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

  async listConversationsForUser(userId) {
    // Busca conversas ativas com última mensagem e contagem de não lidas
    const { data, error } = await this.#db.rpc('list_conversations_for_user', {
      p_user_id: userId,
    });
    if (error) throw this.#error(error);
    return (data ?? []).map(row => ({
      id:        row.id,
      type:      row.type,
      createdAt: row.created_at,
      lastMessage: row.last_message_body != null ? {
        body:      row.last_message_body,
        createdAt: row.last_message_at,
        senderId:  row.last_message_sender_id,
      } : null,
      unreadCount:        row.last_message_sender_id === userId ? 0 : Number(row.unread_count ?? 0),
      otherParticipantIds: (row.other_participant_ids ?? []),
    }));
  }

  async findOrCreateDirect(userA, userB) {
    const { data, error } = await this.#db.rpc('find_or_create_direct_conversation', {
      p_user_a: userA,
      p_user_b: userB,
    });
    if (error) throw this.#error(error);
    return this.findConversation(data);
  }

  async markConversationRead(conversationId, userId) {
    const participant = await this.#findActiveParticipant(conversationId, userId);
    if (!participant) return null;

    const lastMessage = await this.#findLastMessageId(conversationId);
    const { error } = await this.#db
      .from('chat_participants')
      .update({ last_read_message_id: lastMessage?.id ?? null })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null);
    if (error) throw this.#error(error);

    // Registra recibo de leitura da última mensagem (auditoria)
    if (lastMessage?.id) {
      const { error: receiptError } = await this.#db
        .from('chat_read_receipts')
        .upsert(
          { message_id: lastMessage.id, user_id: userId },
          { onConflict: 'message_id,user_id' },
        );
      if (receiptError) {
        /* eslint-disable no-console */
        console.warn('[SupabaseChatRepository] chat_read_receipts upsert falhou (best-effort):', receiptError.message);
      }
    }

    return {
      conversationId,
      lastReadMessageId: lastMessage?.id ?? null,
      unreadCount: 0,
    };
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

  async #findActiveParticipant(conversationId, userId) {
    const { data, error } = await this.#db
      .from('chat_participants')
      .select('conversation_id, user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ?? null;
  }

  async #findLastMessageId(conversationId) {
    const { data, error } = await this.#db
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw this.#error(error);
    return data ?? null;
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

  async #enriquecerMensagensComRemetente(messages) {
    if (!messages.length) return messages;
    const ids = [...new Set(messages.map(message => message.senderId).filter(Boolean))];
    const profiles = await this.#buscarRemetentes(ids);
    return messages.map(message => ({
      ...message,
      sender: SupabaseChatRepository.#senderDto(profiles.get(message.senderId), message.senderId),
    }));
  }

  async #buscarRemetente(senderId) {
    if (!senderId) return null;
    const profiles = await this.#buscarRemetentes([senderId]);
    return SupabaseChatRepository.#senderDto(profiles.get(senderId), senderId);
  }

  async #buscarRemetentes(senderIds) {
    const ids = [...new Set((senderIds ?? []).filter(Boolean))];
    if (!ids.length) return new Map();
    try {
      const { data, error } = await this.#db
        .from('profiles')
        .select('id, full_name, avatar_path, role')
        .in('id', ids);
      if (error) throw this.#error(error);
      return new Map((data ?? []).map(profile => [profile.id, profile]));
    } catch (_) {
      return new Map();
    }
  }

  static #senderDto(profile, senderId) {
    return {
      id: profile?.id ?? senderId ?? null,
      name: profile?.full_name ?? null,
      avatarPath: profile?.avatar_path ?? null,
      role: profile?.role ?? null,
    };
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
      encryptedPayload: row.encrypted_payload ?? null,
      e2eKeyVersion: row.e2e_key_version ?? null,
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

  async purgeExpiredMessages(olderThanDays = 7) {
    const { data, error } = await this.#db.rpc('purge_expired_chat_messages', {
      p_older_than_days: olderThanDays,
    });
    if (error) throw this.#error(error);
    return Number(data ?? 0);
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
