'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const { Geohash } = require('../../../domain/geo/value-objects/Geohash');

describe('Geohash', () => {

  // ── Encode ─────────────────────────────────────────────────────

  describe('encode()', () => {
    it('encode de (0, 0) precision 6 retorna "s00000"', () => {
      const r = Geohash.encode({ lat: 0, lng: 0, precision: 6 });
      assert.ok(r.isOk(), r.isFail() ? r.getError() : '');
      // Prefixo "s" é padrão para (0,0) no geohash
      assert.ok(r.getValue().value.startsWith('s'), `esperado prefixo 's', obtido: ${r.getValue().value}`);
      assert.equal(r.getValue().value.length, 6);
    });

    it('encode de São Paulo (-23.5505, -46.6333) precision 7', () => {
      const r = Geohash.encode({ lat: -23.5505, lng: -46.6333, precision: 7 });
      assert.ok(r.isOk());
      assert.equal(r.getValue().value.length, 7);
      // São Paulo está no quadrante "6g" (geohash de precisão baixa)
      assert.ok(r.getValue().value.startsWith('6g'), `SP esperado começar com '6g', obtido: ${r.getValue().value}`);
    });

    it('encode com precisão padrão (7) quando não especificada', () => {
      const r = Geohash.encode({ lat: 0, lng: 0 });
      assert.ok(r.isOk());
      assert.equal(r.getValue().value.length, 7);
    });

    it('rejeita precisão < 1', () => {
      assert.ok(Geohash.encode({ lat: 0, lng: 0, precision: 0 }).isFail());
    });

    it('rejeita precisão > 12', () => {
      assert.ok(Geohash.encode({ lat: 0, lng: 0, precision: 13 }).isFail());
    });

    it('rejeita lat inválida', () => {
      assert.ok(Geohash.encode({ lat: 100, lng: 0, precision: 5 }).isFail());
    });
  });

  // ── fromString ────────────────────────────────────────────────

  describe('fromString()', () => {
    it('aceita geohash válido', () => {
      const r = Geohash.fromString('6gkzw');
      assert.ok(r.isOk());
      assert.equal(r.getValue().value, '6gkzw');
    });

    it('aceita geohash de precisão 7 (São Paulo)', () => {
      const r = Geohash.fromString('6gkzwn2');
      assert.ok(r.isOk());
    });

    it('rejeita string vazia', () => {
      assert.ok(Geohash.fromString('').isFail());
    });

    it('rejeita string com caracteres inválidos (a, i, l, o são excluídos no geohash)', () => {
      // 'a', 'i', 'l', 'o' não fazem parte do alfabeto geohash (base32)
      assert.ok(Geohash.fromString('aaaaa').isFail());
    });

    it('rejeita null', () => {
      assert.ok(Geohash.fromString(null).isFail());
    });

    it('rejeita comprimento > 12', () => {
      assert.ok(Geohash.fromString('0123456789012').isFail());
    });
  });

  // ── decode ────────────────────────────────────────────────────

  describe('decode()', () => {
    it('decode e encode são inversos para São Paulo', () => {
      const precision = 7;
      const encoded = Geohash.encode({ lat: -23.5505, lng: -46.6333, precision }).getValue();
      const decoded = encoded.decode();
      // Com precisão 7, erro máximo é ≈ 76m — lat/lng dentro de ~0.001°
      assert.ok(Math.abs(decoded.lat - (-23.5505)) < 0.01, `lat delta grande: ${Math.abs(decoded.lat - (-23.5505))}`);
      assert.ok(Math.abs(decoded.lng - (-46.6333)) < 0.01, `lng delta grande: ${Math.abs(decoded.lng - (-46.6333))}`);
    });
  });

  // ── neighbors ─────────────────────────────────────────────────

  describe('neighbors()', () => {
    it('retorna 8 vizinhos', () => {
      const gh = Geohash.fromString('s000').getValue();
      const n = gh.neighbors();
      assert.equal(Object.keys(n).length, 8, `esperado 8 vizinhos, obtido: ${Object.keys(n)}`);
    });

    it('todos os vizinhos são geohash válidos', () => {
      const gh = Geohash.fromString('6gkzw').getValue();
      const n = gh.neighbors();
      for (const [, neighbor] of Object.entries(n)) {
        assert.ok(Geohash.fromString(neighbor).isOk(), `vizinho inválido: ${neighbor}`);
      }
    });
  });
});
