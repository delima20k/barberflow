import test from 'node:test';
import assert from 'node:assert/strict';

import { AnalyticsEventValidator } from '../src/validators/AnalyticsEventValidator.mjs';
import { AnalyticsSecurity } from '../src/security/AnalyticsSecurity.mjs';
import { AnalyticsConfig } from '../src/config/AnalyticsConfig.mjs';
import { AnalyticsRepository } from '../src/repositories/AnalyticsRepository.mjs';
import { AnalyticsAdminGuard } from '../src/services/AnalyticsAdminGuard.mjs';

const baseEvent = Object.freeze({
  idempotency_key: '550e8400-e29b-41d4-a716-446655440000',
  event_name: 'cta_click',
  session_id: '550e8400-e29b-41d4-a716-446655440001',
  visitor_id: '550e8400-e29b-41d4-a716-446655440002',
  page: 'https://barberflow.live/',
  button_name: 'Gerar voucher',
});

test('AnalyticsEventValidator aceita somente eventos e campos da allowlist', () => {
  const validator = new AnalyticsEventValidator();
  const result = validator.validate(baseEvent);

  assert.equal(result.ok, true);
  assert.equal(result.value.event_name, 'cta_click');
  assert.equal(result.value.button_name, 'Gerar voucher');
});

test('AnalyticsEventValidator bloqueia evento e campo desconhecidos', () => {
  const validator = new AnalyticsEventValidator();

  assert.equal(validator.validate({ ...baseEvent, event_name: 'page_view' }).ok, false);
  assert.equal(validator.validate({ ...baseEvent, internal_flag: true }).ok, false);
});

test('AnalyticsSecurity aceita apenas a origem canônica e limita payload', () => {
  const security = new AnalyticsSecurity({
    allowedOrigin: 'https://barberflow.live',
    hmacSecret: 'test-secret',
    maxPayloadBytes: 1024,
  });

  assert.equal(security.isAllowedOrigin('https://barberflow.live'), true);
  assert.equal(security.isAllowedOrigin('https://evil.example'), false);
  assert.equal(security.isPayloadWithinLimit(JSON.stringify(baseEvent)), true);
  assert.equal(security.isPayloadWithinLimit('x'.repeat(1025)), false);
});

test('AnalyticsSecurity normaliza e protege e-mail exclusivamente por HMAC', async () => {
  const security = new AnalyticsSecurity({
    allowedOrigin: 'https://barberflow.live',
    hmacSecret: 'test-secret',
  });

  const emailHmac = await security.emailHmac('  ADMIN@BARBERFLOW.LIVE ');

  assert.match(emailHmac, /^[a-f0-9]{64}$/);
  assert.notEqual(emailHmac, 'admin@barberflow.live');
  assert.equal(await security.emailHmac('admin@barberflow.live'), emailHmac);
});

test('AnalyticsConfig reutiliza as variáveis seguras do Supabase BarberFlow', () => {
  const config = new AnalyticsConfig({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    ANALYTICS_HMAC_SECRET: 'secret',
  });

  assert.equal(config.supabaseUrl, 'https://project.supabase.co');
  assert.equal(config.publishableKey, 'publishable');
  assert.equal(config.serviceRoleKey, 'service-role');
  assert.doesNotThrow(() => config.assertReady());
});

test('AnalyticsRepository fixa o schema analytics antes de chamar a RPC', async () => {
  const calls = [];
  const client = {
    schema(name) {
      calls.push(['schema', name]);
      return {
        async rpc(name) {
          calls.push(['rpc', name]);
          return { data: { accepted: true }, error: null };
        },
      };
    },
  };

  const repository = new AnalyticsRepository(client);
  await repository.collect({ event: {}, ipHash: 'hash', origin: 'origin' });

  assert.deepEqual(calls, [
    ['schema', 'analytics'],
    ['rpc', 'collect_analytics_event'],
  ]);
});

test('AnalyticsAdminGuard bloqueia não autenticado e usuário fora da allowlist', async () => {
  const unauthenticated = new AnalyticsAdminGuard({
    authClient: { auth: { getUser: async () => ({ data: { user: null } }) } },
    dashboardClient: { schema: () => ({ rpc: async () => ({ data: true }) }) },
  });
  const forbidden = new AnalyticsAdminGuard({
    authClient: { auth: { getUser: async () => ({ data: { user: { id: 'user-id' } } }) } },
    dashboardClient: { schema: () => ({ rpc: async () => ({ data: false, error: null }) }) },
  });

  assert.equal((await unauthenticated.authorize()).reason, 'unauthenticated');
  assert.equal((await forbidden.authorize()).reason, 'forbidden');
});

test('AnalyticsAdminGuard autoriza somente administrador ativo', async () => {
  const guard = new AnalyticsAdminGuard({
    authClient: { auth: { getUser: async () => ({ data: { user: { id: 'admin-id' } } }) } },
    dashboardClient: {
      schema(name) {
        assert.equal(name, 'analytics');
        return { rpc: async (rpc) => ({ data: rpc === 'is_analytics_admin', error: null }) };
      },
    },
  });

  assert.equal((await guard.authorize()).authorized, true);
});
