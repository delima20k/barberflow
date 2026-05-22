'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { Notification } = require('../../../../domain/notifications/entities/Notification');
const { NotificationTemplate } = require('../../../../domain/notifications/entities/NotificationTemplate');
const { TemplateRenderer } = require('../../../../application/notifications/TemplateRenderer');
const { PushChannel } = require('../../../../application/notifications/channels/PushChannel');
const { EmailChannel } = require('../../../../application/notifications/channels/EmailChannel');
const { InAppChannel } = require('../../../../application/notifications/channels/InAppChannel');
const { SmsChannel } = require('../../../../application/notifications/channels/SmsChannel');

function makeNotification() {
  return Notification.create({
    id: 'notif-1',
    userId: 'user-1',
    templateId: 'queue.arrived',
    category: 'queue',
    priority: 'high',
    channels: ['push', 'email', 'in_app', 'sms'],
    data: { clienteNome: 'Ana' },
  }).getValue();
}

function makeRendered() {
  const template = NotificationTemplate.create({
    id: 'queue.arrived',
    category: 'queue',
    channels: {
      push: { title: { 'pt-BR': 'Chegada de {{clienteNome}}' }, body: { 'pt-BR': '{{clienteNome}} chegou.' } },
      email: { title: { 'pt-BR': 'Email {{clienteNome}}' }, body: { 'pt-BR': 'Corpo {{clienteNome}}' } },
      in_app: { title: { 'pt-BR': 'App {{clienteNome}}' }, body: { 'pt-BR': 'Feed {{clienteNome}}' } },
      sms: { body: { 'pt-BR': 'SMS {{clienteNome}}' } },
    },
  }).getValue();
  return new TemplateRenderer().render({ template, notification: makeNotification(), locale: 'pt-BR' });
}

describe('DeliveryChannels', () => {
  it('deve entregar push via provider pluggable', async () => {
    const calls = [];
    const channel = new PushChannel({
      pushProvider: { send: async (cmd) => { calls.push(cmd); return { providerMessageId: 'p-1' }; } },
    });

    const result = await channel.send({ notification: makeNotification(), rendered: makeRendered().push });

    assert.deepEqual({ channel: channel.name, ok: result.ok, sent: calls.length }, { channel: 'push', ok: true, sent: 1 });
  });

  it('deve persistir notificacao in_app sem provider externo', async () => {
    const saved = [];
    const channel = new InAppChannel({ notificationRepository: { saveInApp: async (row) => saved.push(row) } });

    const result = await channel.send({ notification: makeNotification(), rendered: makeRendered().in_app });

    assert.deepEqual({ ok: result.ok, saved: saved.length }, { ok: true, saved: 1 });
  });

  it('deve entregar email e sms por adapters sem tocar regra de negocio', async () => {
    const deliveries = [];
    const email = new EmailChannel({ emailProvider: { send: async (cmd) => deliveries.push(['email', cmd]) } });
    const sms = new SmsChannel({ smsProvider: { send: async (cmd) => deliveries.push(['sms', cmd]) } });

    await email.send({ notification: makeNotification(), rendered: makeRendered().email });
    await sms.send({ notification: makeNotification(), rendered: makeRendered().sms });

    assert.deepEqual(deliveries.map(([name]) => name), ['email', 'sms']);
  });

  it('deve marcar endpoint invalido quando provider retorna bounce permanente', async () => {
    const suppressed = [];
    const channel = new PushChannel({
      pushProvider: { send: async () => ({ ok: false, permanentFailure: true, endpoint: 'ep-1' }) },
      notificationRepository: { suppressEndpoint: async (endpoint, reason) => suppressed.push({ endpoint, reason }) },
    });

    const result = await channel.send({ notification: makeNotification(), rendered: makeRendered().push });

    assert.deepEqual({ ok: result.ok, suppressed }, { ok: false, suppressed: [{ endpoint: 'ep-1', reason: 'permanent_failure' }] });
  });
});
