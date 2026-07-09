'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const ENTRY_ID = 'e0000000-0000-4000-8000-000000000001';
const SHOP_ID = 'b0000000-0000-4000-8000-000000000001';
const PROFESSIONAL_ID = 'a0000000-0000-4000-8000-000000000001';

describe('QueueWidget._chamar — promoção centralizada para produção', () => {
  test('delega ao CadeiraService para garantir o push 0→1', async () => {
    const promoverParaProducao = fn().mockResolvedValue({ id: ENTRY_ID, status: 'in_service' });
    const sandbox = vm.createContext({
      console,
      CadeiraService: { promoverParaProducao },
      QueueRepository: {
        updateStatus: fn().mockRejectedValue(new Error('não deve acessar diretamente')),
      },
      LoggerService: { error: fn(), warn: fn() },
    });
    carregar(sandbox, 'apps/profissional/assets/js/pages/QueueWidget.js');

    await sandbox.QueueWidget._chamar(ENTRY_ID, SHOP_ID, PROFESSIONAL_ID);

    assert.equal(promoverParaProducao.calls.length, 1);
    assert.deepEqual(
      JSON.parse(JSON.stringify(promoverParaProducao.calls[0][0])),
      {
        entradaId: ENTRY_ID,
        barbershopId: SHOP_ID,
        professionalId: PROFESSIONAL_ID,
        clientConfirmed: 'yes',
      },
    );
  });
});
