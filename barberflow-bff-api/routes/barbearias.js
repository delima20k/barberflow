'use strict';

const { Router }          = require('express');
const SupabaseClient      = require('../utils/SupabaseClient');
const BarbeariaRepository = require('../repositories/BarbeariaRepository');
const BarbeariaService    = require('../services/BarbeariaService');
const BarbeariaController = require('../controllers/BarbeariaController');

// ── Injeção de dependências ──────────────────────────────────────
const db     = SupabaseClient.getInstance();
const repo   = new BarbeariaRepository(db);
const svc    = new BarbeariaService(repo);
const ctrl   = new BarbeariaController(svc);

const router = Router();

// ── Rotas públicas (sem autenticação) ───────────────────────────
// ATENÇÃO: /destaque e /todas devem vir ANTES de /:id para evitar
// conflito de parâmetro dinâmico (Express resolve em ordem de registro).
router.get('/destaque', ctrl.destaque.bind(ctrl));
router.get('/todas',    ctrl.todas.bind(ctrl));
router.get('/',         ctrl.proximas.bind(ctrl));

module.exports = router;
