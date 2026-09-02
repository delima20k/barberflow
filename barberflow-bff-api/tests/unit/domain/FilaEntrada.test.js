'use strict';

const { describe, it } = require('node:test');
const assert            = require('node:assert/strict');
const { FilaEntrada }   = require('../../../domain/fila/FilaEntrada');

const BASE = { id: 'e1', barbershopId: 'shop-1', posicao: 1 };

describe('FilaEntrada.create', () => {
  it('cria entrada com clienteId (cliente com conta)', () => {
    const r = FilaEntrada.create({ ...BASE, clienteId: 'cliente-1' });
    assert.equal(r.isOk(), true);
    const entrada = r.getValue();
    assert.equal(entrada.clienteId, 'cliente-1');
    assert.equal(entrada.guestName, null);
    assert.equal(entrada.isGuest, false);
  });

  it('cria entrada guest com guestName e guestPhone (sem clienteId)', () => {
    const r = FilaEntrada.create({ ...BASE, guestName: '  Alan  ', guestPhone: '11999998888' });
    assert.equal(r.isOk(), true);
    const entrada = r.getValue();
    assert.equal(entrada.clienteId, null);
    assert.equal(entrada.guestName, 'Alan');
    assert.equal(entrada.guestPhone, '11999998888');
    assert.equal(entrada.isGuest, true);
  });

  it('falha sem clienteId e sem guestName', () => {
    const r = FilaEntrada.create({ ...BASE });
    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /clienteId ou guestName/);
  });

  it('falha com guestName só espaços em branco', () => {
    const r = FilaEntrada.create({ ...BASE, guestName: '   ' });
    assert.equal(r.isFail(), true);
  });

  it('falha sem id', () => {
    const r = FilaEntrada.create({ barbershopId: 'shop-1', posicao: 1, guestName: 'Alan' });
    assert.equal(r.isFail(), true);
  });

  it('falha com posicao inválida', () => {
    const r = FilaEntrada.create({ ...BASE, guestName: 'Alan', posicao: 0 });
    assert.equal(r.isFail(), true);
  });
});

describe('FilaEntrada.reconstitute', () => {
  it('reconstitui entrada guest a partir de dados persistidos', () => {
    const r = FilaEntrada.reconstitute({
      id: 'e1', barbershopId: 'shop-1', clienteId: null,
      guestName: 'Alan', guestPhone: null, profissionalId: 'prof-1',
      posicao: 2, status: 'waiting', clienteConfirmado: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().guestName, 'Alan');
    assert.equal(r.getValue().isGuest, true);
  });
});
