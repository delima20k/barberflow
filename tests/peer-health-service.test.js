'use strict';

// =============================================================
// tests/peer-health-service.test.js
//
// Testes: PeerHealthService
// Runner: node:test + node:assert/strict (nativo)
//
// Cenarios cobertos:
//
//   isAvailable():
//     1. Peer online (probe resolve) → true
//     2. Peer offline (probe lanca) → false
//     3. Peer lento (probe demora > timeout) → false
//
//   getBestPeer():
//     4. Um unico peer rapido → retorna esse peer
//     5. Peer offline → ignorado; retorna o disponivel
//     6. Peer lento (latencia >= slowThreshold) → ignorado
//     7. Dois peers rapidos → retorna o de menor latencia
//     8. Todos offline → Error{status:503}
//     9. Todos lentos (>= slowThreshold) → Error{status:503}
//    10. Mix: offline + lento + rapido → retorna o rapido
//    11. Multiplos rapidos em latencias distintas → menor latencia vence
//
//   Validacao de entradas:
//    12. isAvailable com peerId nao-string → TypeError
//    13. isAvailable com peerId vazio → TypeError
//    14. getBestPeer com array vazio → TypeError
//    15. getBestPeer com nao-array → TypeError
//    16. getBestPeer com peer vazio na lista → TypeError
//    17. timeout <= 0 → RangeError no construtor
//    18. slowThreshold <= 0 → RangeError no construtor
//
//   Getters de configuracao:
//    19. timeout getter retorna valor configurado
//    20. slowThreshold getter retorna valor configurado
// =============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const PeerHealthService = require('../src/services/PeerHealthService');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Aguarda `ms` milissegundos. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cria um probeProvider onde cada peerId tem comportamento configurado.
 *
 * @param {Map<string, 'ok'|'fail'|number>} config
 *   'ok'      → resolve imediatamente
 *   'fail'    → lanca imediatamente
 *   number N  → resolve apos N ms (simula latencia real)
 */
function criarProbe(config) {
  return {
    async probe(peerId) {
      const comportamento = config.get(peerId) ?? 'ok';
      if (comportamento === 'fail') {
        throw new Error(`peer offline: ${peerId}`);
      }
      if (typeof comportamento === 'number') {
        await sleep(comportamento);
        return;
      }
      // 'ok' → resolve imediatamente
    },
  };
}

// ── Suite: isAvailable() ──────────────────────────────────────────────────────

describe('PeerHealthService.isAvailable()', () => {

  it('peer online (probe resolve) → true', async () => {
    const probe = criarProbe(new Map([['peer-a', 'ok']]));
    const svc   = new PeerHealthService({ probeProvider: probe, timeout: 500 });
    assert.equal(await svc.isAvailable('peer-a'), true);
  });

  it('peer offline (probe lanca) → false', async () => {
    const probe = criarProbe(new Map([['peer-b', 'fail']]));
    const svc   = new PeerHealthService({ probeProvider: probe, timeout: 500 });
    assert.equal(await svc.isAvailable('peer-b'), false);
  });

  it('peer lento (probe demora > timeout) → false', async () => {
    // probe demora 300ms, timeout = 100ms → deve expirar
    const probe = criarProbe(new Map([['peer-c', 300]]));
    const svc   = new PeerHealthService({ probeProvider: probe, timeout: 100 });
    assert.equal(await svc.isAvailable('peer-c'), false);
  });
});

// ── Suite: getBestPeer() ──────────────────────────────────────────────────────

