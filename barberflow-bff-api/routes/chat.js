'use strict';

const { Router } = require('express');
const AuthMiddleware = require('../middlewares/auth');
const ChatController = require('../controllers/ChatController');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');
const { BlockPolicy } = require('../domain/chat/policies/BlockPolicy');
const { SendMessageUseCase } = require('../application/chat/SendMessageUseCase');
const { ListMessagesUseCase } = require('../application/chat/ListMessagesUseCase');
const { SoftDeleteMessageUseCase } = require('../application/chat/SoftDeleteMessageUseCase');
const { ListConversationsUseCase } = require('../application/chat/ListConversationsUseCase');
const { GetOrCreateConversationUseCase } = require('../application/chat/GetOrCreateConversationUseCase');

module.exports = function criarChatRoute(db, deps = {}) {
  const chatRepository = deps.chatRepository ?? new SupabaseChatRepository(db);
  const blockPolicy    = deps.blockPolicy    ?? new BlockPolicy({ blockRepository: chatRepository });
  const controller     = deps.controller     ?? new ChatController({
    sendMessageUseCase: deps.sendMessageUseCase ?? new SendMessageUseCase({
      chatRepository,
      blockPolicy,
      outboxRepository: deps.outboxRepository ?? new OutboxRepository({ supabase: db }),
    }),
    listMessagesUseCase:      deps.listMessagesUseCase      ?? new ListMessagesUseCase({ chatRepository }),
    softDeleteMessageUseCase: deps.softDeleteMessageUseCase ?? new SoftDeleteMessageUseCase({ chatRepository }),
    listConversationsUseCase: deps.listConversationsUseCase ?? new ListConversationsUseCase({ chatRepository }),
    getOrCreateConversationUseCase: deps.getOrCreateConversationUseCase
      ?? new GetOrCreateConversationUseCase({ chatRepository, blockPolicy }),
  });
  const router = Router();
  router.get ('/conversations',                           AuthMiddleware.verificar, controller.listConversations.bind(controller));
  router.post('/conversations',                           AuthMiddleware.verificar, controller.getOrCreate.bind(controller));
  router.get ('/conversations/:conversationId/messages',  AuthMiddleware.verificar, controller.list.bind(controller));
  router.post('/conversations/:conversationId/messages',  AuthMiddleware.verificar, controller.send.bind(controller));
  router.delete('/messages/:messageId',                   AuthMiddleware.verificar, controller.remove.bind(controller));
  return router;
};
