'use strict';

const BaseController = require('./BaseController');
const RequestDiagnostics = require('../observability/RequestDiagnostics');

class ChatController extends BaseController {
  #sendMessageUseCase;
  #listMessagesUseCase;
  #softDeleteMessageUseCase;
  #listConversationsUseCase;
  #getOrCreateConversationUseCase;
  #markConversationReadUseCase;
  #registerUserKeyUseCase;
  #getUserKeyUseCase;

  constructor({ sendMessageUseCase, listMessagesUseCase, softDeleteMessageUseCase,
                listConversationsUseCase, getOrCreateConversationUseCase,
                markConversationReadUseCase, registerUserKeyUseCase = null,
                getUserKeyUseCase = null }) {
    super();
    this.#sendMessageUseCase             = sendMessageUseCase;
    this.#listMessagesUseCase            = listMessagesUseCase;
    this.#softDeleteMessageUseCase       = softDeleteMessageUseCase;
    this.#listConversationsUseCase       = listConversationsUseCase;
    this.#getOrCreateConversationUseCase = getOrCreateConversationUseCase;
    this.#markConversationReadUseCase    = markConversationReadUseCase;
    this.#registerUserKeyUseCase         = registerUserKeyUseCase;
    this.#getUserKeyUseCase              = getUserKeyUseCase;
  }

  async send(req, res) {
    await this.handle(res, async () => {
      const diagnostics = RequestDiagnostics.current(req);
      const { body, clientMessageId, attachments, encrypted_payload, e2e_key_version } = req.body ?? {};

      // Rejeita mensagem nova com body em texto puro (sem encrypted_payload)
      if (!encrypted_payload && body?.trim()) {
        throw this._erro('Mensagem nova requer encrypted_payload. Envio em texto puro bloqueado.', 400);
      }

      // Valida estrutura mínima do encrypted_payload
      if (encrypted_payload !== undefined && encrypted_payload !== null) {
        const { v, alg, iv, ct } = encrypted_payload;
        if (!v || !alg || !iv || !ct) {
          throw this._erro('encrypted_payload invalido: requer v, alg, iv, ct.', 400);
        }
      }

      const result = await this.#sendMessageUseCase.execute({
        conversationId:   req.params.conversationId,
        senderId:         req.user.id,
        clientMessageId,
        body:             null, // body sempre null para mensagens novas; legado é somente leitura
        encryptedPayload: encrypted_payload ?? null,
        e2eKeyVersion:    e2e_key_version ?? null,
        attachments,
      }, { diagnostics });
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

  async listConversations(req, res) {
    await this.handle(res, async () => {
      const result = await this.#listConversationsUseCase.execute({ userId: req.user.id });
      if (!result.ok) throw this._erro(result.error, 400);
      res.setHeader('Cache-Control', 'private, no-store');
      this.success(res, result.value);
    });
  }

  async getOrCreate(req, res) {
    await this.handle(res, async () => {
      const { targetUserId } = req.body ?? {};
      if (!targetUserId) throw this._erro('targetUserId obrigatorio.', 400);
      const result = await this.#getOrCreateConversationUseCase.execute({
        requesterId: req.user.id,
        targetUserId,
      });
      if (!result.ok) throw this._erro(result.error, 400);
      this.success(res, result.value);
    });
  }

  async markRead(req, res) {
    await this.handle(res, async () => {
      const result = await this.#markConversationReadUseCase.execute({
        conversationId: req.params.conversationId,
        userId: req.user.id,
      });
      if (!result.ok) throw this._erro(result.error, 403);
      res.setHeader('Cache-Control', 'private, no-store');
      this.success(res, result.value);
    });
  }

  /** POST /me/public-key — registra ou atualiza a chave pública ECDH do usuário autenticado. */
  async registerPublicKey(req, res) {
    await this.handle(res, async () => {
      if (!this.#registerUserKeyUseCase) throw this._erro('Funcionalidade indisponivel.', 503);
      const { publicKey } = req.body ?? {};
      if (!publicKey) throw this._erro('publicKey obrigatorio.', 400);
      const result = await this.#registerUserKeyUseCase.execute({ userId: req.user.id, publicKey });
      if (result.isFail()) throw this._erro(result.getError(), 400);
      this.success(res, result.getValue());
    });
  }

  /** GET /users/:userId/public-key — retorna a chave pública ECDH de outro usuário. */
  async getPublicKey(req, res) {
    await this.handle(res, async () => {
      if (!this.#getUserKeyUseCase) throw this._erro('Funcionalidade indisponivel.', 503);
      const result = await this.#getUserKeyUseCase.execute({ targetUserId: req.params.userId });
      if (result.isFail()) throw this._erro(result.getError(), 404);
      // Chave pública é dado público; cache curto é seguro
      res.setHeader('Cache-Control', 'public, max-age=300');
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
