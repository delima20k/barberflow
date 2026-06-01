'use strict';

/**
 * Nomes, prioridades e tipos de job para o sistema de filas BullMQ.
 *
 * Prioridade BullMQ: valor MENOR = MAIOR urgência.
 * 1 = crítico, 5 = normal, 10 = baixa.
 *
 * Filas por contexto:
 *   bf:queue:high          — agendamentos e fila de espera críticos
 *   bf:queue:default       — notificações, webhooks
 *   bf:queue:low           — feed, analytics
 *   bf:queue:media         — processamento de mídia (sharp/resize)
 *   bf:queue:notifications — envio de push notifications e fallback de chat
 *   bf:queue:feed          — geração de feed
 *   bf:queue:analytics     — eventos de analytics
 *   bf:queue:webhooks      — entrega de webhooks externos
 *   bf:queue:dlq           — dead letter queue (jobs exauridos)
 */

const QUEUES = Object.freeze({
  HIGH:          'bf:queue:high',
  DEFAULT:       'bf:queue:default',
  LOW:           'bf:queue:low',
  MEDIA:         'bf:queue:media',
  NOTIFICATIONS_HIGH: 'bf:queue:notifications.high',
  NOTIFICATIONS_DEFAULT: 'bf:queue:notifications.default',
  NOTIFICATIONS: 'bf:queue:notifications.default',
  FEED:          'bf:queue:feed',
  ANALYTICS:     'bf:queue:analytics',
  WEBHOOKS:      'bf:queue:webhooks',
  DLQ:           'bf:queue:dlq',
});

const JOB_TYPES = Object.freeze({
  PROCESS_MEDIA:     'process_media',
  SEND_NOTIFICATION: 'send_notification',
  DELIVER_CHAT_MESSAGE: 'deliver_chat_message',
  GENERATE_FEED:     'generate_feed',
  DELIVER_WEBHOOK:   'deliver_webhook',
  TRACK_ANALYTICS:   'track_analytics',
});

const QUEUE_PRIORITY = Object.freeze({
  HIGH:    1,
  DEFAULT: 5,
  LOW:    10,
});

/** TTL do dedupe Redis: janela em que o mesmo jobId não será reprocessado. */
const DEDUPE_TTL_SECONDS = 86_400; // 24h

/** Configuração de retry por tipo de fila. */
const RETRY_CONFIG = Object.freeze({
  MEDIA:         { maxAttempts: 3, baseDelayMs: 2_000, maxDelayMs: 30_000 },
  NOTIFICATIONS: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
  FEED:          { maxAttempts: 2, baseDelayMs: 5_000, maxDelayMs: 30_000 },
  WEBHOOKS:      { maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 300_000 },
  ANALYTICS:     { maxAttempts: 2, baseDelayMs:   500, maxDelayMs:  5_000 },
  DEFAULT:       { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 30_000 },
});

module.exports = { QUEUES, JOB_TYPES, QUEUE_PRIORITY, DEDUPE_TTL_SECONDS, RETRY_CONFIG };
