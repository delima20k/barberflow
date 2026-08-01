export class AnalyticsEventValidator {
  static #EVENTS = new Set([
    'landing_view', 'cta_click', 'voucher_modal_opened', 'email_input_started',
    'email_submitted', 'voucher_generated', 'scroll_25', 'scroll_50',
    'scroll_75', 'scroll_100', 'session_started', 'session_ended',
  ]);

  static #FIELDS = new Set([
    'idempotency_key', 'session_id', 'visitor_id', 'event_name', 'page',
    'button_name', 'campaign', 'source', 'medium', 'device', 'browser', 'os',
    'screen_width', 'screen_height', 'language', 'referrer',
    'scroll_percentage', 'email', 'voucher_opened', 'voucher_generated',
    'created_at',
  ]);

  static #TEXT_LIMITS = Object.freeze({
    idempotency_key: 160,
    session_id: 128,
    visitor_id: 128,
    event_name: 64,
    page: 300,
    button_name: 120,
    campaign: 120,
    source: 80,
    medium: 80,
    device: 40,
    browser: 80,
    os: 80,
    language: 32,
    referrer: 500,
  });

  validate(input) {
    if (!this.#isPlainObject(input)) return this.#invalid('invalid_payload');
    const unknown = Object.keys(input).find((key) => !AnalyticsEventValidator.#FIELDS.has(key));
    if (unknown) return this.#invalid('unknown_field');
    if (!AnalyticsEventValidator.#EVENTS.has(input.event_name)) {
      return this.#invalid('invalid_event');
    }
    if (!input.idempotency_key || !input.session_id || !input.visitor_id) {
      return this.#invalid('missing_identity');
    }

    for (const [field, limit] of Object.entries(AnalyticsEventValidator.#TEXT_LIMITS)) {
      const value = input[field];
      if (value !== undefined && (typeof value !== 'string' || value.length > limit)) {
        return this.#invalid(`invalid_${field}`);
      }
    }

    if (input.email !== undefined && input.event_name !== 'email_submitted') {
      return this.#invalid('email_not_allowed');
    }
    if (input.email !== undefined && !this.#email(input.email)) {
      return this.#invalid('invalid_email');
    }
    if (input.scroll_percentage !== undefined
      && ![25, 50, 75, 100].includes(input.scroll_percentage)) {
      return this.#invalid('invalid_scroll_percentage');
    }
    for (const field of ['screen_width', 'screen_height']) {
      const value = input[field];
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 100000)) {
        return this.#invalid(`invalid_${field}`);
      }
    }
    for (const field of ['voucher_opened', 'voucher_generated']) {
      if (input[field] !== undefined && typeof input[field] !== 'boolean') {
        return this.#invalid(`invalid_${field}`);
      }
    }
    return { ok: true, value: this.#clean(input) };
  }

  #clean(input) {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]));
  }

  #invalid(error) { return { ok: false, error }; }
  #email(value) {
    return typeof value === 'string'
      && value.length <= 254
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }
  #isPlainObject(value) {
    return value !== null
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype;
  }
}
