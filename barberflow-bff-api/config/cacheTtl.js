'use strict';

/**
 * cacheTtl — TTL (segundos) configurável por contexto de domínio.
 *
 * Critérios de escolha:
 *  - Frequência de mutação do dado
 *  - Tolerância a stale data (divergência entre cache e banco)
 *  - Impacto financeiro/operacional de um cache miss
 *
 * @type {Readonly<Record<string, number>>}
 */
const CACHE_TTL = Object.freeze({
  // ── Agendamentos ────────────────────────────────────────────────
  // TTL curto: status muda com frequência (confirmed, in_progress, done)
  AGENDAMENTO_SINGLE:        60,   // 1 min — leitura individual
  AGENDAMENTO_LIST:          30,   // 30 s  — listagem por cliente/profissional

  // ── Fila de espera ──────────────────────────────────────────────
  // Muito volátil: posição muda a cada entrada/saída
  FILA_LIST:                 10,   // 10 s  — fila ativa de uma barbearia
  FILA_COUNT:                 5,   //  5 s  — contagem de ativos (usada para posição)

  // ── Barbearia ───────────────────────────────────────────────────
  // Dados de perfil raramente mudam (nome, logo, endereço)
  BARBEARIA_PROFILE:        300,   //  5 min
  BARBEARIA_NEARBY:          60,   //  1 min — depende da geolocalização do usuário
  BARBEARIA_PUBLIC_LIST:     60,   //  1 min — endpoints públicos /destaque e /todas

  // ── Serviços & produtos ─────────────────────────────────────────
  // Catálogo de serviços — atualiza raramente
  SERVICOS_LIST:            600,   // 10 min

  // Feed invalida por NewPost, Block e Unfollow; TTL curto limita stale em falha de evento.
  FEED_TIMELINE:             45,

  // ── Idempotência ────────────────────────────────────────────────
  // 24 h — janela de retry HTTP convencional
  IDEMPOTENCY:            86_400,

  // ── Padrão seguro para contextos não mapeados ───────────────────
  DEFAULT:                   60,
});

module.exports = { CACHE_TTL };
