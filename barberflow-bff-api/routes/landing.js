'use strict';

const { Router } = require('express');
const RateLimiterMiddleware = require('../middlewares/rateLimiter');
const { SubmitLandingFeedbackUseCase } = require('../application/landing/use-cases/SubmitLandingFeedbackUseCase');
const { LandingController } = require('../controllers/LandingController');
const { ResendEmailService } = require('../infrastructure/email/ResendEmailService');

class LandingRouteFactory {
  static create({
    emailService = new ResendEmailService(),
    feedbackRateLimiter = RateLimiterMiddleware.landingFeedback,
  } = {}) {
    const router = Router();
    const useCase = new SubmitLandingFeedbackUseCase(emailService);
    const controller = new LandingController(useCase);

    router.post(
      '/feedback',
      feedbackRateLimiter,
      controller.feedback.bind(controller),
    );

    return router;
  }
}

module.exports = { LandingRouteFactory };
