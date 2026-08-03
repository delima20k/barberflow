'use strict';

class LandingAnalyticsTracker {
  static #QUEUE_KEY = 'barberflow_analytics_queue';
  static #SESSION_KEY = 'barberflow_analytics_session';
  static #VISITOR_KEY = 'barberflow_analytics_visitor';

  #config;
  #sessionId = '';
  #visitorId = '';
  #scrollMilestones = new Set();
  #pendingEvents = [];
  #volatileEvents = [];
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
    this.#visitorId = this.#identity(localStorage, LandingAnalyticsTracker.#VISITOR_KEY);
    this.#pendingEvents = this.#readQueue();
    this.#restoreOrStartSession();
    globalThis.addEventListener('scroll', this.handleScroll, { passive: true });
    globalThis.addEventListener('pointerdown', this.handleActivity, { passive: true });
    globalThis.addEventListener('pagehide', this.handlePageHide);
    globalThis.addEventListener('online', this.flush);
    this.flush();
    this.track('session_start');
    return this;
  }

  track(eventName, metadata = {}) {
    if (!this.#isReady() || !LandingAnalyticsEventCatalog.has(eventName)) return false;
    if (eventName === 'session_end' && this.#ended) return false;
    if (this.#ended && eventName !== 'session_end') this.#startNewSession();

    const payload = this.#payload(eventName, metadata);
    const queuedPayload = { ...payload };
    delete queuedPayload.email;

    if (eventName === 'email_submit') {
      this.#volatileEvents.push(payload);
    } else {
      this.#pendingEvents.push(queuedPayload);
      this.#pendingEvents = this.#pendingEvents.slice(-200);
      this.#writeQueue();
    }

    this.#send(payload, eventName === 'session_end');
    if (eventName === 'session_end') {
      this.#ended = true;
      this.#writeSession(true);
    } else {
      this.#touchSession();
      this.#scheduleInactivity();
    }
    return true;
  }

  handleScroll() {
    this.#ensureActiveSession();
    const documentHeight = Math.max(
      document.documentElement.scrollHeight - globalThis.innerHeight,
      1,
    );
    const percentage = Math.min(100, Math.round((globalThis.scrollY / documentHeight) * 100));
    [25, 50, 75, 100].forEach((milestone) => {
      if (percentage < milestone || this.#scrollMilestones.has(milestone)) return;
      this.#scrollMilestones.add(milestone);
      this.track(`scroll_${milestone}`, { scrollDepth: milestone });
    });
  }

  handleActivity() {
    this.#ensureActiveSession();
    this.#touchSession();
    this.#scheduleInactivity();
  }

  handlePageHide() {
    this.track('session_end', { sessionEndReason: 'pagehide' });
  }

  destroy() {
    if (this.#initialized && !this.#ended) {
      this.track('session_end', { sessionEndReason: 'destroy' });
    }
    globalThis.removeEventListener('scroll', this.handleScroll);
    globalThis.removeEventListener('pointerdown', this.handleActivity);
    globalThis.removeEventListener('pagehide', this.handlePageHide);
    globalThis.removeEventListener('online', this.flush);
    globalThis.clearTimeout(this.#inactivityTimer);
    this.#initialized = false;
  }

  async flush() {
    if (!this.#isReady() || !navigator.onLine) return;
    for (const payload of [...this.#pendingEvents, ...this.#volatileEvents]) {
      const sent = await this.#send(payload);
      if (!sent) break;
    }
  }

  #payload(eventName, metadata) {
    const locationUrl = new URL(globalThis.location.href);
    const canonical = new URL(this.#config.canonicalUrl);
    const payload = {
      event_id: crypto.randomUUID(),
      event_name: eventName,
      session_id: this.#sessionId,
      anonymous_user_id: this.#visitorId,
      page_url: `${canonical.origin}${locationUrl.pathname}`,
      page_path: locationUrl.pathname,
      referrer: document.referrer.slice(0, 500),
      utm_source: locationUrl.searchParams.get('utm_source') ?? '',
      utm_medium: locationUrl.searchParams.get('utm_medium') ?? '',
      utm_campaign: locationUrl.searchParams.get('utm_campaign') ?? '',
      utm_content: locationUrl.searchParams.get('utm_content') ?? '',
      utm_term: locationUrl.searchParams.get('utm_term') ?? '',
    };

    if (metadata.ctaId) payload.cta_id = String(metadata.ctaId).slice(0, 80);
    if (metadata.featureId) payload.feature_id = String(metadata.featureId).slice(0, 80);
    if (metadata.faqId) payload.faq_id = String(metadata.faqId).slice(0, 80);
    if (metadata.scrollDepth) payload.scroll_depth = Number(metadata.scrollDepth);
    if (metadata.voucherId) payload.voucher_id = String(metadata.voucherId);
    if (eventName === 'email_submit') payload.email = String(metadata.email ?? '').trim();
    if (metadata.sessionEndReason) {
      payload.session_end_reason = String(metadata.sessionEndReason).slice(0, 32);
    }
    return payload;
  }

  async #send(payload, preferBeacon = false) {
    const body = JSON.stringify(payload);
    if (preferBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(this.#config.collectorUrl, new Blob([body], {
        type: 'text/plain',
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
        (event) => event.event_id !== payload.event_id,
      );
      this.#volatileEvents = this.#volatileEvents.filter(
        (event) => event.event_id !== payload.event_id,
      );
      this.#writeQueue();
      return true;
    } catch {
      return false;
    }
  }

  #restoreOrStartSession() {
    const timeout = this.#config.sessionTimeoutMinutes * 60 * 1000;
    try {
      const stored = JSON.parse(sessionStorage.getItem(LandingAnalyticsTracker.#SESSION_KEY));
      if (stored?.id && !stored.ended && Date.now() - Number(stored.lastActivity) < timeout) {
        this.#sessionId = stored.id;
        this.#ended = false;
        this.#scheduleInactivity();
        return;
      }
    } catch {
      // Invalid local state is replaced by a fresh anonymous session.
    }
    this.#startNewSession(false);
  }

  #ensureActiveSession() {
    if (this.#ended) this.#startNewSession();
  }

  #startNewSession(trackStart = true) {
    this.#sessionId = crypto.randomUUID();
    this.#ended = false;
    this.#scrollMilestones.clear();
    this.#writeSession(false);
    this.#scheduleInactivity();
    if (trackStart) this.track('session_start');
  }

  #touchSession() {
    if (!this.#sessionId) return;
    this.#writeSession(false);
  }

  #writeSession(ended) {
    sessionStorage.setItem(
      LandingAnalyticsTracker.#SESSION_KEY,
      JSON.stringify({ id: this.#sessionId, lastActivity: Date.now(), ended }),
    );
  }

  #scheduleInactivity() {
    globalThis.clearTimeout(this.#inactivityTimer);
    this.#inactivityTimer = globalThis.setTimeout(() => {
      this.track('session_end', { sessionEndReason: 'inactivity' });
    }, this.#config.sessionTimeoutMinutes * 60 * 1000);
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
      const value = JSON.parse(localStorage.getItem(LandingAnalyticsTracker.#QUEUE_KEY) ?? '[]');
      return Array.isArray(value) ? value.slice(-200) : [];
    } catch {
      return [];
    }
  }

  #writeQueue() {
    localStorage.setItem(
      LandingAnalyticsTracker.#QUEUE_KEY,
      JSON.stringify(this.#pendingEvents),
    );
  }
}

globalThis.LandingAnalyticsTracker = LandingAnalyticsTracker;
