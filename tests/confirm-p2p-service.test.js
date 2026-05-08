'use strict';

/**
 * confirm-p2p-service.test.js
 *
 * TDD para ConfirmP2PService — cache P2P de confirmações pendentes.
 *
 * MockChannelBus simula Supabase Realtime Broadcast: mensagens são
 * entregues síncrona e imediatamente a todos os assinantes do mesmo canal.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { fn, carregar } = require('./_helpers');
const vm = require('node:vm');

// ── MockChannelBus ─────────────────────────────────────────────────────────
// Simula Supabase Realtime Broadcast: canal compartilhado por nome.
// Mensagens broadcast chegam a TODOS os assinantes (incluindo remetente).
function criarMockChannelBus() {
  // channelName → Array<{ handlers: Map<event, fn[]> }>
  const peers = new Map();

  return {
    channel(name) {
      const handlers = new Map();

      const ch = {
        on(/* type */_t, { event }, handler) {
          if (!handlers.has(event)) handlers.set(event, []);
          handlers.get(event).push(handler);
          return ch;
        },
        subscribe(callback) {
          if (!peers.has(name)) peers.set(name, []);
          peers.get(name).push({ handlers });
          // Adiado para microtask: simula a confirmação assíncrona do Supabase
          // e evita TDZ em `const canal = ...subscribe(cb => canal.send(...))`.
          if (typeof callback === 'function') Promise.resolve().then(() => callback('SUBSCRIBED'));
          return ch;
        },
        send({ event, payload } = {}) {
          for (const peer of (peers.get(name) ?? [])) {
            for (const h of (peer.handlers.get(event) ?? [])) {
              h({ payload });
            }
          }
          return Promise.resolve({});
        },
        unsubscribe() {
          const list = peers.get(name);
          if (list) {
            const idx = list.findIndex(p => p.handlers === handlers);
            if (idx >= 0) list.splice(idx, 1);
          }
          return Promise.resolve();
        },
      };
      return ch;
    },
    reset() { peers.clear(); },
  };
}

// ── Sandbox factory ────────────────────────────────────────────────────────
function criarSandbox(bus) {
  const sandbox = vm.createContext({
    SupabaseService: bus,
    setTimeout,
    clearTimeout,
  });
  carregar(sandbox, 'shared/js/ConfirmP2PService.js');
  return sandbox;
}

