'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AbuseConfig.js — Configuração por endpoint/evento com defaults seguros.
//
// Cada entrada define:
//   strategy        : 'sliding_window' | 'token_bucket'
//   windowMs / max  : para SlidingWindow
//   capacity / refillPerSec : para TokenBucket
//   rules           : quais Specifications avaliar neste endpoint
//   established     : multiplicador de threshold para usuário com rep >= 70
//   suspect         : multiplicador de threshold para usuário com rep < 40
//
// Matriz de cobertura por contexto:
//   Context     | new_account | geo_velocity | content_similarity | bot_signature
//   auth        |      —      |      ✓       |         —          |      ✓
//   chat        |      ✓      |      —       |         ✓          |      ✓
//   feed/post   |      ✓      |      —       |         ✓          |      ✓
//   upload      |      ✓      |      —       |         —          |      ✓
//   geo         |      —      |      ✓       |         —          |      ✓
//   agendamento |      ✓      |      —       |         —          |      ✓
//   signup      |      —      |      ✓       |         —          |      ✓
//   default     |      —      |      —       |         —          |      ✓
//
// Taxa esperada de falso positivo:
//   bot_signature alone   : ~0.5% (UAs legítimos exóticos)
//   content_similarity    : ~1%   (copy-paste acidental)
//   geo_velocity          : ~0.1% (VPN + rede celular simultânea)
//   new_account           : ~2%   (power user recém cadastrado)
//   Combinação AND(bot+sim): ~0.005% → aceitável para hard_block
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT_CONFIG = {
  'POST /api/auth': {
    strategy: 'sliding_window', windowMs: 15 * 60_000, max: 10,
    rules: ['bot_signature', 'geo_velocity'],
    established: { multiplier: 1.5 },
    suspect:     { multiplier: 0.5 },
  },

  'POST /api/v1/chat': {
    strategy: 'sliding_window', windowMs: 60_000, max: 30,
    rules: ['new_account', 'content_similarity', 'bot_signature'],
    established: { multiplier: 2 },
    suspect:     { multiplier: 0.5 },
  },

  'POST /api/v1/feed': {
    strategy: 'token_bucket', capacity: 20, refillPerSec: 0.5,
    rules: ['new_account', 'content_similarity', 'bot_signature'],
    established: { multiplier: 2 },
    suspect:     { multiplier: 0.5 },
  },

  'POST /api/v1/media': {
    strategy: 'sliding_window', windowMs: 60_000, max: 10,
    rules: ['new_account', 'bot_signature'],
    established: { multiplier: 3 },
    suspect:     { multiplier: 0.3 },
  },

  'POST /api/v1/geo': {
    strategy: 'sliding_window', windowMs: 5_000, max: 5,
    rules: ['geo_velocity', 'bot_signature'],
    established: { multiplier: 1.5 },
    suspect:     { multiplier: 0.5 },
  },

  'POST /api/v1/clientes': {
    strategy: 'sliding_window', windowMs: 60 * 60_000, max: 3,
    rules: ['bot_signature', 'geo_velocity'],
    established: { multiplier: 1 },
    suspect:     { multiplier: 0.5 },
  },

  'POST /api/agendamentos': {
    strategy: 'sliding_window', windowMs: 60_000, max: 15,
    rules: ['new_account', 'bot_signature'],
    established: { multiplier: 2 },
    suspect:     { multiplier: 0.5 },
  },

  // Default: qualquer rota não mapeada
  '*': {
    strategy: 'sliding_window', windowMs: 60_000, max: 100,
    rules: ['bot_signature'],
    established: { multiplier: 1.5 },
    suspect:     { multiplier: 0.8 },
  },
};

/**
 * Retorna a configuração mais específica para o par método+path.
 * Ordem de prioridade: correspondência exata → prefixo mais longo → default.
 *
 * @param {string} method — HTTP method (ex: 'POST')
 * @param {string} path   — caminho da rota (ex: '/api/v1/chat/mensagem')
 * @returns {object}
 */
function getEndpointConfig(method, path) {
  const key = `${method} ${path}`;
  let bestMatch  = null;
  let bestLength = -1;

  for (const [pattern, cfg] of Object.entries(ENDPOINT_CONFIG)) {
    if (pattern === '*') continue;
    if (key.startsWith(pattern) && pattern.length > bestLength) {
      bestMatch  = cfg;
      bestLength = pattern.length;
    }
  }

  return bestMatch ?? ENDPOINT_CONFIG['*'];
}

module.exports = { ENDPOINT_CONFIG, getEndpointConfig };
