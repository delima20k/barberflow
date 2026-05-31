'use strict';

const { Router } = require('express');
const express = require('express');

const AuthMiddleware = require('../middlewares/auth');
const ProfissionalController = require('../controllers/ProfissionalController');
const ProfissionalRepository = require('../repositories/ProfissionalRepository');
const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { BlockPolicy } = require('../domain/chat/policies/BlockPolicy');
const { SendMessageUseCase } = require('../application/chat/SendMessageUseCase');
const ProfissionalService = require('../services/ProfissionalService');

module.exports = function criarProfissionaisRoute(db, deps = {}) {
  const profissionalRepository = deps.profissionalRepository ?? new ProfissionalRepository(db);
  const chatRepository = deps.chatRepository ?? new SupabaseChatRepository(db);
  const blockPolicy = deps.blockPolicy ?? new BlockPolicy({ blockRepository: chatRepository });
  const sendMessageUseCase = deps.sendMessageUseCase ?? new SendMessageUseCase({
    chatRepository,
    blockPolicy,
    outboxRepository: deps.outboxRepository ?? new OutboxRepository({ supabase: db }),
  });
  const service = deps.service ?? new ProfissionalService(profissionalRepository, sendMessageUseCase, deps.serviceDeps);
  const controller = deps.controller ?? new ProfissionalController(service);

  const router = Router();
  router.patch('/me/public-profile', AuthMiddleware.verificar, controller.atualizarMeuPerfil.bind(controller));
  router.get('/me/portfolio', AuthMiddleware.verificar, controller.listarMeuPortfolio.bind(controller));
  router.post(
    '/me/portfolio',
    AuthMiddleware.verificar,
    express.raw({ type: '*/*', limit: '12mb' }),
    controller.uploadPortfolioImagem.bind(controller),
  );
  router.patch('/me/portfolio/:imageId', AuthMiddleware.verificar, controller.atualizarPortfolioImagem.bind(controller));
  router.delete('/me/portfolio/:imageId', AuthMiddleware.verificar, controller.removerPortfolioImagem.bind(controller));
  router.get('/me/portfolio/likes', AuthMiddleware.verificar, controller.listarCurtidasPortfolio.bind(controller));
  router.post('/me/portfolio/:imageId/like', AuthMiddleware.verificar, controller.curtirPortfolioImagem.bind(controller));
  router.delete('/me/portfolio/:imageId/like', AuthMiddleware.verificar, controller.descurtirPortfolioImagem.bind(controller));
  router.get('/me/portfolio/:imageId/mensagens', AuthMiddleware.verificar, controller.mensagensPortfolioImagem.bind(controller));
  router.get('/:id/perfil-publico', controller.perfilPublico.bind(controller));
  router.get('/:id/portfolio', controller.portfolio.bind(controller));
  router.post('/:id/mensagem-barbearia', AuthMiddleware.verificar, controller.mensagemBarbearia.bind(controller));
  return router;
};
