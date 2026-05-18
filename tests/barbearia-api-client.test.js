'use strict';
/**
 * tests/barbearia-api-client.test.js
 *
 * Validação estática de BarbeariaApiClient.
 *
 * Contexto:
 *   Quando o BFF está indisponível, AppBootstrap chama getNearby, getTodas e
 *   getDestaque em sequência rápida → 3 LoggerService.warn idênticos no console.
 *   A correção introduz um helper privado #logAviso que throttle o aviso para
 *   no máximo 1 por #AVISO_THROTTLE_MS, evitando poluição do console.
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaApiClient.js'), 'utf8');

// ─── suite 1: presença dos campos de throttle ──────────────────────────────

suite('BarbeariaApiClient — throttle de aviso BFF indisponível', () => {

  test('#ultimoAvisoMs existe como campo estático privado', () => {
    assert.ok(
      SRC.includes('#ultimoAvisoMs'),
      '#ultimoAvisoMs deve existir para rastrear o timestamp do último aviso',
    );
  });

  test('#AVISO_THROTTLE_MS existe como constante estática privada', () => {
    assert.ok(
      SRC.includes('#AVISO_THROTTLE_MS'),
      '#AVISO_THROTTLE_MS deve existir como janela de throttle (ex: 60_000ms)',
    );
  });

  test('#AVISO_THROTTLE_MS tem valor positivo', () => {
    // Captura o valor literal: #AVISO_THROTTLE_MS = <número>
    const match = SRC.match(/#AVISO_THROTTLE_MS\s*=\s*([\d_]+)/);
    assert.ok(match, '#AVISO_THROTTLE_MS deve ter valor numérico literal');
    const valor = Number(match[1].replace(/_/g, ''));
    assert.ok(valor > 0, '#AVISO_THROTTLE_MS deve ser um número positivo');
  });

});

// ─── suite 2: helper #logAviso ────────────────────────────────────────────

suite('BarbeariaApiClient — helper privado #logAviso', () => {

  test('#logAviso existe como método estático privado', () => {
    assert.ok(
      SRC.includes('static #logAviso') || SRC.includes('#logAviso('),
      '#logAviso deve existir como método estático privado que centraliza o warn',
    );
  });

  test('#logAviso verifica #ultimoAvisoMs antes de logar', () => {
    const idxMetodo = SRC.indexOf('static #logAviso');
    assert.ok(idxMetodo > 0, '#logAviso deve existir no fonte');
    const bloco = SRC.slice(idxMetodo, idxMetodo + 400);
    assert.ok(
      bloco.includes('#ultimoAvisoMs'),
      '#logAviso deve ler/atualizar #ultimoAvisoMs para controlar o throttle',
    );
  });

  test('#logAviso usa LoggerService.warn para registrar o aviso', () => {
    const idxMetodo = SRC.indexOf('static #logAviso');
    assert.ok(idxMetodo > 0, '#logAviso deve ser método estático');
    const bloco = SRC.slice(idxMetodo, idxMetodo + 400);
    assert.ok(
      bloco.includes('LoggerService.warn'),
      '#logAviso deve chamar LoggerService.warn (não suprimir o aviso)',
    );
  });

});

// ─── suite 3: substituição dos warns diretos ──────────────────────────────

suite('BarbeariaApiClient — warns diretos substituídos por #logAviso', () => {

  test('getNearby não chama LoggerService.warn diretamente', () => {
    const idxGetNearby = SRC.indexOf('static async getNearby');
    assert.ok(idxGetNearby > 0, 'getNearby deve existir');
    const bloco = SRC.slice(idxGetNearby, idxGetNearby + 600);
    assert.ok(
      !bloco.includes("LoggerService.warn('[BarbeariaApiClient] getNearby"),
      'getNearby deve usar #logAviso em vez de LoggerService.warn direto',
    );
  });

  test('getDestaque não chama LoggerService.warn diretamente', () => {
    const idxGetDestaque = SRC.indexOf('static async getDestaque');
    assert.ok(idxGetDestaque > 0, 'getDestaque deve existir');
    const bloco = SRC.slice(idxGetDestaque, idxGetDestaque + 600);
    assert.ok(
      !bloco.includes("LoggerService.warn('[BarbeariaApiClient] getDestaque"),
      'getDestaque deve usar #logAviso em vez de LoggerService.warn direto',
    );
  });

  test('getTodas não chama LoggerService.warn diretamente', () => {
    const idxGetTodas = SRC.indexOf('static async getTodas');
    assert.ok(idxGetTodas > 0, 'getTodas deve existir');
    const bloco = SRC.slice(idxGetTodas, idxGetTodas + 600);
    assert.ok(
      !bloco.includes("LoggerService.warn('[BarbeariaApiClient] getTodas"),
      'getTodas deve usar #logAviso em vez de LoggerService.warn direto',
    );
  });

});
