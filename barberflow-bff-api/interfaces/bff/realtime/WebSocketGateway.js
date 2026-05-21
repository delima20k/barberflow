'use strict';

const { WebSocketServer } = require('ws');
const jwt                 = require('jsonwebtoken');

const {
  RATE_LIMIT_PER_SEC,
  BACKPRESSURE_THRESHOLD_BYTES,
  WS_PING_INTERVAL_MS,
} = require('../../../config/realtime');

/**
 * WebSocketGateway — Gateway WebSocket do BFF BarberFlow.
 *
 * RESTRIÇÃO CRÍTICA: Roda APENAS em modo servidor tradicional (PM2 / Docker).
 *   server.js detecta !process.env.VERCEL e chama gateway.attach(httpServer).
 *   NÃO é compatível com Vercel serverless (sem upgrade HTTP persistente).
 *
 * Responsabilidades:
 *   - Autenticação JWT no handshake (header Authorization ou ?token=)
 *   - Rate limiting por conexão (RATE_LIMIT_PER_SEC msgs/s)
 *   - Backpressure: fecha conexão graciosamente se bufferedAmount > threshold
 *   - Ping/Pong keepalive
 *   - Delega mensagens ao ChannelRouter
 *   - Limpeza de recursos no disconnect
 */
class WebSocketGateway {
  /** @type {import('ws').WebSocketServer|null} */
  #wss = null;

  /** @type {NodeJS.Timeout|null} */
  #pingInterval = null;

  #channelRouter;
  #connectionRegistry;
  #unsubscribeFromRoomUseCase;
  #presenceService;
  #roomManager;
  #realtimeMetrics;

