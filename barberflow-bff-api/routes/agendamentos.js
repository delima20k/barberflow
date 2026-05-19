'use strict';

const { Router }              = require('express');
const AuthMiddleware          = require('../middlewares/auth');
const SupabaseClient          = require('../utils/SupabaseClient');
const AgendamentoRepository   = require('../repositories/AgendamentoRepository');
const AgendamentoBffService   = require('../services/AgendamentoBffService');
const AgendamentoController   = require('../controllers/AgendamentoController');

// ── Inicialização lazy ────────────────────────────────────────────
// Instanciado na primeira requisição para evitar crash durante cold-start
// quando env vars ainda não estão disponíveis.
let _ctrl = null;

function ctrl() {
  if (!_ctrl) {
    const db   = SupabaseClient.getInstance();
    const repo = new AgendamentoRepository(db);
    const svc  = new AgendamentoBffService(repo);
    _ctrl = new AgendamentoController(svc);
  }
  return _ctrl;
}

const router = Router();

// Todas as rotas de agendamentos exigem autenticação JWT.

// GET  /api/agendamentos        — lista agendamentos do usuário autenticado
router.get('/',    AuthMiddleware.verificar, (req, res) => ctrl().listar(req, res));

// POST /api/agendamentos        — cria novo agendamento
router.post('/',   AuthMiddleware.verificar, (req, res) => ctrl().criar(req, res));

// PATCH /api/agendamentos/:id   — atualiza status
router.patch('/:id', AuthMiddleware.verificar, (req, res) => ctrl().atualizarStatus(req, res));

// DELETE /api/agendamentos/:id  — cancela agendamento
router.delete('/:id', AuthMiddleware.verificar, (req, res) => ctrl().cancelar(req, res));

module.exports = router;
