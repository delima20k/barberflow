'use strict';

class LandingApp {
  constructor(root = document) {
    this.root = root;
    this.components = [];
  }

  init() {
    LandingConfig.applyLinks(this.root);
    LandingConfig.syncMetadata(this.root);
    this.setCurrentYear();

    const analytics = new LandingAnalytics(this.root);
    this.components = [
      analytics,
      new MobileNavigation(this.root),
      new LandingCarousel(
        this.root.querySelector('[data-carousel]'),
        LandingFeatureCatalog.all(),
      ),
      new YouTubeVideoController(
        this.root.querySelector('[data-video-player]'),
        LandingConfig.get('youtubeVideoId'),
      ),
      new FaqAccordion(this.root.querySelector('[data-faq]')),
      new VoucherModal(
        this.root,
        new VoucherService({
          enabled: LandingConfig.get('voucherCampaignEnabled'),
          adapter: new VoucherApiAdapter(
            LandingConfig.get('voucherApiUrl'),
          ),
        }),
        { analytics },
      ),
      new FeedbackFormController(
        this.root.querySelector('[data-feedback-form]'),
        new FeedbackService({
          enabled: LandingConfig.get('feedbackSubmissionEnabled'),
          adapter: new FeedbackApiAdapter(
            LandingConfig.get('feedbackApiUrl'),
          ),
        }),
        analytics,
      ),
      new ScrollAnimationController(this.root),
    ];

    this.components.forEach((component) => component.init());
    return this;
  }

  setCurrentYear() {
    const year = String(new Date().getFullYear());
    this.root.querySelectorAll('[data-current-year]').forEach((element) => {
      element.textContent = year;
    });
  }

  destroy() {
    this.components.forEach((component) => component.destroy?.());
    this.components = [];
  }

  static bootstrap() {
    const app = new LandingApp();
    globalThis.BarberFlowLanding = app.init();
  }
}

globalThis.LandingApp = LandingApp;
LandingApp.bootstrap();
