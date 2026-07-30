export const MAX_BODY_BYTES = 12_000;

export const ESSENTIAL_EVENTS = new Set([
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

const TEXT_LIMITS: Record<string, number> = {
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
  idempotency_key: 160,
};

export function validateEvent(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'invalid_payload' } as const;
  }

  const event = payload as Record<string, unknown>;
  if (!ESSENTIAL_EVENTS.has(String(event.event_name ?? ''))) {
    return { ok: false, reason: 'invalid_event' } as const;
  }

  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    const value = event[field];
    if (value !== undefined && (typeof value !== 'string' || value.length > limit)) {
      return { ok: false, reason: `invalid_${field}` } as const;
    }
  }

  if (!event.session_id || !event.visitor_id || !event.idempotency_key) {
    return { ok: false, reason: 'missing_identity' } as const;
  }
  return { ok: true, event } as const;
}
