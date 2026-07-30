'use strict';

class LandingAnalytics {
  static #EVENTS = new Set([
    'landing_view',
    'cta_click',
    'voucher_modal_opened',
    'email_input_started',
    'email_submitted',
    'voucher_generated',
    'scroll_25',
    'scroll_50',
    'scroll_75',
    'scroll_100',
    'session_started',
    'session_ended',
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
    this.#adapter?.init?.();
    this.track('landing_view');
    return this;
  }

  handleClick(event) {
    const trigger = event.target.closest('[data-analytics-event]');
    if (trigger) {
      this.track(trigger.dataset.analyticsEvent, {
        buttonName: trigger.textContent?.trim().slice(0, 120) ?? '',
      });
    }
  }

  handleFocusIn(event) {
    const trigger = event.target.closest('[data-analytics-start]');
    const eventName = trigger?.dataset.analyticsStart;
    if (!eventName || this.#startedEvents.has(eventName)) return;

    this.#startedEvents.add(eventName);
    this.track(eventName);
  }

  track(eventName, payload = {}) {
    if (!LandingAnalytics.#EVENTS.has(eventName)) return false;
    this.#adapter?.track?.(eventName, payload);
    return true;
  }

  destroy() {
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('focusin', this.handleFocusIn);
    this.#adapter?.destroy?.();
    this.#startedEvents.clear();
  }
}

globalThis.LandingAnalytics = LandingAnalytics;
