'use strict';

/**
 * realtime.js — Constantes de configuração do gateway WebSocket.
 *
 * Todos os valores podem ser sobrescritos via variáveis de ambiente.
 */

/** Máximo de conexões simultâneas por canal (ex: fila.shopId). */
const MAX_CONN_PER_CHANNEL = Number(process.env.WS_MAX_CONN_PER_CHANNEL ?? 1000);

/** Máximo de canais simultâneos por conexão WebSocket. */
const MAX_CHANNELS_PER_CONN = Number(process.env.WS_MAX_CHANNELS_PER_CONN ?? 5);

/** Taxa máxima de mensagens recebidas do cliente por segundo. */
const RATE_LIMIT_PER_SEC = Number(process.env.WS_RATE_LIMIT_PER_SEC ?? 10);

/** TTL do buffer de replay em segundos (5 minutos). */
const REPLAY_TTL_SECONDS = Number(process.env.WS_REPLAY_TTL_SECONDS ?? 300);

/** Número máximo de eventos armazenados por canal no buffer de replay. */
const REPLAY_MAX_EVENTS = Number(process.env.WS_REPLAY_MAX_EVENTS ?? 50);

/** Intervalo do ping automático em ms (mantém conexão viva). */
const WS_PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS ?? 30_000);

/** Threshold de bufferedAmount em bytes para backpressure (1 MB). */
const BACKPRESSURE_THRESHOLD_BYTES = Number(
  process.env.WS_BACKPRESSURE_THRESHOLD_BYTES ?? 1_048_576,
);

/** Prefixo dos canais Redis pub/sub. */
const REDIS_CHANNEL_PREFIX = 'bf:realtime:';

/** Prefixo das chaves Redis do buffer de replay. */
const REDIS_REPLAY_PREFIX = 'bf:replay:';

/**
 * Canais suportados pelo gateway.
 * Chave = tipo (primeiro segmento do nome do canal).
 */
const CHANNELS = Object.freeze({
  FILA:             'fila',
  NOTIFICACOES:     'notificacoes',
  CHAT:             'chat',
  BARBERSHOP_STATUS: 'barbershop',
  PRESENCE:         'presence',
});

/**
 * Tipos de eventos versionados suportados.
 * Formato: events.v1.<dominio>.<acao>
 */
const EVENT_TYPES = Object.freeze({
  FILA_ENTRADA_CRIADA:          'events.v1.fila.entrada_criada',
  FILA_ENTRADA_ATUALIZADA:      'events.v1.fila.entrada_atualizada',
  FILA_ENTRADA_REMOVIDA:        'events.v1.fila.entrada_removida',
  NOTIFICACAO_NOVA:             'events.v1.notificacao.nova',
  CHAT_MESSAGE_CREATED:         'events.v1.chat.message_created',
  CHAT_CONVERSATION_READ:        'events.v1.chat.conversation_read',
  CHAT_TYPING_CHANGED:          'events.v1.chat.typing_changed',
  BARBERSHOP_STATUS_ALTERADO:   'events.v1.barbershop.status_alterado',
  PRESENCE_USUARIO_ENTROU:      'events.v1.presence.usuario_entrou',
  PRESENCE_USUARIO_SAIU:        'events.v1.presence.usuario_saiu',
});

/** Canais que suportam replay de eventos (last-event-id). */
const CHANNELS_WITH_REPLAY = Object.freeze(new Set([
  CHANNELS.FILA,
  CHANNELS.NOTIFICACOES,
  CHANNELS.CHAT,
]));

module.exports = Object.freeze({
  MAX_CONN_PER_CHANNEL,
  MAX_CHANNELS_PER_CONN,
  RATE_LIMIT_PER_SEC,
  REPLAY_TTL_SECONDS,
  REPLAY_MAX_EVENTS,
  WS_PING_INTERVAL_MS,
  BACKPRESSURE_THRESHOLD_BYTES,
  REDIS_CHANNEL_PREFIX,
  REDIS_REPLAY_PREFIX,
  CHANNELS,
  EVENT_TYPES,
  CHANNELS_WITH_REPLAY,
});
