'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(
  path.join(ROOT, 'shared/js/BarbeiroAtividadeStatus.js'),
  'utf8',
);

class BarbeiroAtividadeRealtimeFixture {
  constructor() {
    this.handlers = [];
    this.channelCalls = 0;
    this.subscribeCalls = 0;
    this.removeCalls = 0;
    this.sendCalls = [];
    this.channel = {
      on: (type, filter, callback) => {
        this.handlers.push({ type, filter, callback });
        return this.channel;
      },
      subscribe: () => {
        this.subscribeCalls += 1;
        return this.channel;
      },
      send: payload => {
        this.sendCalls.push(payload);
        return Promise.resolve('ok');
      },
    };

    const sandbox = vm.createContext({
      console,
      Map,
      Set,
      Object,
      Array,
      String,
      Promise,
      Date,
      Error,
      document: { dispatchEvent() {} },
      CustomEvent: class CustomEvent {},
      LoggerService: { warn() {} },
      SupabaseService: {
        channel: () => {
          this.channelCalls += 1;
          return this.channel;
        },
        removeChannel: () => {
          this.removeCalls += 1;
        },
      },
    });
    sandbox.window = sandbox;
    vm.runInContext(SOURCE, sandbox);
    this.Status = sandbox.BarbeiroAtividadeStatus;
  }

  emitir(type, payload) {
    const handler = this.handlers.find(item => item.type === type);
    handler?.callback(payload);
  }
}

describe('BarbeiroAtividadeStatus Realtime compartilhado', () => {
  it('reutiliza uma unica assinatura por barbearia e distribui os eventos', () => {
    const fixture = new BarbeiroAtividadeRealtimeFixture();
    const recebidosA = [];
    const recebidosB = [];

    fixture.Status.assinar('shop-1', payload => recebidosA.push(payload));
    fixture.Status.assinar('shop-1', payload => recebidosB.push(payload));
    fixture.emitir('postgres_changes', { new: { professional_id: 'pro-1' } });

    assert.equal(fixture.channelCalls, 1);
    assert.equal(fixture.subscribeCalls, 1);
    assert.equal(recebidosA.length, 1);
    assert.equal(recebidosB.length, 1);
  });

  it('remove o canal somente depois que o ultimo consumidor sair', () => {
    const fixture = new BarbeiroAtividadeRealtimeFixture();
    const assinaturaA = fixture.Status.assinar('shop-1', () => {});
    const assinaturaB = fixture.Status.assinar('shop-1', () => {});

    fixture.Status.desassinar(assinaturaA);
    assert.equal(fixture.removeCalls, 0);

    fixture.Status.desassinar(assinaturaB);
    assert.equal(fixture.removeCalls, 1);
  });

  it('mantem o broadcast disponivel pelo identificador da assinatura', async () => {
    const fixture = new BarbeiroAtividadeRealtimeFixture();
    const assinatura = fixture.Status.assinar('shop-1', () => {});
    const payload = { type: 'broadcast', event: 'status', payload: {} };

    await assinatura.send(payload);

    assert.deepEqual(fixture.sendCalls, [payload]);
  });
});