  /**
   * @param {object} deps
   * @param {import('./ChannelRouter').ChannelRouter} deps.channelRouter
   * @param {import('./ConnectionRegistry').ConnectionRegistry} deps.connectionRegistry
   * @param {import('../../../application/realtime/UnsubscribeFromRoomUseCase').UnsubscribeFromRoomUseCase} deps.unsubscribeFromRoomUseCase
   * @param {import('../../../domain/realtime/PresenceService').PresenceService} deps.presenceService
   * @param {import('../../../domain/realtime/RoomManager').RoomManager} deps.roomManager
   * @param {import('../../../infrastructure/realtime/RealtimeMetrics').RealtimeMetrics} deps.realtimeMetrics
   */
  constructor({
    channelRouter,
    connectionRegistry,
    unsubscribeFromRoomUseCase,
    presenceService,
    roomManager,
    realtimeMetrics,
  }) {
    this.#channelRouter             = channelRouter;
    this.#connectionRegistry        = connectionRegistry;
    this.#unsubscribeFromRoomUseCase = unsubscribeFromRoomUseCase;
    this.#presenceService            = presenceService;
    this.#roomManager                = roomManager;
    this.#realtimeMetrics            = realtimeMetrics;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Anexa o WebSocket server ao httpServer existente via upgrade HTTP.
   * Deve ser chamado UMA VEZ após wrapper.listen().
   * @param {import('http').Server} httpServer
   */
  attach(httpServer) {
    this.#wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', async (req, socket, head) => {
      let userId;
      try {
        userId = await this.#authenticateRequest(req);
      } catch (err) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.#wss.handleUpgrade(req, socket, head, (ws) => {
        this.#wss.emit('connection', ws, req, userId);
      });
    });

    this.#wss.on('connection', (ws, _req, userId) => {
      this.#handleConnection(ws, userId);
    });

    this.#startPingInterval();
  }

  /**
   * Encerra o WebSocket server e limpa recursos.
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
      this.#pingInterval = null;
    }
    if (this.#wss) {
      await new Promise((resolve) => this.#wss.close(resolve));
      this.#wss = null;
    }
  }

  // ── Private: autenticação ──────────────────────────────────────

  /**
   * Extrai e verifica o JWT do handshake HTTP.
   * Suporta: header "Authorization: Bearer <token>" ou query "?token=<token>".
   * @param {import('http').IncomingMessage} req
   * @returns {Promise<string>} userId
   * @throws {Error} se token inválido ou ausente
   */
  async #authenticateRequest(req) {
    const token = this.#extractToken(req);
    if (!token) throw new Error('Token ausente');

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (secret) {
      try {
        const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
        if (!payload?.sub) throw new Error('sub ausente no payload');
        return payload.sub;
      } catch (err) {
        // Pode ser RS256 após migração do Supabase; tenta fallback de rede
        if (err.name !== 'JsonWebTokenError' || err.message !== 'invalid algorithm') {
          throw err;
        }
      }
    }

    // Fallback: verifica via Supabase Auth (lento; evitar em prod sem JWT_SECRET)
    return this.#verifyViaSupabase(token);
  }

  /**
   * @param {import('http').IncomingMessage} req
   * @returns {string|null}
   */
  #extractToken(req) {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    const url    = new URL(req.url, 'http://localhost');
    const qToken = url.searchParams.get('token');
    return qToken ?? null;
  }

  /**
   * Verifica token via Supabase Auth como fallback (sem JWT_SECRET local).
   * @param {string} token
   * @returns {Promise<string>} userId
   */
  async #verifyViaSupabase(token) {
    const SupabaseClient = require('../../../utils/SupabaseClient');
    const { data, error } = await SupabaseClient.getInstance().auth.getUser(token);
    if (error || !data?.user?.id) throw new Error('Token inválido');
    return data.user.id;
  }

  // ── Private: lifecycle ─────────────────────────────────────────

  /**
   * Configura handlers de uma nova conexão WebSocket autenticada.
   * @param {import('ws').WebSocket} ws
   * @param {string} userId
   */
  #handleConnection(ws, userId) {
    const connectionId = this.#connectionRegistry.register(ws, userId);
    this.#realtimeMetrics.incrementConnections();

    ws.on('message', async (data) => {
      // Rate limit por conexão
      if (!this.#connectionRegistry.checkRateLimit(connectionId, RATE_LIMIT_PER_SEC)) {
        this.#safeSend(ws, { type: 'error', code: 429, message: 'Rate limit excedido' });
        return;
      }

      // Backpressure: buffer lotado → fecha graciosamente
      if (ws.bufferedAmount > BACKPRESSURE_THRESHOLD_BYTES) {
        ws.close(1008, 'Backpressure: buffer cheio');
        return;
      }

      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        this.#safeSend(ws, { type: 'error', code: 400, message: 'JSON inválido' });
        return;
      }

      if (!message || typeof message !== 'object') {
        this.#safeSend(ws, { type: 'error', code: 400, message: 'Mensagem deve ser um objeto' });
        return;
      }

      await this.#channelRouter.route(
        connectionId,
        message,
        (payload) => this.#safeSend(ws, payload),
      );
    });

    ws.on('close', async () => {
      await this.#handleDisconnect(connectionId, userId);
    });

    ws.on('error', () => {
      // Erro já gera 'close'; apenas evita unhandled exception
    });

    // Marca como vivo para o ping interval
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  }

  /**
   * Limpa todos os recursos da conexão ao desconectar.
   * @param {string} connectionId
   * @param {string} userId
   */
  async #handleDisconnect(connectionId, userId) {
    const entry = this.#connectionRegistry.get(connectionId);
    if (!entry) return;

    // Snapshot para evitar mutação do Set durante iteração
    const channels = [...entry.channels];
    for (const channel of channels) {
      await this.#unsubscribeFromRoomUseCase.execute({ userId, connectionId, channel });
    }

    // Limpeza direta de roomManager e presenceService (idempotente)
    this.#roomManager.leaveAll(connectionId);
    this.#presenceService.untrackAll(userId, connectionId);

    this.#connectionRegistry.unregister(connectionId);
    this.#realtimeMetrics.decrementConnections();
  }

  /**
   * Inicia o interval de ping para detectar conexões zumbi.
   */
  #startPingInterval() {
    this.#pingInterval = setInterval(() => {
      if (!this.#wss) return;
      for (const ws of this.#wss.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, WS_PING_INTERVAL_MS);
  }

  /**
   * Envia payload JSON de forma segura (sem lançar se conexão fechada).
   * @param {import('ws').WebSocket} ws
   * @param {object} payload
   */
  #safeSend(ws, payload) {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignora erros de envio após fechamento
    }
  }
}

module.exports = { WebSocketGateway };
