'use strict';

const { Router }               = require('express');
const { FilaRepository }       = require('../infrastructure/db/FilaRepository');
const BarbeariaRepository      = require('../repositories/BarbeariaRepository');
const { EntrarNaFilaUseCase }  = require('../application/fila/EntrarNaFilaUseCase');
const FilaConvidadoController  = require('../controllers/FilaConvidadoController');

/**
 * criarFilaConvidadoRoute — Rota pública (sem auth) para visitante sem conta
 * entrar na fila. Usa service-role key (injetado via `db`) para gravar
 * client_id = null, contornando a RLS que só aceita insert do próprio
 * cliente logado ou do profissional responsável.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('express').Router}
 */
module.exports = function criarFilaConvidadoRoute(db) {
  const filaRepository      = new FilaRepository({ supabaseClient: db });
  const barbeariaRepository = new BarbeariaRepository(db);
  const useCase = new EntrarNaFilaUseCase({ filaRepository, barbeariaRepository });
  const ctrl    = new FilaConvidadoController(useCase);

  const router = Router();

  // POST /api/v1/fila/entrar — visitante sem conta entra na fila.
  router.post('/entrar', ctrl.entrar.bind(ctrl));

  return router;
};
