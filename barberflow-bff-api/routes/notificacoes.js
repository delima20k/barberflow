'use strict';

const { Router }                = require('express');
const webpush                   = require('web-push');
const AuthMiddleware            = require('../middlewares/auth');
const SupabaseClient            = require('../utils/SupabaseClient');
const PushService               = require('../services/PushService');
const NotificacoesController    = require('../controllers/NotificacoesController');

// Inicializa VAPID uma vez — a mesma chave pública usada no frontend.
// Não configura se as chaves não estiverem definidas (ex: testes sem .env).
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT    ?? 'mailto:contato@barberflow.app';
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const db   = SupabaseClient.getInstance();
const svc  = new PushService(db, webpush);
const ctrl = new NotificacoesController(db, svc);

const router = Router();

// Todas as rotas de /notificacoes exigem autenticação
router.use(AuthMiddleware.verificar);

router.post('/push-barbeiro', (req, res) => ctrl.pushBarbeiro(req, res));

module.exports = router;
