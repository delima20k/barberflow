'use strict';

class LandingConfig {
  static #VALUES = Object.freeze({
    canonicalUrl: 'https://barberflow.live',
    clientAppUrl: 'https://app.barberflow.live',
    professionalAppUrl: 'https://pro.barberflow.live',
    professionalSignupUrl: 'https://pro.barberflow.live/?start=signup',
    bffUrl: 'https://bff.barberflow.live',
    whatsappUrl: 'https://wa.me/5511911082804?text=Ol%C3%A1%2C%20conheci%20o%20BarberFlow%20pela%20landing%20page%20e%20gostaria%20de%20mais%20informa%C3%A7%C3%B5es.',
    youtubeVideoId: 'DdNwn7O6zL4',
    voucherCampaignEnabled: true,
    voucherApiUrl: '/api/v1/professional-vouchers',
    voucherCampaignSlug: 'primeiro-mes-gratis',
    campaignRulesUrl: './legal/campaign-rules.html',
    privacyPolicyUrl: './legal/privacy.html',
    termsUrl: './legal/terms.html',
    contactEmail: 'contato@barberflow.live',
    feedbackSubmissionEnabled: true,
    feedbackApiUrl: '/api/v1/landing/feedback',
    instagramUrl: '',
    facebookUrl: '',
    socialImageUrl: 'https://barberflow.live/assets/images/logos/LogoNomeBarberFlow.png',
    analyticsEnabled: false,
    analyticsCollectorUrl: '',
    analyticsPublishableKey: '',
    analyticsSessionTimeoutMinutes: 30,
  });

  static get(key) {
    return LandingConfig.#VALUES[key] ?? null;
  }

  static applyLinks(root = document) {
    root.querySelectorAll('[data-config-link]').forEach((link) => {
      const url = LandingConfig.get(link.dataset.configLink);
      if (url) link.href = url;
    });
  }

  static syncMetadata(root = document) {
    const canonicalUrl = `${LandingConfig.get('canonicalUrl')}/`;
    const canonical = root.querySelector('link[rel="canonical"]');
    const openGraphUrl = root.querySelector('meta[property="og:url"]');

    if (canonical) canonical.href = canonicalUrl;
    if (openGraphUrl) openGraphUrl.content = canonicalUrl;
  }
}

globalThis.LandingConfig = LandingConfig;
