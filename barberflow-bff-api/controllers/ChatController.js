'use strict';

const BaseController = require('./BaseController');

class ChatController extends BaseController {
  #sendMessageUseCase;
  #listMessagesUseCase;
  #softDeleteMessageUseCase;

  constructor({ sendMessageUseCase, listMessagesUseCase, softDeleteMessageUseCase }) {
    super();
    this.#sendMessageUseCase = sendMessageUseCase;
    this.#listMessagesUseCase = listMessagesUseCase;
    this.#softDeleteMessageUseCase = softDeleteMessageUseCase;
  }

  async send(req, res) {
    await this.handle(res, async () => {
      const result = await this.#sendMessageUseCase.execute({
        conversationId: req.params.conversationId,
        senderId: req.user.id,
        clientMessageId: req.body?.clientMessageId,
        body: req.body?.body,
        attachments: req.body?.attachments,
      });
      if (result.isFail()) throw this._erro(result.getError(), this.#sendStatus(result.getError()));
      this.created(res, result.getValue());
    });
  }

  async list(req, res) {
    await this.handle(res, async () => {
      const result = await this.#listMessagesUseCase.execute({
        conversationId: req.params.conversationId,
        userId: req.user.id,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });
      if (result.isFail()) throw this._erro(result.getError(), 403);
      res.setHeader('Cache-Control', 'private, no-store');
      this.success(res, result.getValue());
    });
  }

  async remove(req, res) {
    await this.handle(res, async () => {
      const result = await this.#softDeleteMessageUseCase.execute({
        messageId: req.params.messageId,
        senderId: req.user.id,
      });
      if (result.isFail()) throw this._erro(result.getError(), 404);
      this.success(res, result.getValue());
    });
  }

  #sendStatus(error) {
    const message = String(error);
    if (message.includes('Rate limit') || message.includes('Flood')) return 429;
    if (message.includes('bloqueada') || message.includes('indisponivel')) return 403;
    return 400;
  }
}

module.exports = ChatController;
