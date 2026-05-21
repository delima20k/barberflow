'use strict';

const { describe, it } = require('node:test');
const assert            = require('node:assert/strict');

const { PresenceService } = require('../../../domain/realtime/PresenceService');

describe('PresenceService', () => {
  describe('track()', () => {
    it('retorna true (isNewPresence) no primeiro join do userId no canal', () => {
      const svc    = new PresenceService();
      const isNew  = svc.track('fila.shop1', 'user-1', 'conn-1');
      assert.equal(isNew, true);
    });

    it('retorna false quando userId já tem outra conexão no canal', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      const isNew = svc.track('fila.shop1', 'user-1', 'conn-2');
      assert.equal(isNew, false);
    });

    it('marca o usuário como presente no canal', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      assert.equal(svc.isPresent('fila.shop1', 'user-1'), true);
    });

    it('múltiplos usuários distintos são contados individualmente', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-A', 'conn-A');
      svc.track('fila.shop1', 'user-B', 'conn-B');
      assert.equal(svc.presenceCount('fila.shop1'), 2);
    });
  });

  describe('untrack()', () => {
    it('retorna true (isGone) quando última conexão do userId é removida', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      const isGone = svc.untrack('fila.shop1', 'user-1', 'conn-1');
      assert.equal(isGone, true);
      assert.equal(svc.isPresent('fila.shop1', 'user-1'), false);
    });

    it('retorna false quando usuário ainda tem outra conexão ativa', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      svc.track('fila.shop1', 'user-1', 'conn-2');
      const isGone = svc.untrack('fila.shop1', 'user-1', 'conn-1');
      assert.equal(isGone, false);
      assert.equal(svc.isPresent('fila.shop1', 'user-1'), true);
    });

    it('limpa entrada do canal quando fica sem usuários', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      svc.untrack('fila.shop1', 'user-1', 'conn-1');
      assert.equal(svc.presenceCount('fila.shop1'), 0);
    });

    it('não lança erro se connectionId não existe no canal', () => {
      const svc = new PresenceService();
      svc.track('fila.shop1', 'user-1', 'conn-1');
      assert.doesNotThrow(() => svc.untrack('fila.shop1', 'user-1', 'conn-inexistente'));
    });

    it('não lança erro se canal não existe', () => {
      const svc = new PresenceService();
      assert.doesNotThrow(() => svc.untrack('canal-nao-existe', 'user-1', 'conn-1'));
    });
  });

  describe('untrackAll()', () => {
    it('remove conexão de todos os canais e retorna canais onde ficou sem presença', () => {
      const svc = new PresenceService();
      svc.track('fila.a',          'user-1', 'conn-1');
      svc.track('fila.b',          'user-1', 'conn-1');
      svc.track('notificacoes.u1', 'user-1', 'conn-1');

      const departed = svc.untrackAll('user-1', 'conn-1');
      assert.equal(departed.length, 3);
      assert.equal(svc.isPresent('fila.a', 'user-1'), false);
    });

    it('não remove canais onde userId ainda tem outra conexão', () => {
      const svc = new PresenceService();
      svc.track('fila.a', 'user-1', 'conn-1');
      svc.track('fila.a', 'user-1', 'conn-2'); // segunda conexão
      svc.track('fila.b', 'user-1', 'conn-1');

      const departed = svc.untrackAll('user-1', 'conn-1');

      // fila.b: sem mais conexões → departed
      assert.ok(departed.includes('fila.b'));
      // fila.a: ainda tem conn-2 → NÃO departed
      assert.ok(!departed.includes('fila.a'));
      assert.equal(svc.isPresent('fila.a', 'user-1'), true);
    });

    it('retorna lista vazia se userId não está em nenhum canal', () => {
      const svc      = new PresenceService();
      const departed = svc.untrackAll('nao-existe', 'conn-x');
      assert.deepEqual(departed, []);
    });
  });

  describe('getPresence()', () => {
    it('retorna Set com todos os userIds presentes no canal', () => {
      const svc = new PresenceService();
      svc.track('presence.shop1', 'user-A', 'c1');
      svc.track('presence.shop1', 'user-B', 'c2');
      const presence = svc.getPresence('presence.shop1');
      assert.equal(presence.size, 2);
      assert.ok(presence.has('user-A'));
      assert.ok(presence.has('user-B'));
    });

    it('retorna Set vazio para canal sem presença', () => {
      const svc = new PresenceService();
      assert.equal(svc.getPresence('nao-existe').size, 0);
    });
  });

  describe('snapshot()', () => {
    it('retorna mapa com listas de userIds por canal', () => {
      const svc = new PresenceService();
      svc.track('fila.s1', 'u1', 'c1');
      svc.track('fila.s1', 'u2', 'c2');
      svc.track('fila.s2', 'u3', 'c3');

      const snap = svc.snapshot();
      assert.equal(snap['fila.s1'].length, 2);
      assert.equal(snap['fila.s2'].length, 1);
    });
  });
});
