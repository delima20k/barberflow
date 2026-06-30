'use strict';

const { Router }      = require('express');
const AuthMiddleware  = require('../middlewares/auth');
const SupabaseClient  = require('../utils/SupabaseClient');
const AuthRepository  = require('../repositories/AuthRepository');
const AuthBffService  = require('../services/AuthBffService');
const AuthController  = require('../controllers/AuthController');
const { ResendEmailService } = require('../infrastructure/email/ResendEmailService');

// ── Inicialização lazy ────────────────────────────────────────────
// Criado na primeira requisição, não no carregamento do módulo.
// Garante que SUPABASE_ANON_KEY ausente não derrube rotas não-auth.
let _ctrl = null;

function ctrl() {
  if (!_ctrl) {
    const db   = SupabaseClient.getInstance();
    const repo = new AuthRepository(db);
    const emailService = new ResendEmailService();
    const svc  = new AuthBffService(repo, emailService);
    _ctrl = new AuthController(svc);
  }
  return _ctrl;
}

const router = Router();

// ── Rotas públicas (sem JWT) ──────────────────────────────────────
router.post('/login',   (req, res) => ctrl().login(req, res));
router.post('/refresh', (req, res) => ctrl().refresh(req, res));
router.post('/signup-confirmation', (req, res) => ctrl().enviarConfirmacaoCadastro(req, res));
router.post('/forgot-password',     (req, res) => ctrl().solicitarRecuperacaoSenha(req, res));

// ── Rotas autenticadas (JWT obrigatório) ──────────────────────────
router.post('/logout',    AuthMiddleware.verificar, (req, res) => ctrl().logout(req, res));
router.get('/me',         AuthMiddleware.verificar, (req, res) => ctrl().me(req, res));
router.post('/documento', AuthMiddleware.verificar, (req, res) => ctrl().salvarDocumento(req, res));
router.post('/password-changed-notification', AuthMiddleware.verificar, (req, res) => ctrl().notificarSenhaAlterada(req, res));

module.exports = router;
