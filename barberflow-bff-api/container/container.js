'use strict';

const { createContainer, asClass, asValue, asFunction, InjectionMode } = require('awilix');

const { getSupabaseClient } = require('../config/supabase');
const { MemoryCache }       = require('../infrastructure/cache/MemoryCache');
const { RedisCache }        = require('../infrastructure/cache/RedisCache');
const { AgendamentoRepository } = require('../infrastructure/db/AgendamentoRepository');
const { FilaRepository }        = require('../infrastructure/db/FilaRepository');
const { SupabaseUnitOfWork }    = require('../infrastructure/shared/SupabaseUnitOfWork');

const { CriarAgendamentoUseCase }          = require('../application/agendamento/CriarAgendamentoUseCase');
const { AtualizarStatusAgendamentoUseCase } = require('../application/agendamento/AtualizarStatusAgendamentoUseCase');
const { EntrarNaFilaUseCase }              = require('../application/fila/EntrarNaFilaUseCase');
const { AtualizarStatusFilaUseCase }       = require('../application/fila/AtualizarStatusFilaUseCase');

/**
 * Monta e retorna o container awilix configurado.
 * Deve ser chamado uma vez no boot da aplicação.
 * @returns {import('awilix').AwilixContainer}
 */
function buildContainer() {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });

  // ── Infraestrutura ─────────────────────────────────────────────
  const supabaseClient = getSupabaseClient();

  container.register({
    supabaseClient: asValue(supabaseClient),
  });

  // Cache — seleciona driver pela env
  const cacheDriver = process.env.CACHE_DRIVER ?? 'memory';
  if (cacheDriver === 'redis' && process.env.REDIS_URL) {
    const Redis = require('ioredis'); // eslint-disable-line global-require
    container.register({ redisClient: asValue(new Redis(process.env.REDIS_URL)) });
    container.register({ cache: asClass(RedisCache).singleton() });
  } else {
    container.register({ cache: asClass(MemoryCache).singleton() });
  }

  container.register({
    unitOfWork:           asClass(SupabaseUnitOfWork).singleton(),
    agendamentoRepository: asClass(AgendamentoRepository).singleton(),
    filaRepository:        asClass(FilaRepository).singleton(),
  });

  // ── Use Cases (scoped — nova instância por request) ────────────
  container.register({
    criarAgendamentoUseCase:           asClass(CriarAgendamentoUseCase).scoped(),
    atualizarStatusAgendamentoUseCase: asClass(AtualizarStatusAgendamentoUseCase).scoped(),
    entrarNaFilaUseCase:               asClass(EntrarNaFilaUseCase).scoped(),
    atualizarStatusFilaUseCase:        asClass(AtualizarStatusFilaUseCase).scoped(),
  });

  return container;
}

module.exports = { buildContainer };
