import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  MAX_BODY_BYTES,
  validateEvent,
} from '../_shared/event-validator.ts';

const allowedOrigins = new Set(
  (Deno.env.get('ANALYTICS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function response(status: number, body: Record<string, unknown>, origin = '') {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';
  const hmacSecret = Deno.env.get('ANALYTICS_HMAC_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!hmacSecret || !supabaseUrl || !serviceRoleKey || allowedOrigins.size === 0) {
    return response(503, { error: 'collector_not_configured' }, origin);
  }
  if (!allowedOrigins.has(origin)) return response(403, { error: 'origin_denied' });
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, x-request-id',
        vary: 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' }, origin);

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return response(413, { error: 'payload_too_large' }, origin);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return response(413, { error: 'payload_too_large' }, origin);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return response(400, { error: 'invalid_json' }, origin);
  }
  const validation = validateEvent(parsed);
  if (!validation.ok) return response(422, { error: validation.reason }, origin);

  const event = validation.event;
  const email = typeof event.email === 'string' ? event.email.trim().toLowerCase() : '';
  delete event.email;
  if (email) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(hmacSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
    event.email_hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  let ipHash = '';
  if (forwarded) {
    const data = new TextEncoder().encode(`${hmacSecret}:${forwarded}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    ipHash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    event.ip_hash = ipHash;
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rateAllowed, error: rateError } = await client.rpc(
    'claim_analytics_rate_limit',
    {
      p_bucket_key: `${ipHash}:${String(event.session_id)}`,
      p_limit: 60,
      p_window_seconds: 60,
    },
  );
  if (rateError) return response(503, { error: 'rate_limit_unavailable' }, origin);
  if (!rateAllowed) return response(429, { error: 'rate_limit_exceeded' }, origin);

  const { error } = await client.from('analytics_events').upsert(event, {
    onConflict: 'idempotency_key',
    ignoreDuplicates: true,
  });
  if (error) return response(500, { error: 'event_not_stored' }, origin);
  return response(202, { accepted: true }, origin);
});
