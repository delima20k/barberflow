'use strict';

const BaseController = require('./BaseController');

class LandingController extends BaseController {
  #submitFeedback;

  constructor(submitFeedback) {
    super();
    this.#submitFeedback = submitFeedback;
  }

  async feedback(req, res) {
    await this.handle(res, async () => {
      const dados = await this.#submitFeedback.execute(req.body ?? {});
      this.success(res, dados);
    });
  }
}

module.exports = { LandingController };
