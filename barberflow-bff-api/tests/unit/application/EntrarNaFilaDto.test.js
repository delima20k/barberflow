'use strict';

const { describe, it } = require('node:test');
const assert            = require('node:assert/strict');
const { EntrarNaFilaDto } = require('../../../application/fila/dto/EntrarNaFilaDto');

const SHOP  = '11111111-1111-1111-1111-111111111111';
const PROF  = '22222222-2222-2222-2222-222222222222';
const CLI   = '33333333-3333-3333-3333-333333333333';
const SERV  = '44444444-4444-4444-4444-444444444444';

describe('EntrarNaFilaDto.create — cliente logado', () => {
  it('aceita clienteId sem guestName', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, clienteId: CLI });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().clienteId, CLI);
    assert.equal(r.getValue().guestName, null);
  });
});

describe('EntrarNaFilaDto.create — visitante (guest)', () => {
  it('aceita guestName sem clienteId', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan' });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().clienteId, null);
    assert.equal(r.getValue().guestName, 'Alan');
  });

  it('aceita guestPhone em formatos plausíveis', () => {
    for (const telefone of ['11999998888', '(11) 99999-8888', '+55 11 99999-8888']) {
      const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', guestPhone: telefone });
      assert.equal(r.isOk(), true, `deveria aceitar "${telefone}"`);
    }
  });

  it('guestPhone é opcional', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan' });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().guestPhone, null);
  });

  it('rejeita guestPhone com poucos dígitos', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', guestPhone: '123' });
    assert.equal(r.isFail(), true);
  });

  it('rejeita guestPhone com caracteres inválidos', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', guestPhone: 'abc@def.com' });
    assert.equal(r.isFail(), true);
  });

  it('rejeita guestName vazio', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: '   ' });
    assert.equal(r.isFail(), true);
  });

  it('rejeita guestName maior que 80 caracteres', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'a'.repeat(81) });
    assert.equal(r.isFail(), true);
  });

  it('rejeita sem clienteId e sem guestName', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP });
    assert.equal(r.isFail(), true);
    assert.match(r.getError(), /clienteId ou guestName/);
  });
});

describe('EntrarNaFilaDto.create — campos comuns', () => {
  it('rejeita barbershopId ausente/inválido', () => {
    assert.equal(EntrarNaFilaDto.create({ guestName: 'Alan' }).isFail(), true);
    assert.equal(EntrarNaFilaDto.create({ barbershopId: 'nao-uuid', guestName: 'Alan' }).isFail(), true);
  });

  it('rejeita profissionalId com formato inválido', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', profissionalId: 'nao-uuid' });
    assert.equal(r.isFail(), true);
  });

  it('aceita profissionalId ausente (opcional)', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan' });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().profissionalId, null);
  });

  it('aceita serviceIds válidos', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', profissionalId: PROF, serviceIds: [SERV] });
    assert.equal(r.isOk(), true);
    assert.deepEqual(r.getValue().serviceIds, [SERV]);
  });

  it('rejeita serviceIds com UUID inválido', () => {
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', serviceIds: ['nao-uuid'] });
    assert.equal(r.isFail(), true);
  });

  it('rejeita props ausentes', () => {
    assert.equal(EntrarNaFilaDto.create(null).isFail(), true);
    assert.equal(EntrarNaFilaDto.create(undefined).isFail(), true);
  });

  it('ignora client_id malicioso implícito — DTO não tem esse campo', () => {
    // Garante que o DTO não aceita nenhum outro alias de clienteId vindo de fora.
    const r = EntrarNaFilaDto.create({ barbershopId: SHOP, guestName: 'Alan', client_id: CLI });
    assert.equal(r.isOk(), true);
    assert.equal(r.getValue().clienteId, null);
  });
});
