'use strict';

class NotificationFeedbackHandler {
  #repository;
  #retryQueue;

  constructor({ notificationRepository, retryQueue = null }) {
    if (!notificationRepository) throw new TypeError('NotificationFeedbackHandler.notificationRepository obrigatorio');
    this.#repository = notificationRepository;
    this.#retryQueue = retryQueue;
  }

  async handle(feedback) {
    if (!feedback?.endpoint) throw new Error('Feedback endpoint obrigatorio');
    if (feedback.permanent === true || ['bounce', 'invalid_endpoint', 'unsubscribed'].includes(feedback.type)) {
      await this.#repository.suppressEndpoint(feedback.endpoint, feedback.type ?? 'invalid_endpoint');
      return { suppressed: true, retry: false };
    }
    if (feedback.retryable === true && this.#retryQueue?.enqueue) {
      await this.#retryQueue.enqueue(feedback);
      return { suppressed: false, retry: true };
    }
    return { suppressed: false, retry: false };
  }
}

module.exports = { NotificationFeedbackHandler };
