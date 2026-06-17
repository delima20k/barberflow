'use strict';

const express             = require('express');
const { Router }          = express;
const BarbeariaRepository = require('../repositories/BarbeariaRepository');
const BarbeariaService    = require('../services/BarbeariaService');
const BarbeariaMediaService = require('../services/BarbeariaMediaService');
const BarbeariaController = require('../controllers/BarbeariaController');
const AuthMiddleware      = require('../middlewares/auth');
const { SupabaseChatRepository } = require('../infrastructure/chat/SupabaseChatRepository');
const { OutboxRepository } = require('../infrastructure/outbox/OutboxRepository');
const { BlockPolicy } = require('../domain/chat/policies/BlockPolicy');
const { SendMessageUseCase } = require('../application/chat/SendMessageUseCase');
const { SupabaseBroadcaster } = require('../infrastructure/realtime/SupabaseBroadcaster');
const { BarbershopPublicCacheProvider } = require('../infrastructure/cache/BarbershopPublicCacheProvider');
const { NominatimGeocoderAdapter } = require('../infrastructure/geo/NominatimGeocoderAdapter');
const { SupabaseMediaRepository } = require('../infrastructure/media/SupabaseMediaRepository');
const { R2StorageGateway } = require('../infrastructure/media/R2StorageGateway');
const { SupabaseMediaStorageGateway } = require('../infrastructure/media/SupabaseMediaStorageGateway');
const { DeleteStoryUseCase } = require('../application/stories/DeleteStoryUseCase');

// ── Factory: recebe db injetado por criarApp() ───────────────────
// Permite isolamento de dependências em testes (evita caching de módulo).
module.exports = function criarBarbeariaRoute(db) {
  const repo = new BarbeariaRepository(db);
  const chatRepository = new SupabaseChatRepository(db);
  const blockPolicy = new BlockPolicy({ blockRepository: chatRepository });
  const sendMessageUseCase = new SendMessageUseCase({
    chatRepository,
    blockPolicy,
    outboxRepository: new OutboxRepository({ supabase: db }),
  });
  const broadcaster = new SupabaseBroadcaster();
  const publicCache = BarbershopPublicCacheProvider.create();
  const geocoder = new NominatimGeocoderAdapter({ userAgent: 'BarberFlow-BFF/1.0 (delima20k@gmail.com)' });
  const svc  = new BarbeariaService(repo, sendMessageUseCase, broadcaster, publicCache, geocoder);
  const mediaSvc = new BarbeariaMediaService(repo);
  const mediaRepo = new SupabaseMediaRepository(db);
  const deleteStoryUseCase = new DeleteStoryUseCase({
    storyRepository:        repo,
    mediaRepository:        mediaRepo,
    r2Gateway:              R2StorageGateway.tryCreate(),
    supabaseStorageGateway: new SupabaseMediaStorageGateway({ db }),
  });
  const ctrl = new BarbeariaController(svc, mediaSvc, deleteStoryUseCase);

  const router = Router();
  const rawImage = express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '6mb' });

  // ── Rotas ─────────────────────────────────────────────────────
  // ATENÇÃO: /destaque e /todas devem vir ANTES de /:id para evitar
  // conflito de parâmetro dinâmico (Express resolve em ordem de registro).
  router.patch('/minha/endereco',                           AuthMiddleware.verificar, ctrl.salvarEndereco.bind(ctrl));
  router.patch('/minha/mensalidade',                        AuthMiddleware.verificar, ctrl.salvarMensalidade.bind(ctrl));
  router.patch('/minha/imagem',                             AuthMiddleware.verificar, rawImage, ctrl.salvarImagem.bind(ctrl));
  router.patch('/minha/servicos/imagem',                    AuthMiddleware.verificar, rawImage, ctrl.salvarImagemServico.bind(ctrl));
  router.get('/minha/convites/barbeiros-disponiveis',       AuthMiddleware.verificar, ctrl.buscarBarbeirosDisponiveis.bind(ctrl));
  router.post('/minha/convites',                            AuthMiddleware.verificar, ctrl.enviarConvites.bind(ctrl));
  router.get('/minha/equipe-status',                        AuthMiddleware.verificar, ctrl.getEquipeComStatus.bind(ctrl));
  router.post('/minha/dispensar/:professional_id',          AuthMiddleware.verificar, ctrl.dispensarBarbeiro.bind(ctrl));
  router.delete('/minha/convites/:invite_id',               AuthMiddleware.verificar, ctrl.cancelarConvite.bind(ctrl));
  // INÍCIO ALTERAÇÃO - Rota pública de interactions do portfolio da barbearia
  // GET /portfolio/interacoes?ids=id1,id2 — sem auth, retorna mapa {imageId: interactions[]}
  // Deve vir ANTES de /:barbershop_id para evitar conflito de parâmetro dinâmico.
  router.get('/portfolio/interacoes',                       ctrl.portfolioInteracoes.bind(ctrl));
  // FIM ALTERAÇÃO
  // Feed de stories da home: barbearias com stories ativos (public, sem auth).
  // Registrado ANTES de /:barbershop_id para evitar conflito de parâmetro.
  router.get('/stories/feed',                               ctrl.listarFeedStories.bind(ctrl));
  router.post('/:barbershop_id/mensalidade/interesse',      AuthMiddleware.verificar, ctrl.interesseMensalidade.bind(ctrl));
  router.get('/:barbershop_id/barbeiros-status',            ctrl.listarStatusBarbeiros.bind(ctrl));
  router.patch('/:barbershop_id/me/status',                 AuthMiddleware.verificar, ctrl.atualizarMeuStatusBarbeiro.bind(ctrl));
  router.get('/:barbershop_id/gestao',                      AuthMiddleware.verificar, ctrl.getGestaoVinculada.bind(ctrl));
  router.get('/:barbershop_id/stories',                     ctrl.listarStories.bind(ctrl));
  router.post('/:barbershop_id/stories',                    AuthMiddleware.verificar, ctrl.salvarStoryProfissional.bind(ctrl));
  router.delete('/:barbershop_id/stories/:story_id',        AuthMiddleware.verificar, ctrl.excluirStory.bind(ctrl));
  router.get('/:barbershop_id/portfolio',                   ctrl.portfolio.bind(ctrl));
  router.get('/destaque', ctrl.destaque.bind(ctrl));
  router.get('/todas',    ctrl.todas.bind(ctrl));
  router.get('/',         ctrl.proximas.bind(ctrl));

  return router;
};
