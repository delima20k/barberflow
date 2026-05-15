'use strict';

const { Router }      = require('express');
const AuthMiddleware  = require('../middlewares/auth');
const SupabaseClient  = require('../utils/SupabaseClient');
const AuthRepository  = require('../repositories/AuthRepository');
const AuthBffService  = require('../services/AuthBffService');
const AuthController  = require('../controllers/AuthController');

const db   = SupabaseClient.getInstance();
const repo = new AuthRepository(db);
const svc  = new AuthBffService(repo);
const ctrl = new AuthController(svc);

const router = Router();

// ── Rotas públicas (sem JWT) ──────────────────────────────────────
router.post('/login',   (req, res) => ctrl.login(req, res));
router.post('/refresh', (req, res) => ctrl.refresh(req, res));

// ── Rotas autenticadas (JWT obrigatório) ──────────────────────────
router.post('/logout', AuthMiddleware.verificar, (req, res) => ctrl.logout(req, res));
router.get('/me',      AuthMiddleware.verificar, (req, res) => ctrl.me(req, res));

module.exports = router;
