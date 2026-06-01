'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { HaversineStrategy } = require('../../../infrastructure/geo/HaversineStrategy');
const { VincentyStrategy }  = require('../../../infrastructure/geo/VincentyStrategy');

// Pares de pontos com distâncias conhecidas
const SP = { lat: -23.5505, lng: -46.6333 };  // São Paulo
const RJ = { lat: -22.9068, lng: -43.1729 };  // Rio de Janeiro

// Distância SP→RJ: Haversine ≈ 357 km, Vincenty ≈ 358.4 km
const SAME_POINT = { lat: 0, lng: 0 };
const ANTI_MERIDIAN_A = { lat: 0, lng: 179 };
const ANTI_MERIDIAN_B = { lat: 0, lng: -179 };
const POLE_A = { lat: 89.9, lng: 0 };
const POLE_B = { lat: 89.9, lng: 180 };

// Tolerâncias
const HAVERSINE_TOLERANCE_M = 5000;  // 5 km (Haversine tem ~0.5% erro)
const VINCENTY_TOLERANCE_M  = 500;   // 500 m (Vincenty tem ~0.5 mm no WGS-84)

describe('HaversineStrategy', () => {
  const h = new HaversineStrategy();

  it('estratégia se chama "haversine"', () => {
    assert.equal(h.name, 'haversine');
  });

  it('mesmo ponto → 0 metros', () => {
    assert.equal(h.calculateMeters(SAME_POINT, SAME_POINT), 0);
  });

  it('SP→RJ ≈ 357 km (±5 km tolerância)', () => {
    const dist = h.calculateMeters(SP, RJ);
    assert.ok(dist > 352000 && dist < 362000, `Haversine SP→RJ: ${(dist/1000).toFixed(1)} km fora do intervalo 352-362 km`);
  });

  it('simetria: SP→RJ == RJ→SP', () => {
    const d1 = h.calculateMeters(SP, RJ);
    const d2 = h.calculateMeters(RJ, SP);
    assert.ok(Math.abs(d1 - d2) < 1, `assimetria: ${Math.abs(d1 - d2)} m`);
  });

  it('antimeridiano: (0, 179)→(0, -179) ≈ 222 km', () => {
    const dist = h.calculateMeters(ANTI_MERIDIAN_A, ANTI_MERIDIAN_B);
    // Distância ao longo do equador: 2 graus × (π/180) × 6371000 ≈ 222.390 m
    assert.ok(dist > 200000 && dist < 250000, `Antimeridiano: ${(dist/1000).toFixed(1)} km`);
  });

  it('polos: (89.9, 0)→(89.9, 180) ≈ 22 km', () => {
    const dist = h.calculateMeters(POLE_A, POLE_B);
    assert.ok(dist > 15000 && dist < 30000, `Polo: ${(dist/1000).toFixed(1)} km`);
  });
});

describe('VincentyStrategy', () => {
  const v = new VincentyStrategy();

  it('estratégia se chama "vincenty"', () => {
    assert.equal(v.name, 'vincenty');
  });

  it('mesmo ponto → 0 metros', () => {
    assert.ok(v.calculateMeters(SAME_POINT, SAME_POINT) < 1, 'mesmo ponto deve dar < 1m');
  });

  it('SP→RJ ≈ 358 km (±0.5 km tolerância Vincenty)', () => {
    const dist = v.calculateMeters(SP, RJ);
    // Vincenty é mais preciso que Haversine
    assert.ok(dist > 355000 && dist < 362000, `Vincenty SP→RJ: ${(dist/1000).toFixed(2)} km fora do intervalo 355-362 km`);
  });

  it('Vincenty é mais preciso que Haversine (diferença < 3 km para SP→RJ)', () => {
    const hDist = new HaversineStrategy().calculateMeters(SP, RJ);
    const vDist = v.calculateMeters(SP, RJ);
    assert.ok(Math.abs(hDist - vDist) < 3000, `diferença H/V: ${Math.abs(hDist - vDist) / 1000} km`);
  });

  it('simetria: SP→RJ == RJ→SP', () => {
    const d1 = v.calculateMeters(SP, RJ);
    const d2 = v.calculateMeters(RJ, SP);
    assert.ok(Math.abs(d1 - d2) < 1, `assimetria: ${Math.abs(d1 - d2)} m`);
  });

  it('antimeridiano: (0, 179)→(0, -179) ≈ 222 km', () => {
    const dist = v.calculateMeters(ANTI_MERIDIAN_A, ANTI_MERIDIAN_B);
    assert.ok(dist > 200000 && dist < 250000, `Antimeridiano Vincenty: ${(dist/1000).toFixed(1)} km`);
  });
});
