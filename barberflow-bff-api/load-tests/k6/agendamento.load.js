/**
 * agendamento.load.js — k6 load test: fluxo de agendamentos.
 *
 * Fluxo: login → listar → criar → cancelar
 *
 * SLOs:
 *   - Criação de agendamento: p95 < 1s
 *   - Listagem: p95 < 500ms
 *   - Erro: < 0.5%
 */

import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const criarLatency  = new Trend('agendamento_criar_ms', true);
const listarLatency = new Trend('agendamento_listar_ms', true);
const criarSuccess  = new Rate('agendamento_criar_success');

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
        { target: 30,  duration: '30s' },
        { target: 30,  duration: '1m'  },
        { target: 0,   duration: '30s' },
      ],
      startTime: '35s',
    },
  },
  thresholds: {
    'http_req_failed':        ['rate<0.005'],
    'agendamento_criar_ms':   ['p(95)<1000'],
    'agendamento_listar_ms':  ['p(95)<500'],
    'agendamento_criar_success': ['rate>0.995'],
  },
};

const BASE_URL  = __ENV.BASE_URL  || 'http://localhost:3333';
const EMAIL     = __ENV.EMAIL     || 'loadtest@barberflow.com';
const PASSWORD  = __ENV.PASSWORD  || 'senha-loadtest-123';
const PROF_ID   = __ENV.PROF_ID   || 'a1b2c3d4-e5f6-4789-8abc-111122223333';
const BB_ID     = __ENV.BB_ID     || 'b2c3d4e5-f6a7-4890-9bcd-222233334444';
const SERV_ID   = __ENV.SERV_ID   || 'c3d4e5f6-a7b8-4901-abcd-333344445555';

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

  // 2. Listar
  const listarRes = http.get(`${BASE_URL}/api/agendamentos`, { headers });
  listarLatency.add(listarRes.timings.duration);

  check(listarRes, {
    'listar status 200':   r => r.status === 200,
    'listar retorna lista': r => Array.isArray(r.json('dados')),
  });

  // 3. Criar — 1h no futuro
  const scheduledAt = new Date(Date.now() + 3600 * 1000).toISOString();

  const criarRes = http.post(
    `${BASE_URL}/api/agendamentos`,
    JSON.stringify({
      professional_id: PROF_ID,
      barbershop_id:   BB_ID,
      service_id:      SERV_ID,
      scheduled_at:    scheduledAt,
      duration_min:    30,
    }),
    { headers },
  );

  criarLatency.add(criarRes.timings.duration);
  const criouOk = check(criarRes, {
    'criar status 2xx':    r => r.status >= 200 && r.status < 300,
    'criar retorna id':    r => r.json('dados.id') != null,
  });
  criarSuccess.add(criouOk);

  // 4. Cancelar se criou
  if (criouOk) {
    const id = criarRes.json('dados.id');
    const delRes = http.del(`${BASE_URL}/api/agendamentos/${id}`, null, { headers });
    check(delRes, { 'cancelar status 2xx': r => r.status >= 200 && r.status < 300 });
  }

  sleep(1);
}
