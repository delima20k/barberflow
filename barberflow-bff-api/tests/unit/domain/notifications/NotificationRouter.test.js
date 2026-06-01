'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { Notification } = require('../../../../domain/notifications/entities/Notification');
const { NotificationPreferences } = require('../../../../domain/notifications/entities/NotificationPreferences');
const { NotificationRouter } = require('../../../../application/notifications/NotificationRouter');
const { DigestAggregationStrategy } = require('../../../../application/notifications/strategies/DigestAggregationStrategy');

function makeNotification(overrides = {}) {
  return Notification.create({
    id: 'notif-1',
    userId: 'user-1',
    templateId: 'queue.arrived',
    category: 'queue',
    priority: 'default',
    channels: ['in_app', 'push', 'email'],
    dedupeKey: 'queue-1',
    data: { clienteNome: 'Ana' },
    createdAt: new Date('2026-05-22T12:00:00.000Z'),
    ...overrides,
  }).getValue();
}

describe('NotificationRouter', () => {
  it('deve respeitar opt-out por categoria e canal', () => {
    const prefs = NotificationPreferences.create({
      userId: 'user-1',
      channelsByCategory: { queue: { push: false, email: true, in_app: true } },
    }).getValue();
    const router = new NotificationRouter({
      presenceLink: { isOnline: () => false },
      digestStrategy: new DigestAggregationStrategy({ threshold: 3 }),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });

    const route = router.route({ notification: makeNotification(), preferences: prefs });

    assert.deepEqual(route.immediateChannels, ['email']);
  });

  it('deve preferir in_app quando usuario esta online', () => {
    const prefs = NotificationPreferences.allowAll('user-1');
    const router = new NotificationRouter({
      presenceLink: { isOnline: () => true },
      digestStrategy: new DigestAggregationStrategy({ threshold: 3 }),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });

    const route = router.route({ notification: makeNotification(), preferences: prefs });

    assert.deepEqual(route.immediateChannels, ['in_app', 'email']);
  });

  it('deve segurar canais externos durante quiet hours para prioridade default', () => {
    const prefs = NotificationPreferences.create({
      userId: 'user-1',
      quietHours: { start: '22:00', end: '07:00', timezoneOffsetMinutes: 0 },
    }).getValue();
    const router = new NotificationRouter({
      presenceLink: { isOnline: () => false },
      digestStrategy: new DigestAggregationStrategy({ threshold: 3 }),
      clock: { now: () => new Date('2026-05-22T23:30:00.000Z') },
    });

    const route = router.route({ notification: makeNotification(), preferences: prefs });

    assert.deepEqual(route.delayedChannels, ['push', 'email']);
  });

  it('deve permitir prioridade high mesmo durante quiet hours', () => {
    const prefs = NotificationPreferences.create({
      userId: 'user-1',
      quietHours: { start: '22:00', end: '07:00', timezoneOffsetMinutes: 0 },
    }).getValue();
    const router = new NotificationRouter({
      presenceLink: { isOnline: () => false },
      digestStrategy: new DigestAggregationStrategy({ threshold: 3 }),
      clock: { now: () => new Date('2026-05-22T23:30:00.000Z') },
    });

    const route = router.route({ notification: makeNotification({ priority: 'high' }), preferences: prefs });

    assert.deepEqual(route.immediateChannels, ['push', 'email']);
  });

  it('deve enviar para digest quando estrategia agregar o tipo', () => {
    const prefs = NotificationPreferences.create({
      userId: 'user-1',
      digestByCategory: { marketing: true },
    }).getValue();
    const router = new NotificationRouter({
      presenceLink: { isOnline: () => false },
      digestStrategy: new DigestAggregationStrategy({ threshold: 2 }),
      clock: { now: () => new Date('2026-05-22T12:00:00.000Z') },
    });

    const route = router.route({
      notification: makeNotification({ category: 'marketing', channels: ['push', 'email'] }),
      preferences: prefs,
    });

    assert.deepEqual(route.digestChannels, ['push', 'email']);
  });
});
