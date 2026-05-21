'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { Track }      = require('../../../domain/geo/entities/Track');
const { Coordinate } = require('../../../domain/geo/value-objects/Coordinate');

// Factories de coordenadas para facilitar testes
const makeCoord = (lat, lng) => Coordinate.create({ lat, lng }).getValue();

const SP  = makeCoord(-23.5505, -46.6333);  // São Paulo
const RJ  = makeCoord(-22.9068, -43.1729);  // Rio de Janeiro (~357 km)

describe('Track', () => {

  describe('construção', () => {
    it('cria track vazio para um userId', () => {
      const t = new Track({ userId: 'user-1' });
      assert.equal(t.userId, 'user-1');
      assert.equal(t.currentPosition, null);
      assert.ok(!t.flaggedSpoof);
    });

    it('lança se userId for vazio', () => {
      assert.throws(() => new Track({ userId: '' }), TypeError);
    });

    it('cria com windowSize customizado', () => {
      const t = new Track({ userId: 'u1', windowSize: 2 });
      assert.equal(t.snapshots.length, 0);
    });
  });

  describe('addPosition()', () => {
    it('adiciona primeira posição sem flagear spoof', () => {
      const t = new Track({ userId: 'u1' });
      const { isFlagged } = t.addPosition(SP, new Date());
      assert.ok(!isFlagged);
      assert.deepEqual(t.currentPosition.toJSON(), SP.toJSON());
    });

    it('não flageia spoof para movimento realista (<1000 km/h)', () => {
      const t = new Track({ userId: 'u1', maxSpeedKmh: 1000 });
      const ts1 = new Date('2024-01-01T00:00:00Z');
      const ts2 = new Date('2024-01-01T01:00:00Z'); // 1 hora depois

      t.addPosition(SP, ts1);
      const { isFlagged } = t.addPosition(RJ, ts2);

      // SP→RJ ≈ 357 km em 1h = 357 km/h → dentro do limite 1000 km/h
      assert.ok(!isFlagged, 'não devia flagear 357 km/h');
    });

    it('flageia spoof para teleporte instantâneo', () => {
      const t = new Track({ userId: 'u1', maxSpeedKmh: 1000 });
      const ts1 = new Date('2024-01-01T00:00:00Z');
      const ts2 = new Date(ts1.getTime() + 1000); // 1 segundo depois

      t.addPosition(SP, ts1);
      const { isFlagged } = t.addPosition(RJ, ts2);

      // SP→RJ ≈ 357 km em 1s = 1.285.200 km/h → SPOOF
      assert.ok(isFlagged, 'devia flagear teleporte');
    });

    it('mantém janela deslizante no tamanho windowSize', () => {
      const t = new Track({ userId: 'u1', windowSize: 2 });
      const ts = new Date();

      t.addPosition(SP, ts);
      t.addPosition(RJ, new Date(ts.getTime() + 3600000));
      t.addPosition(makeCoord(0, 0), new Date(ts.getTime() + 7200000));

      assert.equal(t.snapshots.length, 2, 'janela deve ter no máximo 2 itens');
    });

    it('lança se coordinate não for Coordinate', () => {
      const t = new Track({ userId: 'u1' });
      assert.throws(() => t.addPosition({ lat: 0, lng: 0 }), TypeError);
    });

    it('não flageia quando timestamps são iguais (delta = 0)', () => {
      const t = new Track({ userId: 'u1', maxSpeedKmh: 1 });
      const ts = new Date();
      t.addPosition(SP, ts);
      const { isFlagged } = t.addPosition(RJ, ts); // mesmo timestamp
      assert.ok(!isFlagged, 'delta=0 não deve flagear');
    });
  });

  describe('snapshots()', () => {
    it('retorna cópia — mutação externa não afeta o track', () => {
      const t = new Track({ userId: 'u1' });
      t.addPosition(SP, new Date());
      const snaps = t.snapshots;
      snaps.push({ coordinate: RJ, timestamp: new Date() });
      assert.equal(t.snapshots.length, 1);
    });
  });
});