describe('PeerHealthService.getBestPeer()', () => {

  it('unico peer rapido → retorna esse peer', async () => {
    const probe = criarProbe(new Map([['p1', 10]]));
    const svc   = new PeerHealthService({ probeProvider: probe, timeout: 500, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['p1']), 'p1');
  });

  it('peer offline → ignorado; retorna o disponivel', async () => {
    const probe = criarProbe(new Map([
      ['offline', 'fail'],
      ['online',  10],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 500, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['offline', 'online']), 'online');
  });

  it('peer lento (latencia >= slowThreshold) → ignorado', async () => {
    // slow demora 250ms, slowThreshold = 200ms → deve ser excluido
    const probe = criarProbe(new Map([
      ['slow',  250],
      ['fast',   10],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 1000, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['slow', 'fast']), 'fast');
  });

  it('dois peers rapidos → retorna o de menor latencia', async () => {
    const probe = criarProbe(new Map([
      ['peer-50ms',  50],
      ['peer-10ms',  10],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 500, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['peer-50ms', 'peer-10ms']), 'peer-10ms');
  });

  it('todos offline → Error{status:503}', async () => {
    const probe = criarProbe(new Map([
      ['p1', 'fail'],
      ['p2', 'fail'],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 500, slowThreshold: 200 });
    await assert.rejects(
      () => svc.getBestPeer(['p1', 'p2']),
      (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it('todos lentos (>= slowThreshold) → Error{status:503}', async () => {
    // Ambos demoram 300ms, slowThreshold = 200ms
    const probe = criarProbe(new Map([
      ['p1', 300],
      ['p2', 300],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 1000, slowThreshold: 200 });
    await assert.rejects(
      () => svc.getBestPeer(['p1', 'p2']),
      (err) => {
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it('mix offline + lento + rapido → retorna o rapido', async () => {
    const probe = criarProbe(new Map([
      ['offline', 'fail'],
      ['slow',    300],
      ['fast',     10],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 1000, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['offline', 'slow', 'fast']), 'fast');
  });

  it('multiplos rapidos em latencias distintas → menor latencia vence', async () => {
    const probe = criarProbe(new Map([
      ['p-100', 100],
      ['p-050',  50],
      ['p-150', 150],
      ['p-020',  20],
    ]));
    const svc = new PeerHealthService({ probeProvider: probe, timeout: 500, slowThreshold: 200 });
    assert.equal(await svc.getBestPeer(['p-100', 'p-050', 'p-150', 'p-020']), 'p-020');
  });
});

// ── Suite: validacao de entradas ──────────────────────────────────────────────

describe('PeerHealthService — validacao', () => {

  it('isAvailable: peerId nao-string → TypeError', async () => {
    const svc = new PeerHealthService();
    await assert.rejects(() => svc.isAvailable(42), TypeError);
  });

  it('isAvailable: peerId vazio → TypeError', async () => {
    const svc = new PeerHealthService();
    await assert.rejects(() => svc.isAvailable(''), TypeError);
  });

  it('getBestPeer: array vazio → TypeError', async () => {
    const svc = new PeerHealthService();
    await assert.rejects(() => svc.getBestPeer([]), TypeError);
  });

  it('getBestPeer: nao-array → TypeError', async () => {
    const svc = new PeerHealthService();
    await assert.rejects(() => svc.getBestPeer('peer-a'), TypeError);
  });

  it('getBestPeer: peer vazio na lista → TypeError', async () => {
    const svc = new PeerHealthService();
    await assert.rejects(() => svc.getBestPeer(['peer-a', '']), TypeError);
  });

  it('timeout <= 0 → RangeError no construtor', () => {
    assert.throws(() => new PeerHealthService({ timeout: 0 }),  RangeError);
    assert.throws(() => new PeerHealthService({ timeout: -1 }), RangeError);
  });

  it('slowThreshold <= 0 → RangeError no construtor', () => {
    assert.throws(() => new PeerHealthService({ slowThreshold: 0 }),  RangeError);
    assert.throws(() => new PeerHealthService({ slowThreshold: -5 }), RangeError);
  });
});

// ── Suite: getters de configuracao ────────────────────────────────────────────

describe('PeerHealthService — getters', () => {

  it('timeout getter retorna valor configurado', () => {
    const svc = new PeerHealthService({ timeout: 3000 });
    assert.equal(svc.timeout, 3000);
  });

  it('slowThreshold getter retorna valor configurado', () => {
    const svc = new PeerHealthService({ slowThreshold: 1500 });
    assert.equal(svc.slowThreshold, 1500);
  });
});
