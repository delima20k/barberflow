'use strict';

const { Router }             = require('express');
const webpush                = require('web-push');
const AuthMiddleware         = require('../middlewares/auth');
const SupabaseClient         = require('../utils/SupabaseClient');
const PushService            = require('../services/PushService');
const NotificacoesController = require('../controllers/NotificacoesController');

// ── Inicialização lazy ────────────────────────────────────────────
// webpush.setVapidDetails() valida formato das chaves e LANÇA erro se inválidas.
// Manter fora de função causava crash no require() deste módulo →
// criarApp() falhava → 503 em TODOS os endpoints incluindo /auth/login.
let _vapidOk = false;
let _ctrl    = null;

function _initVapid() {
  if (_vapidOk) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error('[BFF] VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY não configuradas — Web Push DESATIVADO. Configure-as nas variáveis de ambiente do Vercel.');
    return;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:contato@barberflow.app',
      publicKey,
      privateKey,
    );
    _vapidOk = true;
  } catch (err) {
    console.error('[BFF] webpush.setVapidDetails falhou (chave VAPID inválida?) —', err.message);
  }
}

function ctrl() {
  if (_ctrl) return _ctrl;          // já inicializado com sucesso
  _initVapid();
  if (!_vapidOk) return null;       // VAPID indisponível — não cacheia para permitir retry futuro
  const db  = SupabaseClient.getInstance();
  const svc = new PushService(db, webpush);
  _ctrl     = new NotificacoesController(db, svc);
  return _ctrl;
}

const router = Router();

// Todas as rotas de /notificacoes exigem autenticação
router.use(AuthMiddleware.verificar);

router.post('/push-barbeiro', (req, res) => {
  const c = ctrl();
  if (!c) {
    console.warn('[BFF] push-barbeiro: VAPID não configurado — retornando PUSH_UNAVAILABLE.');
    return res.status(200).json({ ok: false, reason: 'PUSH_UNAVAILABLE' });
  }
  c.pushBarbeiro(req, res);
});

module.exports = router;
