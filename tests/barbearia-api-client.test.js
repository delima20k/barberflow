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

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaApiClient.js'), 'utf8');

// ─── describe 1: presença dos campos de throttle ──────────────────────────────

describe('BarbeariaApiClient — throttle de aviso BFF indisponível', () => {

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

// ─── describe 2: helper #logAviso ────────────────────────────────────────────

describe('BarbeariaApiClient — helper privado #logAviso', () => {

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

// ─── describe 3: substituição dos warns diretos ──────────────────────────────

describe('BarbeariaApiClient — warns diretos substituídos por #logAviso', () => {

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

// ─── describe 4: precisão da chave de cache ──────────────────────────────────

describe('BarbeariaApiClient — precisão de chave de cache para getNearby', () => {

  test('getNearby usa no máximo 3 casas decimais nas coordenadas da chave', () => {
    const idxGetNearby = SRC.indexOf('static async getNearby');
    assert.ok(idxGetNearby > 0, 'getNearby deve existir');
    // Extrai o bloco até a abertura do #comCache
    const bloco = SRC.slice(idxGetNearby, idxGetNearby + 500);

    // Captura o valor N em toFixed(N) para lat e lng
    const matches = [...bloco.matchAll(/\.toFixed\((\d+)\)/g)].map(m => Number(m[1]));
    assert.ok(
      matches.length >= 1,
      'getNearby deve usar .toFixed() ao construir a chave de cache',
    );
    assert.ok(
      matches.every(n => n <= 3),
      `Precisão de ${matches.join('/')} casas decimais é alta demais — usar ≤ 3 para tolerar variação do GPS`,
    );
  });

});

// ─── describe 5: indicador de disponibilidade do BFF ────────────────────────

describe('BarbeariaApiClient — indicador de disponibilidade do BFF', () => {

  test('#bffFalhou existe como campo estático privado', () => {
    assert.ok(
      SRC.includes('#bffFalhou'),
      '#bffFalhou deve existir como flag de estado de disponibilidade do BFF',
    );
  });

  test('bffIndisponivel getter existe no fonte', () => {
    assert.ok(
      SRC.includes('static get bffIndisponivel'),
      'bffIndisponivel deve existir como getter estático público',
    );
  });

  // Fatia o corpo completo de getNearby (até o método seguinte) — janela fixa
  // de N chars quebrava sempre que o método crescia (ex: bloco Supabase primário).
  function blocoGetNearby() {
    const inicio = SRC.indexOf('static async getNearby');
    assert.ok(inicio > 0, 'getNearby deve existir');
    const fim = SRC.indexOf('static async getDestaque', inicio);
    return SRC.slice(inicio, fim > inicio ? fim : undefined);
  }

  test('getNearby reseta #bffFalhou para false ao obter sucesso', () => {
    assert.ok(
      blocoGetNearby().includes('#bffFalhou = false'),
      'getNearby deve resetar #bffFalhou para false ao receber resposta de sucesso',
    );
  });

  test('getNearby marca #bffFalhou como true ao falhar', () => {
    assert.ok(
      blocoGetNearby().includes('#bffFalhou = true'),
      'getNearby deve marcar #bffFalhou como true quando todas as fontes falham',
    );
  });

  test('getDestaque e getTodas também definem #bffFalhou', () => {
    const idxDest  = SRC.indexOf('static async getDestaque');
    const idxTodas = SRC.indexOf('static async getTodas');
    assert.ok(idxDest  > 0, 'getDestaque deve existir');
    assert.ok(idxTodas > 0, 'getTodas deve existir');
    const blocoD = SRC.slice(idxDest,  idxDest  + 600);
    const blocoT = SRC.slice(idxTodas, idxTodas + 600);
    assert.ok(
      blocoD.includes('#bffFalhou') && blocoT.includes('#bffFalhou'),
      'getDestaque e getTodas devem definir #bffFalhou para manter indicador global coerente',
    );
  });

});
