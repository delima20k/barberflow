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

  constructor({
    chatRepository,
    outboxRepository,
    blockPolicy,
    messageRealtimePublisher = null,
    policy = new ChatPolicyCatalog(),
    clock = { now: () => new Date() },
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
  }

  async execute(command = {}) {
    const previous = await this.#chatRepository.findByClientMessageId(command.senderId, command.clientMessageId);
    if (previous) return Result.ok(previous.toJSON());

    const conversation = await this.#chatRepository.findConversation(command.conversationId);
    if (!ConversationAccessPolicy.canSend(conversation, command.senderId)) {
      return Result.fail('Conversa indisponivel para o remetente.');
    }
    const recipients = conversation.recipientIds(command.senderId);
    if (recipients.length === 0) return Result.fail('Conversa sem destinatario ativo.');
    if (!(await this.#canExchangeWithAll(command.senderId, recipients))) {
      return Result.fail('Mensagem bloqueada.');
    }
    if (await this.#isRateLimited(command, recipients)) return Result.fail('Rate limit do chat excedido.');
    if (await this.#isFlood(command)) return Result.fail('Flood de mensagens detectado.');

    const messageResult = Message.create({
      ...command,
      createdAt: this.#clock.now(),
    });
    if (messageResult.isFail()) return messageResult;
    const saved = await this.#chatRepository.saveMessage(messageResult.getValue());
    // Outbox é best-effort: falha não deve quebrar o envio da mensagem.
    // Se a tabela domain_events_outbox ainda não existe no ambiente, loga e continua.
    try {
      await this.#outboxRepository.save({
        eventName: JOB_TYPES.DELIVER_CHAT_MESSAGE,
        queue: QUEUES.NOTIFICATIONS,
        payload: { messageId: saved.id },
      });
    } catch (outboxErr) {
      /* eslint-disable no-console */
      console.warn('[SendMessageUseCase] outbox.save falhou (best-effort):', outboxErr?.message);
    }
    await this.#publishRealtime(saved);
    return Result.ok(saved.toJSON());
  }

  async #publishRealtime(saved) {
    if (!this.#messageRealtimePublisher) return;
    try {
      const context = await this.#chatRepository.findDeliveryContext(saved.id);
      if (!context?.message || !context?.recipients?.length) return;
      await this.#messageRealtimePublisher.publish({
        message: context.message,
        recipients: context.recipients,
        sender: context.sender ?? null,
      });
    } catch (realtimeErr) {
      /* eslint-disable no-console */
      console.warn('[SendMessageUseCase] realtime imediato falhou (best-effort):', realtimeErr?.message);
    }
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
}

module.exports = { SendMessageUseCase };
