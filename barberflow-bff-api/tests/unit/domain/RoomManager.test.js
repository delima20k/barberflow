'use strict';

const { describe, it, before }  = require('node:test');
const assert                     = require('node:assert/strict');

const { RoomManager }            = require('../../../domain/realtime/RoomManager');

describe('RoomManager', () => {
  let manager;

  before(() => {
    manager = new RoomManager({ maxConnPerChannel: 3 });
  });

  describe('join()', () => {
    it('adiciona connectionId ao canal e retorna ok=true', () => {
      const result = manager.join('fila.shop1', 'conn-1');
      assert.equal(result.ok, true);
      assert.equal(manager.isMember('fila.shop1', 'conn-1'), true);
    });

    it('é idempotente — re-join do mesmo connectionId retorna ok=true sem duplicar', () => {
      manager.join('fila.shop1', 'conn-1');
      manager.join('fila.shop1', 'conn-1');
      assert.equal(manager.roomSize('fila.shop1'), 1);
    });

    it('aceita múltiplos connectionIds no mesmo canal', () => {
      manager.join('fila.shop1', 'conn-2');
      manager.join('fila.shop1', 'conn-3');
      assert.equal(manager.roomSize('fila.shop1'), 3);
    });

    it('rejeita quando canal atinge limite (maxConnPerChannel=3)', () => {
      const result = manager.join('fila.shop1', 'conn-4');
      assert.equal(result.ok, false);
      assert.match(result.error, /limite/);
      assert.equal(manager.roomSize('fila.shop1'), 3);
    });

    it('permite join em canal diferente sem afetar o original', () => {
      const result = manager.join('fila.shop2', 'conn-4');
      assert.equal(result.ok, true);
      assert.equal(manager.roomSize('fila.shop2'), 1);
      assert.equal(manager.roomSize('fila.shop1'), 3);
    });
  });

  describe('leave()', () => {
    it('remove connectionId do canal', () => {
      manager.leave('fila.shop1', 'conn-2');
      assert.equal(manager.isMember('fila.shop1', 'conn-2'), false);
      assert.equal(manager.roomSize('fila.shop1'), 2);
    });

    it('remove a entrada do Map quando sala fica vazia', () => {
      const m = new RoomManager();
      m.join('presence.x', 'c1');
      m.leave('presence.x', 'c1');
      assert.equal(m.roomCount, 0);
    });

    it('não lança erro se connectionId não está no canal', () => {
      assert.doesNotThrow(() => manager.leave('fila.shop1', 'conn-inexistente'));
    });

    it('não lança erro se canal não existe', () => {
      assert.doesNotThrow(() => manager.leave('canal-inexistente', 'conn-1'));
    });
  });

  describe('leaveAll()', () => {
    it('remove connectionId de todos os canais e retorna lista dos afetados', () => {
      const m = new RoomManager();
      m.join('fila.a', 'multi');
      m.join('fila.b', 'multi');
      m.join('notificacoes.u1', 'multi');

      const affected = m.leaveAll('multi');
      assert.equal(affected.length, 3);
      assert.equal(m.roomCount, 0);
    });

    it('retorna lista vazia se connectionId não está em nenhum canal', () => {
      const m = new RoomManager();
      const affected = m.leaveAll('nao-existe');
      assert.deepEqual(affected, []);
    });
  });

  describe('getMembers()', () => {
    it('retorna Set imutável com os membros do canal', () => {
      const m = new RoomManager();
      m.join('fila.test', 'c1');
      m.join('fila.test', 'c2');
      const members = m.getMembers('fila.test');
      assert.equal(members.size, 2);
      assert.equal(members.has('c1'), true);
    });

    it('retorna Set vazio para canal inexistente', () => {
      const members = manager.getMembers('canal-nao-existe');
      assert.equal(members.size, 0);
    });
  });

  describe('snapshot()', () => {
    it('retorna mapa com contagens de todos os canais ativos', () => {
      const m = new RoomManager();
      m.join('fila.s1', 'a');
      m.join('fila.s1', 'b');
      m.join('fila.s2', 'c');
      const snap = m.snapshot();
      assert.equal(snap['fila.s1'], 2);
      assert.equal(snap['fila.s2'], 1);
    });
  });

  describe('roomCount', () => {
    it('reflete o número de canais com ao menos uma conexão', () => {
      const m = new RoomManager();
      assert.equal(m.roomCount, 0);
      m.join('ch.1', 'c1');
      m.join('ch.2', 'c2');
      assert.equal(m.roomCount, 2);
      m.leave('ch.1', 'c1');
      assert.equal(m.roomCount, 1);
    });
  });
});
