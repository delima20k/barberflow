'use strict';

const BaseController = require('./BaseController');

class FeedController extends BaseController {
  #getFeedUseCase;
  #publishFeedItemUseCase;
  #changeFeedRelationshipUseCase;

  constructor({ getFeedUseCase, publishFeedItemUseCase, changeFeedRelationshipUseCase }) {
    super();
    this.#getFeedUseCase = getFeedUseCase;
    this.#publishFeedItemUseCase = publishFeedItemUseCase;
    this.#changeFeedRelationshipUseCase = changeFeedRelationshipUseCase;
  }

  async timeline(req, res) {
    await this.handle(res, async () => {
      const result = await this.#getFeedUseCase.execute({
        userId: req.user.id,
        cursor: req.query.cursor,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        strategy: req.query.strategy ?? 'personalized',
      });
      if (result.isFail()) throw this._erro(result.getError(), 400);
      res.setHeader('Cache-Control', 'private, no-store');
      this.success(res, result.getValue());
    });
  }

  async publish(req, res) {
    await this.handle(res, async () => {
      const result = await this.#publishFeedItemUseCase.execute({
        authorId: req.user.id,
        sourceType: req.body?.sourceType,
        sourceId: req.body?.sourceId,
        contentHash: req.body?.contentHash,
      });
      if (result.isFail()) throw this._erro(result.getError(), this.#publishStatus(result.getError()));
      this.created(res, result.getValue());
    });
  }

  async block(req, res) {
    await this.#relationship(res, () => this.#changeFeedRelationshipUseCase.block({
      userId: req.user.id,
      authorId: req.params.authorId,
    }));
  }

  async unfollow(req, res) {
    await this.#relationship(res, () => this.#changeFeedRelationshipUseCase.unfollow({
      userId: req.user.id,
      authorId: req.params.authorId,
    }));
  }

  async #relationship(res, execute) {
    await this.handle(res, async () => {
      const result = await execute();
      if (result.isFail()) throw this._erro(result.getError(), 400);
      this.noContent(res);
    });
  }

  #publishStatus(error) {
    if (String(error).includes('Rate limit')) return 429;
    if (String(error).includes('duplicado')) return 409;
    return 400;
  }
}

module.exports = FeedController;
