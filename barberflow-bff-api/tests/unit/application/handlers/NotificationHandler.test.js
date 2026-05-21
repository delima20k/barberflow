'use strict';

const { describe, it }          = require('node:test');
const assert                    = require('node:assert/strict');
const { NotificationHandler }   = require('../../../../application/handlers/NotificationHandler');
const { Job }                   = require('../../../../application/shared/Job');
const { QUEUES, JOB_TYPES }     = require('../../../../config/queues');

function makeJob(payload = {}) {
  return Job.create({ type: JOB_TYPES.SEND_NOTIFICATION, queue: QUEUES.NOTIFICATIONS, payload }).getValue();
}

describe('NotificationHandler', () => {
  it('lança TypeError se pushService ausente', () => {
    assert.throws(() => new NotificationHandler({ pushService: null }), /pushService/);
  });

  it('jobType é send_notification', () => {
    const h = new NotificationHandler({ pushService: { enviarAoBarbeiro: async () => ({}) } });
    assert.equal(h.jobType, JOB_TYPES.SEND_NOTIFICATION);
  });

  it('handle delega ao pushService com payload correto', async () => {
    let called = null;
    const pushService = {
      enviarAoBarbeiro: async (opts) => { called = opts; return { enviados: 1, invalidas: 0 }; },
    };
    const handler = new NotificationHandler({ pushService });
    const job = makeJob({
      professionalId: 'p1',
      entradaId:      'e1',
      barbershopId:   'b1',
      type:           'client_arrived',
      clienteNome:    'João',
    });

    await handler.handle(job);

    assert.deepEqual(called, { professionalId: 'p1', entradaId: 'e1', barbershopId: 'b1', type: 'client_arrived', clienteNome: 'João' });
  });

  it('handle lança erro se professionalId ausente', async () => {
    const handler = new NotificationHandler({
      pushService: { enviarAoBarbeiro: async () => ({}) },
    });
    const job = makeJob({ type: 'client_arrived' }); // professionalId ausente
    await assert.rejects(() => handler.handle(job), /professionalId/);
  });

  it('handle lança erro se type ausente', async () => {
    const handler = new NotificationHandler({
      pushService: { enviarAoBarbeiro: async () => ({}) },
    });
    const job = makeJob({ professionalId: 'p1' }); // type ausente
    await assert.rejects(() => handler.handle(job), /type/);
  });

  it('propaga erro do pushService', async () => {
    const pushService = { enviarAoBarbeiro: async () => { throw new Error('VAPID falhou'); } };
    const handler = new NotificationHandler({ pushService });
    const job = makeJob({ professionalId: 'p1', type: 'test' });
    await assert.rejects(() => handler.handle(job), /VAPID falhou/);
  });
});
