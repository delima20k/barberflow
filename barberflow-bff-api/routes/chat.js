'use strict';

const { Router } = require('express');
const AuthMiddleware = require('../middlewares/auth');
const ChatController = require('../controllers/ChatController');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');
const { SupabaseUserKeyRepository } = require('../infrastructure/chat/SupabaseUserKeyRepository');
const { BlockPolicy } = require('../domain/chat/policies/BlockPolicy');
const { SendMessageUseCase } = require('../application/chat/SendMessageUseCase');
const { ListMessagesUseCase } = require('../application/chat/ListMessagesUseCase');
const { SoftDeleteMessageUseCase } = require('../application/chat/SoftDeleteMessageUseCase');
const { ListConversationsUseCase } = require('../application/chat/ListConversationsUseCase');
const { GetOrCreateConversationUseCase } = require('../application/chat/GetOrCreateConversationUseCase');
const { MarkConversationReadUseCase } = require('../application/chat/MarkConversationReadUseCase');
const { ConversationReadPublisher } = require('../application/chat/ConversationReadPublisher');
const { MessageRealtimePublisher } = require('../application/chat/MessageRealtimePublisher');
const { SupabaseBroadcaster } = require('../infrastructure/realtime/SupabaseBroadcaster');
const { RegisterUserKeyUseCase } = require('../application/chat/RegisterUserKeyUseCase');
const { GetUserKeyUseCase } = require('../application/chat/GetUserKeyUseCase');

module.exports = function criarChatRoute(db, deps = {}) {
  const chatRepository    = deps.chatRepository    ?? new SupabaseChatRepository(db);
  const userKeyRepository = deps.userKeyRepository ?? new SupabaseUserKeyRepository(db);
  const blockPolicy       = deps.blockPolicy       ?? new BlockPolicy({ blockRepository: chatRepository });
  const broadcaster       = deps.realtimeBroadcaster ?? new SupabaseBroadcaster();
  const temEntrega        = Boolean(deps.publishToChannelUseCase) || broadcaster.habilitado;
  const readPublisher  = deps.readPublisher
    ?? (temEntrega
      ? new ConversationReadPublisher({
        publishToChannelUseCase: deps.publishToChannelUseCase ?? null,
        broadcaster,
      })
      : null);
  const messageRealtimePublisher = deps.messageRealtimePublisher
    ?? (temEntrega
      ? new MessageRealtimePublisher({
        publishToChannelUseCase: deps.publishToChannelUseCase ?? null,
        broadcaster,
      })
      : null);
  const controller = deps.controller ?? new ChatController({
    sendMessageUseCase: deps.sendMessageUseCase ?? new SendMessageUseCase({
      chatRepository,
      blockPolicy,
      outboxRepository: deps.outboxRepository ?? new OutboxRepository({ supabase: db }),
      messageRealtimePublisher,
    }),
    listMessagesUseCase:      deps.listMessagesUseCase      ?? new ListMessagesUseCase({ chatRepository }),
    softDeleteMessageUseCase: deps.softDeleteMessageUseCase ?? new SoftDeleteMessageUseCase({ chatRepository }),
    listConversationsUseCase: deps.listConversationsUseCase ?? new ListConversationsUseCase({ chatRepository }),
    getOrCreateConversationUseCase: deps.getOrCreateConversationUseCase
      ?? new GetOrCreateConversationUseCase({ chatRepository, blockPolicy }),
    markConversationReadUseCase: deps.markConversationReadUseCase
      ?? new MarkConversationReadUseCase({ chatRepository, readPublisher }),
    registerUserKeyUseCase: deps.registerUserKeyUseCase
      ?? new RegisterUserKeyUseCase({ userKeyRepository }),
    getUserKeyUseCase: deps.getUserKeyUseCase
      ?? new GetUserKeyUseCase({ userKeyRepository }),
  });

  const router = Router();
  router.get ('/conversations',                           AuthMiddleware.verificar, controller.listConversations.bind(controller));
  router.post('/conversations',                           AuthMiddleware.verificar, controller.getOrCreate.bind(controller));
  router.patch('/conversations/:conversationId/read',     AuthMiddleware.verificar, controller.markRead.bind(controller));
  router.get ('/conversations/:conversationId/messages',  AuthMiddleware.verificar, controller.list.bind(controller));
  router.post('/conversations/:conversationId/messages',  AuthMiddleware.verificar, controller.send.bind(controller));
  router.delete('/messages/:messageId',                   AuthMiddleware.verificar, controller.remove.bind(controller));
  router.post('/me/public-key',                           AuthMiddleware.verificar, controller.registerPublicKey.bind(controller));
  router.get ('/users/:userId/public-key',                AuthMiddleware.verificar, controller.getPublicKey.bind(controller));
  return router;
};
