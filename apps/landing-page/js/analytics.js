'use strict';

class LandingAnalytics {
  static #EVENTS = new Set([
    'landing_view',
    'hero_cta_click',
    'feature_carousel_interaction',
    'youtube_video_play',
    'voucher_modal_open',
    'voucher_form_start',
    'voucher_generated',
    'app_access_click',
    'feedback_submitted',
    'faq_open',
  ]);

  #adapter;
  #startedEvents;

  constructor(root = document, adapter = null) {
    this.root = root;
    this.#adapter = adapter;
    this.#startedEvents = new Set();
    this.handleClick = this.handleClick.bind(this);
    this.handleFocusIn = this.handleFocusIn.bind(this);
  }

  init() {
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('focusin', this.handleFocusIn);
    this.track('landing_view');
    return this;
  }

  handleClick(event) {
    const trigger = event.target.closest('[data-analytics-event]');
    if (trigger) this.track(trigger.dataset.analyticsEvent);
  }

  handleFocusIn(event) {
    const trigger = event.target.closest('[data-analytics-start]');
    const eventName = trigger?.dataset.analyticsStart;
    if (!eventName || this.#startedEvents.has(eventName)) return;

    this.#startedEvents.add(eventName);
    this.track(eventName);
  }

  track(eventName) {
    if (!LandingAnalytics.#EVENTS.has(eventName)) return false;
    this.#adapter?.track?.(eventName);
    return true;
  }

  destroy() {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('focusin', this.handleFocusIn);
    this.#startedEvents.clear();
  }
}

globalThis.LandingAnalytics = LandingAnalytics;
