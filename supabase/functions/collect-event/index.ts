import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AnalyticsConfig } from '../../../analytics/src/config/AnalyticsConfig.mjs';
import { AnalyticsRepository } from '../../../analytics/src/repositories/AnalyticsRepository.mjs';
import { AnalyticsSecurity } from '../../../analytics/src/security/AnalyticsSecurity.mjs';
import { AnalyticsEventValidator } from '../../../analytics/src/validators/AnalyticsEventValidator.mjs';

class UserAgentInspector {
  static inspect(value: string) {
    const userAgent = value || '';
    return {
      device: /Mobi|Android/i.test(userAgent) ? 'mobile' : /iPad|Tablet/i.test(userAgent) ? 'tablet' : 'desktop',
      browser: /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Other',
      os: /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad|Mac OS X/i.test(userAgent) ? 'Apple' : /Windows/i.test(userAgent) ? 'Windows' : /Linux/i.test(userAgent) ? 'Linux' : 'Other',
    };
  }
}

class CollectEventController {
  #config: AnalyticsConfig;
  #validator = new AnalyticsEventValidator();
  #security: AnalyticsSecurity;
  #repository: AnalyticsRepository;

  constructor() {
    this.#config = new AnalyticsConfig(Deno.env.toObject());
    this.#security = new AnalyticsSecurity({
      allowedOrigin: this.#config.allowedOrigin,
      hmacSecret: this.#config.hmacSecret,
    });
    const client = createClient(this.#config.supabaseUrl, this.#config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.#repository = new AnalyticsRepository(client);
    this.handle = this.handle.bind(this);
  }

  async handle(request: Request) {
    const origin = request.headers.get('origin') || '';
    const headers = {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      vary: 'Origin',
      'access-control-allow-origin': this.#security.isAllowedOrigin(origin)
        ? origin
        : this.#config.allowedOrigin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST' || !this.#security.isAllowedOrigin(origin)) {
      return this.#response(404, headers);
    }
    if (!this.#config.enabled) return this.#response(503, headers);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return this.#response(400, headers);
    }

    const rawPayload = await request.text();
    if (!this.#security.isPayloadWithinLimit(rawPayload)) return this.#response(413, headers);

    try {
      this.#config.assertReady();
      const validated = this.#validator.validate(JSON.parse(rawPayload));
      if (!validated.ok) return this.#response(400, headers);

      const event = await this.#normalize(validated.value, request);
      const result = await this.#repository.collect({
        event,
        ipHash: await this.#security.ipHash(this.#clientIp(request)),
        origin,
        userAgent: request.headers.get('user-agent') || '',
        country: request.headers.get('cf-ipcountry') || null,
        ipLimit: this.#config.ipLimit,
        sessionLimit: this.#config.sessionLimit,
      });
      return this.#response(result?.accepted === false ? 429 : 202, headers);
    } catch {
      return this.#response(400, headers);
    }
  }

  async #normalize(event: Record<string, unknown>, request: Request) {
    const normalized = {
      ...event,
      ...UserAgentInspector.inspect(request.headers.get('user-agent') || ''),
    };
    if (typeof normalized.email === 'string') {
      normalized.email_hmac = await this.#security.emailHmac(normalized.email);
      delete normalized.email;
    }
    return normalized;
  }

  #clientIp(request: Request) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
  }

  #response(status: number, headers: Record<string, string>) {
    return new Response(JSON.stringify({ accepted: status === 202 }), { status, headers });
  }
}

Deno.serve(new CollectEventController().handle);
