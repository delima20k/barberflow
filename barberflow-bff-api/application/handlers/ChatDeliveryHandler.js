'use strict';

const { JobHandler } = require('../shared/JobHandler');
const { JOB_TYPES } = require('../../config/queues');

class ChatDeliveryHandler extends JobHandler {
  #chatRepository;
  #messageDispatcher;

  constructor({ chatRepository, messageDispatcher }) {
    super();
    if (!chatRepository || !messageDispatcher) {
      throw new TypeError('ChatDeliveryHandler requer chatRepository e messageDispatcher.');
    }
    this.#chatRepository = chatRepository;
    this.#messageDispatcher = messageDispatcher;
  }

  get jobType() { return JOB_TYPES.DELIVER_CHAT_MESSAGE; }

  async handle(job) {
    if (!job?.payload?.messageId) throw new Error('ChatDeliveryHandler: messageId ausente.');
    const context = await this.#chatRepository.findDeliveryContext(job.payload.messageId);
    if (!context) return;
    await this.#messageDispatcher.dispatch(context);
  }
}

module.exports = { ChatDeliveryHandler };
