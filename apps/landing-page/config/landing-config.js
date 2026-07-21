'use strict';

class LandingConfig {
  static #VALUES = Object.freeze({
    canonicalUrl: 'https://barberflow.live',
    clientAppUrl: 'https://app.barberflow.live',
    professionalAppUrl: 'https://pro.barberflow.live',
    bffUrl: 'https://bff.barberflow.live',
    youtubeVideoId: '',
    voucherCampaignEnabled: true,
    voucherApiUrl: 'https://bff.barberflow.live/api/v1/professional-vouchers',
    voucherCampaignSlug: 'primeiro-mes-gratis',
    campaignRulesUrl: './legal/campaign-rules.html',
    privacyPolicyUrl: './legal/privacy.html',
    termsUrl: './legal/terms.html',
    contactEmail: 'contato@barberflow.live',
    feedbackSubmissionEnabled: true,
    feedbackApiUrl: 'https://bff.barberflow.live/api/v1/landing/feedback',
    instagramUrl: '',
    facebookUrl: '',
    socialImageUrl: 'https://barberflow.live/assets/images/logos/LogoNomeBarberFlow.png',
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
