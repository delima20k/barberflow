'use strict';

class LandingAnalyticsTracker {
  static #ESSENTIAL_EVENTS = new Set([
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

  #config;
  #sessionId = '';
  #visitorId = '';
  #scrollMilestones = new Set();
  #pendingEvents = [];
  #inactivityTimer = null;
  #initialized = false;
  #ended = false;

  constructor(config = {}) {
    this.#config = Object.freeze({
      enabled: config.enabled === true,
      collectorUrl: String(config.collectorUrl ?? ''),
      publishableKey: String(config.publishableKey ?? ''),
      sessionTimeoutMinutes: Number(config.sessionTimeoutMinutes) || 30,
    });
    this.handleScroll = this.handleScroll.bind(this);
    this.handleActivity = this.handleActivity.bind(this);
    this.handlePageHide = this.handlePageHide.bind(this);
    this.flush = this.flush.bind(this);
  }

  init() {
    if (!this.#isReady() || this.#initialized) return this;
    this.#initialized = true;
    this.#sessionId = this.#identity(sessionStorage, 'barberflow_analytics_session');
    this.#visitorId = this.#identity(localStorage, 'barberflow_analytics_visitor');
    this.#pendingEvents = this.#readQueue();
    globalThis.addEventListener('scroll', this.handleScroll, { passive: true });
    globalThis.addEventListener('pointerdown', this.handleActivity, { passive: true });
    globalThis.addEventListener('pagehide', this.handlePageHide);
    globalThis.addEventListener('online', this.flush);
    this.flush();
    this.#scheduleInactivity();
    this.track('session_started');
    return this;
  }

  track(eventName, metadata = {}) {
    if (
      !this.#isReady()
      || !LandingAnalyticsTracker.#ESSENTIAL_EVENTS.has(eventName)
      || (eventName === 'session_ended' && this.#ended)
    ) {
      return false;
    }

    const payload = this.#payload(eventName, metadata);
    const queuedPayload = { ...payload };
    delete queuedPayload.email;
    this.#pendingEvents.push(queuedPayload);
    this.#pendingEvents = this.#pendingEvents.slice(-200);
    this.#writeQueue();
    this.#send(payload, eventName === 'session_ended');
    if (eventName === 'session_ended') this.#ended = true;
    else this.#scheduleInactivity();
    return true;
  }

  handleScroll() {
    const documentHeight = Math.max(
      document.documentElement.scrollHeight - globalThis.innerHeight,
      1,
    );
    const percentage = Math.min(100, Math.round((globalThis.scrollY / documentHeight) * 100));
    [25, 50, 75, 100].forEach((milestone) => {
      if (percentage < milestone || this.#scrollMilestones.has(milestone)) return;
      this.#scrollMilestones.add(milestone);
      this.track(`scroll_${milestone}`, { scrollPercentage: milestone });
    });
  }

  handleActivity() {
    this.#scheduleInactivity();
  }

  handlePageHide() {
    this.track('session_ended');
  }

  destroy() {
    globalThis.removeEventListener('scroll', this.handleScroll);
    globalThis.removeEventListener('pointerdown', this.handleActivity);
    globalThis.removeEventListener('pagehide', this.handlePageHide);
    globalThis.removeEventListener('online', this.flush);
    globalThis.clearTimeout(this.#inactivityTimer);
    this.#initialized = false;
  }

  async flush() {
    if (!this.#isReady() || !navigator.onLine || this.#pendingEvents.length === 0) return;
    for (const payload of [...this.#pendingEvents]) {
      const sent = await this.#send(payload);
      if (!sent) break;
    }
  }

  #payload(eventName, metadata) {
    const url = new URL(globalThis.location.href);
    return {
      idempotency_key: crypto.randomUUID(),
      session_id: this.#sessionId,
      visitor_id: this.#visitorId,
      event_name: eventName,
      page: `${url.origin}${url.pathname}`,
      button_name: String(metadata.buttonName ?? '').slice(0, 120),
      campaign: url.searchParams.get('utm_campaign') ?? '',
      source: url.searchParams.get('utm_source') ?? (document.referrer ? 'referral' : 'direct'),
      medium: url.searchParams.get('utm_medium') ?? '',
      device: this.#device(),
      browser: navigator.userAgentData?.brands?.[0]?.brand ?? '',
      os: navigator.userAgentData?.platform ?? navigator.platform ?? '',
      screen_width: globalThis.screen.width,
      screen_height: globalThis.screen.height,
      language: navigator.language,
      referrer: document.referrer.slice(0, 500),
      scroll_percentage: Number(metadata.scrollPercentage) || null,
      email: eventName === 'email_submitted' ? String(metadata.email ?? '').trim() : undefined,
      voucher_opened: eventName === 'voucher_modal_opened',
      voucher_generated: eventName === 'voucher_generated',
      created_at: new Date().toISOString(),
    };
  }

  async #send(payload, preferBeacon = false) {
    const body = JSON.stringify(payload);
    if (preferBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.#config.collectorUrl, new Blob([body], {
        type: 'application/json',
      }));
      return true;
    }
    try {
      const response = await fetch(this.#config.collectorUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.#config.publishableKey,
          authorization: `Bearer ${this.#config.publishableKey}`,
        },
        body,
        keepalive: true,
        credentials: 'omit',
      });
      if (!response.ok) return false;
      this.#pendingEvents = this.#pendingEvents.filter(
        (event) => event.idempotency_key !== payload.idempotency_key,
      );
      this.#writeQueue();
      return true;
    } catch {
      return false;
    }
  }

  #scheduleInactivity() {
    globalThis.clearTimeout(this.#inactivityTimer);
    this.#inactivityTimer = globalThis.setTimeout(
      () => this.track('session_ended'),
      this.#config.sessionTimeoutMinutes * 60 * 1000,
    );
  }

  #isReady() {
    return (
      this.#config.enabled
      && /^https:\/\//.test(this.#config.collectorUrl)
      && this.#config.publishableKey.length > 20
    );
  }

  #identity(storage, key) {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    storage.setItem(key, value);
    return value;
  }

  #readQueue() {
    try {
      const value = JSON.parse(localStorage.getItem('barberflow_analytics_queue') ?? '[]');
      return Array.isArray(value) ? value.slice(-200) : [];
    } catch {
      return [];
    }
  }

  #writeQueue() {
    localStorage.setItem(
      'barberflow_analytics_queue',
      JSON.stringify(this.#pendingEvents),
    );
  }

  #device() {
    if (matchMedia('(max-width: 600px)').matches) return 'mobile';
    if (matchMedia('(max-width: 1024px)').matches) return 'tablet';
    return 'desktop';
  }
}

globalThis.LandingAnalyticsTracker = LandingAnalyticsTracker;
