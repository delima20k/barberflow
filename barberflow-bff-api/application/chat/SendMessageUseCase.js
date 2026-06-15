'use strict';

const { Result } = require('../../domain/shared/Result');
const { Message } = require('../../domain/chat/entities/Message');
const { ConversationAccessPolicy } = require('../../domain/chat/policies/ConversationAccessPolicy');
const { ChatPolicyCatalog } = require('../../config/chat');
const { QUEUES, JOB_TYPES } = require('../../config/queues');

class SendMessageUseCase {
  #chatRepository;
  #outboxRepository;
  #blockPolicy;
  #messageRealtimePublisher;
  #policy;
  #clock;
  #logger;
  #realtimeTimeoutMs;

  constructor({
    chatRepository,
    outboxRepository,
    blockPolicy,
    messageRealtimePublisher = null,
    policy = new ChatPolicyCatalog(),
    clock = { now: () => new Date() },
    logger = console,
    realtimeTimeoutMs = Number(process.env.CHAT_REALTIME_IMMEDIATE_TIMEOUT_MS ?? 750),
  }) {
    if (!chatRepository || !outboxRepository || !blockPolicy) {
      throw new TypeError('SendMessageUseCase requer repository, outbox e blockPolicy.');
    }
    this.#chatRepository = chatRepository;
    this.#outboxRepository = outboxRepository;
    this.#blockPolicy = blockPolicy;
    this.#messageRealtimePublisher = messageRealtimePublisher;
    this.#policy = policy;
    this.#clock = clock;
    this.#logger = logger;
    this.#realtimeTimeoutMs = Math.max(1, Number(realtimeTimeoutMs) || 750);
  }

  async execute(command = {}, opts = {}) {
    const metrics = SendMessageUseCase.#metrics(opts.diagnostics ?? null);
    try {
      const previous = await this.#measure(metrics, 'findByClientMessageId', () => (
        this.#chatRepository.findByClientMessageId(command.senderId, command.clientMessageId)
      ));
      if (previous) return Result.ok(previous.toJSON());

      const conversation = await this.#measure(metrics, 'findConversation', () => (
        this.#chatRepository.findConversation(command.conversationId)
      ));
      const participantsCheck = this.#measureSync(metrics, 'participantsChecks', () => {
        if (!ConversationAccessPolicy.canSend(conversation, command.senderId)) {
          return { ok: false, error: 'Conversa indisponivel para o remetente.' };
        }
        const recipients = conversation.recipientIds(command.senderId);
        if (recipients.length === 0) return { ok: false, error: 'Conversa sem destinatario ativo.' };
        return { ok: true, recipients };
      });
      if (!participantsCheck.ok) return Result.fail(participantsCheck.error);

      const { recipients } = participantsCheck;
      const checksError = await this.#measure(metrics, 'rateLimitBloqueio', async () => {
        if (!(await this.#canExchangeWithAll(command.senderId, recipients))) return 'Mensagem bloqueada.';
        if (await this.#isRateLimited(command, recipients)) return 'Rate limit do chat excedido.';
        if (await this.#isFlood(command)) return 'Flood de mensagens detectado.';
        return null;
      });
      if (checksError) return Result.fail(checksError);

      const messageResult = Message.create({
        conversationId:   command.conversationId,
        senderId:         command.senderId,
        clientMessageId:  command.clientMessageId,
        body:             command.body ?? '',
        encryptedPayload: command.encryptedPayload ?? null,
        e2eKeyVersion:    command.e2eKeyVersion ?? null,
        attachments:      command.attachments ?? [],
        createdAt:        this.#clock.now(),
      });
      if (messageResult.isFail()) return messageResult;

      const saved = await this.#measure(metrics, 'saveMessage', () => (
        this.#chatRepository.saveMessage(messageResult.getValue())
      ));

      try {
        await this.#measure(metrics, 'outboxSave', () => this.#outboxRepository.save({
          eventName: JOB_TYPES.DELIVER_CHAT_MESSAGE,
          queue: QUEUES.NOTIFICATIONS,
          payload: { messageId: saved.id },
        }));
      } catch (outboxErr) {
        this.#warn('outbox.save falhou (best-effort)', outboxErr);
      }

      this.#publishRealtime(saved, recipients, metrics);
      return Result.ok(saved.toJSON());
    } finally {
      metrics.totalHandler = SendMessageUseCase.#elapsed(metrics.startedAt);
      metrics.diagnostics?.record('total_handler', metrics.totalHandler);
      this.#info('chat.send timings', SendMessageUseCase.#sanitizeMetrics(metrics));
    }
  }

  #publishRealtime(saved, recipients, metrics) {
    if (!this.#messageRealtimePublisher) return;
    if (!saved || !Array.isArray(recipients) || recipients.length === 0) return;
    metrics.realtimePublish = 'scheduled';
    metrics.diagnostics?.mark('realtimePublish', 'scheduled');
    Promise.resolve()
      .then(() => this.#withTimeout(
        this.#messageRealtimePublisher.publish({
          message: saved,
          recipients,
          sender: null,
        }),
        this.#realtimeTimeoutMs,
      ))
      .catch(realtimeErr => this.#warn('realtime imediato falhou (best-effort)', realtimeErr));
  }

  async #canExchangeWithAll(senderId, recipients) {
    const decisions = await Promise.all(recipients.map(recipientId => this.#blockPolicy.canExchange(senderId, recipientId)));
    return decisions.every(Boolean);
  }

  async #isRateLimited(command, recipients) {
    const total = await this.#chatRepository.countRecentPairMessages(
      command.senderId,
      recipients,
      this.#policy.pairRateWindowSeconds,
    );
    return total >= this.#policy.pairRateLimit;
  }

  async #isFlood(command) {
    if (!command.body?.trim()) return false;
    const total = await this.#chatRepository.countRecentDuplicateBodies(
      command.conversationId,
      command.senderId,
      command.body,
      this.#policy.floodWindowSeconds,
    );
    return total >= this.#policy.duplicateFloodLimit;
  }

  async #measure(metrics, name, fn) {
    const start = SendMessageUseCase.#now();
    try {
      return await fn();
    } finally {
      metrics[name] = SendMessageUseCase.#elapsed(start);
      metrics.diagnostics?.record(name, metrics[name]);
    }
  }

  #measureSync(metrics, name, fn) {
    const start = SendMessageUseCase.#now();
    try {
      return fn();
    } finally {
      metrics[name] = SendMessageUseCase.#elapsed(start);
      metrics.diagnostics?.record(name, metrics[name]);
    }
  }

  async #withTimeout(promise, timeoutMs) {
    let timer = null;
    const operation = Promise.resolve(promise);
    operation.catch(() => null);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`realtime publish timeout after ${timeoutMs}ms`);
        err.code = 'REALTIME_PUBLISH_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  #warn(message, err) {
    this.#logger?.warn?.(`[SendMessageUseCase] ${message}:`, err?.message || String(err));
  }

  #info(message, metrics) {
    this.#logger?.info?.(`[SendMessageUseCase] ${message}`, metrics);
  }

  static #metrics(diagnostics = null) {
    return { startedAt: SendMessageUseCase.#now(), diagnostics };
  }

  static #now() {
    return Number(globalThis.performance?.now?.() ?? Date.now());
  }

  static #elapsed(start) {
    return Number((SendMessageUseCase.#now() - start).toFixed(2));
  }

  static #sanitizeMetrics(metrics) {
    const { startedAt: _startedAt, diagnostics: _diagnostics, ...safe } = metrics;
    return safe;
  }
}

module.exports = { SendMessageUseCase };
