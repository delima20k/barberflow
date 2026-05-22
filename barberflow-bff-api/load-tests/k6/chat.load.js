/**
 * chat.load.js — k6 load test: fluxo de chat.
 *
 * Fluxo: login → listar mensagens → enviar mensagem
 *
 * SLOs:
 *   - Envio de mensagem: p95 < 600ms
 *   - Leitura: p95 < 400ms
 *   - Erro: < 1%
 */

import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const envioLatency  = new Trend('chat_envio_ms', true);
const leituraLatency = new Trend('chat_leitura_ms', true);
const envioSuccess   = new Rate('chat_envio_success');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus:      1,
      duration: '30s',
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 20,  duration: '30s' },
        { target: 50,  duration: '1m'  },
        { target: 0,   duration: '30s' },
      ],
      startTime: '35s',
    },
  },
  thresholds: {
    'http_req_failed':    ['rate<0.01'],
    'chat_envio_ms':      ['p(95)<600'],
    'chat_leitura_ms':    ['p(95)<400'],
    'chat_envio_success': ['rate>0.99'],
  },
};

const BASE_URL   = __ENV.BASE_URL   || 'http://localhost:3333';
const EMAIL      = __ENV.EMAIL      || 'loadtest@barberflow.com';
const PASSWORD   = __ENV.PASSWORD   || 'senha-loadtest-123';
const CONV_ID    = __ENV.CONV_ID    || 'a1b2c3d4-e5f6-4789-8abc-111122223333';

const jsonHeaders = { 'Content-Type': 'application/json' };

export default function () {
  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: jsonHeaders },
  );

  if (!check(loginRes, { 'login ok': r => r.status === 200 })) {
    sleep(1);
    return;
  }

  const token   = loginRes.json('dados.access_token');
  const headers = { ...jsonHeaders, Authorization: `Bearer ${token}` };
  const msgUrl  = `${BASE_URL}/api/v1/chat/conversations/${CONV_ID}/messages`;

  // 2. Listar mensagens
  const listRes = http.get(msgUrl, { headers });
  leituraLatency.add(listRes.timings.duration);

  check(listRes, {
    'listar status 200':     r => r.status === 200,
    'listar body ok':        r => r.json('ok') === true,
  });

  // 3. Enviar mensagem
  const envioRes = http.post(
    msgUrl,
    JSON.stringify({
      body:            `Mensagem de carga ${Date.now()}`,
      clientMessageId: `k6-${__VU}-${__ITER}`,
    }),
    { headers },
  );

  envioLatency.add(envioRes.timings.duration);
  const enviouOk = check(envioRes, {
    'envio status 2xx': r => r.status >= 200 && r.status < 300,
  });
  envioSuccess.add(enviouOk);

  sleep(0.3);
}
