'use strict';

class LandingAnalyticsEventCatalog {
  static #EVENTS = Object.freeze([
    'landing_view',
    'session_start',
    'session_end',
    'scroll_25',
    'scroll_50',
    'scroll_75',
    'scroll_100',
    'cta_click',
    'voucher_open',
    'email_input_start',
    'email_submit',
    'voucher_generated',
    'video_view',
    'carousel_interaction',
    'faq_open',
    'feedback_submit',
  ]);

  static all() {
    return LandingAnalyticsEventCatalog.#EVENTS;
  }

  static has(eventName) {
    return LandingAnalyticsEventCatalog.#EVENTS.includes(eventName);
  }
}

globalThis.LandingAnalyticsEventCatalog = LandingAnalyticsEventCatalog;
