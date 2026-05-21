'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DomainEventPublisher } = require('../../../infrastructure/events/DomainEventPublisher');

afterEach(() => DomainEventPublisher._reset());

function fakeEvent(name, aggregateId = 'id-1') {
  return { eventName: name, aggregateId };
}

describe('DomainEventPublisher', () => {
  it('é singleton', () => {
    const a = DomainEventPublisher.getInstance();
    const b = DomainEventPublisher.getInstance();
    assert.strictEqual(a, b);
  });

  it('_reset() cria novo singleton', () => {
    const a = DomainEventPublisher.getInstance();
    DomainEventPublisher._reset();
    const b = DomainEventPublisher.getInstance();
    assert.notStrictEqual(a, b);
  });

  it('publish chama todos os handlers registrados', async () => {
    const bus = DomainEventPublisher.getInstance();
    const received = [];
    bus.subscribe('TestEvent', e => received.push(e));
    bus.subscribe('TestEvent', e => received.push(e));
    await bus.publish(fakeEvent('TestEvent'));
    assert.equal(received.length, 2);
  });

  it('publish sem subscribers não lança erro', async () => {
    const bus = DomainEventPublisher.getInstance();
    await assert.doesNotReject(() => bus.publish(fakeEvent('UnknownEvent')));
  });

  it('erro em um handler não interrompe os demais', async () => {
    const bus = DomainEventPublisher.getInstance();
    const results = [];
    bus.subscribe('E', () => { throw new Error('handler fail'); });
    bus.subscribe('E', () => results.push('ok'));
    await bus.publish(fakeEvent('E'));
    assert.deepEqual(results, ['ok']);
  });

  it('unsubscribe remove o handler', async () => {
    const bus = DomainEventPublisher.getInstance();
    let count = 0;
    const h = () => count++;
    bus.subscribe('E', h);
    await bus.publish(fakeEvent('E'));
    bus.unsubscribe('E', h);
    await bus.publish(fakeEvent('E'));
    assert.equal(count, 1);
  });

  it('publishAll publica múltiplos eventos em sequência', async () => {
    const bus = DomainEventPublisher.getInstance();
    const names = [];
    bus.subscribe('A', e => names.push(e.eventName));
    bus.subscribe('B', e => names.push(e.eventName));
    await bus.publishAll([fakeEvent('A'), fakeEvent('B'), fakeEvent('A')]);
    assert.deepEqual(names, ['A', 'B', 'A']);
  });

  it('subscribedEvents lista eventos com handlers', () => {
    const bus = DomainEventPublisher.getInstance();
    bus.subscribe('X', () => {});
    bus.subscribe('Y', () => {});
    assert.ok(bus.subscribedEvents.includes('X'));
    assert.ok(bus.subscribedEvents.includes('Y'));
  });
});