// ══════════════════════════════════════════════════════════════════════════
// Suite 1 — armazenarParaCliente
// ══════════════════════════════════════════════════════════════════════════
describe('ConfirmP2PService — armazenarParaCliente', () => {
  let S;
  before(() => { S = criarSandbox(criarMockChannelBus()); });

  it('armazena { entradaId, shopId, ts } indexado por clientId', () => {
    S.ConfirmP2PService.armazenarParaCliente('c1', 'e1', 's1');
    const entry = S.ConfirmP2PService._getCacheEntry('c1');
    assert.equal(entry?.entradaId, 'e1');
    assert.equal(entry?.shopId, 's1');
    assert.ok(typeof entry?.ts === 'number');
  });

  it('sobrescreve entrada anterior do mesmo clientId', () => {
    S.ConfirmP2PService.armazenarParaCliente('c1', 'e1', 's1');
    S.ConfirmP2PService.armazenarParaCliente('c1', 'e2', 's1');
    assert.equal(S.ConfirmP2PService._getCacheEntry('c1')?.entradaId, 'e2');
  });

  it('ignora clientId vazio', () => {
    S.ConfirmP2PService.armazenarParaCliente('', 'eX', 's1');
    assert.equal(S.ConfirmP2PService._getCacheEntry(''), null);
  });

  it('ignora entradaId vazio', () => {
    S.ConfirmP2PService.armazerarParaCliente?.('c9', '', 's1');
    S.ConfirmP2PService.armazenarParaCliente('c9', '', 's1');
    assert.equal(S.ConfirmP2PService._getCacheEntry('c9'), null);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 2 — pararBarber
// ══════════════════════════════════════════════════════════════════════════
describe('ConfirmP2PService — pararBarber', () => {
  let S;
  before(() => {
    const bus = criarMockChannelBus();
    S = criarSandbox(bus);
  });

  it('limpa o cache completamente', () => {
    S.ConfirmP2PService.armazenarParaCliente('c1', 'e1', 's1');
    S.ConfirmP2PService.pararBarber();
    assert.equal(S.ConfirmP2PService._getCacheEntry('c1'), null);
  });

  it('pode ser chamado sem canal ativo sem lançar erro', () => {
    assert.doesNotThrow(() => S.ConfirmP2PService.pararBarber());
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 3 — iniciarBarber: idempotência
// ══════════════════════════════════════════════════════════════════════════
describe('ConfirmP2PService — iniciarBarber idempotência', () => {
  let bus, S;
  before(() => {
    bus = criarMockChannelBus();
    S   = criarSandbox(bus);
  });

  it('não cria segundo canal se chamado com mesmo shopId', () => {
    const channelSpy = fn(name => bus.channel(name));
    // Substitui temporariamente o método channel para contar chamadas
    const origChannel = bus.channel.bind(bus);
    let count = 0;
    bus.channel = (name) => { count++; return origChannel(name); };

    S.ConfirmP2PService.iniciarBarber('s1');
    S.ConfirmP2PService.iniciarBarber('s1'); // segunda chamada idempotente
    assert.equal(count, 1);

    bus.channel = origChannel; // restaura
  });

  it('reconecta se shopId mudou', () => {
    const origChannel = bus.channel.bind(bus);
    let count = 0;
    bus.channel = (name) => { count++; return origChannel(name); };

    S.ConfirmP2PService.pararBarber();
    count = 0;
    S.ConfirmP2PService.iniciarBarber('s1');
    S.ConfirmP2PService.iniciarBarber('s2'); // shopId diferente
    assert.equal(count, 2);

    bus.channel = origChannel;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 4 — fluxo pull/push/done
// ══════════════════════════════════════════════════════════════════════════
describe('ConfirmP2PService — fluxo pull → push → done', () => {
  let bus, S;
  before(() => {
    bus = criarMockChannelBus();
    S   = criarSandbox(bus);
  });
  beforeEach(() => {
    bus.reset();
    S.ConfirmP2PService.pararBarber();
  });

  it('tentarPull retorna { entradaId } quando barbeiro tem dado no cache', async () => {
    S.ConfirmP2PService.armazenarParaCliente('c1', 'e1', 's1');
    S.ConfirmP2PService.iniciarBarber('s1');

    const dados = await S.ConfirmP2PService.tentarPull('s1', 'c1', 200);
    assert.equal(dados?.entradaId, 'e1');
  });

  it('cache do barbeiro é limpo após o done recebido', async () => {
    S.ConfirmP2PService.armazenarParaCliente('c2', 'e2', 's1');
    S.ConfirmP2PService.iniciarBarber('s1');

    await S.ConfirmP2PService.tentarPull('s1', 'c2', 200);
    assert.equal(S.ConfirmP2PService._getCacheEntry('c2'), null);
  });

  it('tentarPull retorna null se barbeiro não tem dado para o clientId', async () => {
    // barbeiro ativo mas sem cache para c3
    S.ConfirmP2PService.iniciarBarber('s1');
    const dados = await S.ConfirmP2PService.tentarPull('s1', 'c3', 30);
    assert.equal(dados, null);
  });

  it('tentarPull retorna null se nenhum barbeiro está escutando (timeout)', async () => {
    // nenhum iniciarBarber chamado
    const dados = await S.ConfirmP2PService.tentarPull('s1', 'c4', 20);
    assert.equal(dados, null);
  });

  it('não entrega dado de outro clientId', async () => {
    S.ConfirmP2PService.armazenarParaCliente('c5', 'e5', 's1');
    S.ConfirmP2PService.iniciarBarber('s1');

    // Solicita para c6 (não c5)
    const dados = await S.ConfirmP2PService.tentarPull('s1', 'c6', 30);
    assert.equal(dados, null);
    // cache de c5 permanece intacto
    assert.equal(S.ConfirmP2PService._getCacheEntry('c5')?.entradaId, 'e5');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Suite 5 — tentarPull com shopId/clientId inválidos
// ══════════════════════════════════════════════════════════════════════════
describe('ConfirmP2PService — tentarPull guards', () => {
  let S;
  before(() => { S = criarSandbox(criarMockChannelBus()); });

  it('retorna null imediatamente se shopId vazio', async () => {
    const dados = await S.ConfirmP2PService.tentarPull('', 'c1');
    assert.equal(dados, null);
  });

  it('retorna null imediatamente se clientId vazio', async () => {
    const dados = await S.ConfirmP2PService.tentarPull('s1', '');
    assert.equal(dados, null);
  });
});
