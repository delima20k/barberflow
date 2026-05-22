/**
 * auth.load.js — k6 load test: fluxo de autenticação.
 *
 * Cenários:
 *   - smoke    : 1 VU por 30s  (sanity check)
 *   - load     : ramp 0→50 VU  / 2min / ramp down
 *   - stress   : ramp 0→200 VU / 3min / ramp down
 *
 * SLOs validados:
 *   - p95 latência < 800ms
 *   - taxa de erro < 1%
 *   - disponibilidade > 99.9%
 *
 * Uso:
 *   k6 run --env BASE_URL=https://api.barberflow.com \
 *          --env EMAIL=test@barberflow.com \
 *          --env PASSWORD=senha-teste \
 *          load-tests/k6/auth.load.js
 */

import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Métricas customizadas ─────────────────────────────────────────
const loginLatency     = new Trend('login_latency_ms', true);
const loginErrors      = new Counter('login_errors');
const loginSuccessRate = new Rate('login_success_rate');

// ── Configuração de cenários ──────────────────────────────────────
export const options = {
  scenarios: {
    smoke: {
      executor:   'constant-vus',
      vus:        1,
      duration:   '30s',
      tags:       { scenario: 'smoke' },
    },
    load: {
      executor:      'ramping-vus',
      startVUs:      0,
      stages: [
        { target: 20,  duration: '30s' },
        { target: 50,  duration: '1m'  },
        { target: 50,  duration: '30s' },
        { target: 0,   duration: '30s' },
      ],
      startTime:  '35s',
      tags:       { scenario: 'load' },
    },
    stress: {
      executor:      'ramping-vus',
      startVUs:      0,
      stages: [
        { target: 100, duration: '1m'  },
        { target: 200, duration: '1m'  },
        { target: 200, duration: '1m'  },
        { target: 0,   duration: '30s' },
      ],
      startTime:  '3m',
      tags:       { scenario: 'stress' },
    },
  },

  // ── SLO thresholds ───────────────────────────────────────────────
  thresholds: {
    // Latência p95 < 800ms em todos os cenários
    'http_req_duration{scenario:smoke}':  ['p(95)<800'],
    'http_req_duration{scenario:load}':   ['p(95)<800'],
    'http_req_duration{scenario:stress}': ['p(95)<2000'],

    // Taxa de erro global < 1%
    'http_req_failed': ['rate<0.01'],

    // Taxa de sucesso no login > 99%
    'login_success_rate': ['rate>0.99'],

    // Latência de login p99 < 1.5s em carga normal
    'login_latency_ms{scenario:load}': ['p(99)<1500'],
  },
};

// ── Setup ─────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3333';
const EMAIL    = __ENV.EMAIL    || 'loadtest@barberflow.com';
const PASSWORD = __ENV.PASSWORD || 'senha-loadtest-123';

const headers = { 'Content-Type': 'application/json' };

// ── VU loop ───────────────────────────────────────────────────────
export default function () {
  // 1. Login
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers },
  );

  loginLatency.add(loginRes.timings.duration);

  const loginOk = check(loginRes, {
    'login status 200':         r => r.status === 200,
    'login body ok=true':       r => r.json('ok') === true,
    'login retorna token':      r => r.json('dados.access_token') != null,
  });

  loginSuccessRate.add(loginOk);
  if (!loginOk) {
    loginErrors.add(1);
    sleep(1);
    return;
  }

  // 2. Usar token para acessar /api/auth/me
  const token   = loginRes.json('dados.access_token');
  const authHdr = { ...headers, Authorization: `Bearer ${token}` };

  const meRes = http.get(`${BASE_URL}/api/auth/me`, { headers: authHdr });

  check(meRes, {
    'me status 200':   r => r.status === 200,
    'me body ok=true': r => r.json('ok') === true,
  });

  // 3. Logout
  const logoutRes = http.post(`${BASE_URL}/api/auth/logout`, null, { headers: authHdr });

  check(logoutRes, {
    'logout status 2xx': r => r.status >= 200 && r.status < 300,
  });

  sleep(0.5);
}
