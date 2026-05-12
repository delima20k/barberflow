'use strict';
/**
 * tests/queue-modal-payload-builder.test.js
 *
 * Testa QueueModalPayloadBuilder: geração de config-objects para FluxoDeFila.
 *
 * Cenários cobertos:
 *   montarPayloadPosicao — retorna config com posição correta no corpo
 *   montarPayloadPosicao — inclui nomeBarbearia quando fornecido
 *   montarPayloadPosicao — sanitiza nomeBarbearia contra XSS
 *   montarPayloadProximoNaFila — retorna config com texto de "próximo"
 *   montarPayloadProximoNaFila — inclui nomeBarbearia quando fornecido
 *   montarPayloadToast — retorna config enxuto (sem acoes)
 *   montarPayloadToast — posição 1 → texto "próximo"
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── Factory da sandbox VM ───────────────────────────────────────────────────

function criarSandbox() {
  const sandbox = vm.createContext({ console });

  // Stub mínimo de FluxoDeFila — só precisa do escapar()
  sandbox.FluxoDeFila = {
    escapar: (str) => String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;'),
  };

  carregar(sandbox, 'shared/js/QueueModalPayloadBuilder.js');
  return sandbox;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

suite('QueueModalPayloadBuilder — montarPayloadPosicao', () => {
  test('retorna config com posição no corpo', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(3);
    assert.ok(config.corpo.includes('3'), 'corpo deve conter a posição');
    assert.ok(Array.isArray(config.acoes), 'deve ter acoes');
    assert.ok(typeof config.titulo === 'string' && config.titulo.length > 0, 'deve ter titulo');
  });

  test('inclui nomeBarbearia no corpo quando fornecido', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2, { nomeBarbearia: 'Barbearia Top' });
    assert.ok(config.corpo.includes('Barbearia Top'), 'corpo deve conter o nome da barbearia');
  });

  test('sanitiza nomeBarbearia contra XSS', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2, { nomeBarbearia: '<script>xss</script>' });
    assert.ok(!config.corpo.includes('<script>'), 'XSS não deve passar bruto');
    assert.ok(config.corpo.includes('&lt;script&gt;'), 'deve estar escapado');
  });

  test('posicao 1 exibe texto de próximo na fila (sem o número)', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(1);
    // Nova spec: posição 1 usa "próximo da fila" em vez de mostrar o número
    const texto = (config.titulo + config.corpo).toLowerCase();
    assert.ok(
      texto.includes('próximo') || texto.includes('proximo'),
      'corpo deve mencionar que o cliente é o próximo da fila',
    );
  });
});

suite('QueueModalPayloadBuilder — montarPayloadProximoNaFila', () => {
  test('retorna config com texto de próximo na fila', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadProximoNaFila();
    assert.ok(typeof config.titulo === 'string' && config.titulo.length > 0);
    assert.ok(typeof config.corpo  === 'string' && config.corpo.length  > 0);
    assert.ok(Array.isArray(config.acoes));
    // Deve indicar que é o próximo
    const textoGeral = (config.titulo + config.corpo).toLowerCase();
    assert.ok(
      textoGeral.includes('próximo') || textoGeral.includes('vez'),
      'deve mencionar próximo ou vez'
    );
  });

  test('inclui nomeBarbearia quando fornecido', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadProximoNaFila({ nomeBarbearia: 'Studio X' });
    assert.ok(config.corpo.includes('Studio X') || config.titulo.includes('Studio X'));
  });
});

suite('QueueModalPayloadBuilder — montarPayloadToast', () => {
  test('retorna config enxuto (sem acoes ou acoes vazio)', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadToast(3);
    assert.ok(!config.acoes || config.acoes.length === 0, 'toast não tem acoes');
    assert.ok(typeof config.corpo === 'string' && config.corpo.length > 0);
  });

  test('posicao 1 produz texto de próximo no toast', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadToast(1);
    const texto = (config.titulo ?? '' + config.corpo).toLowerCase();
    assert.ok(
      texto.includes('próximo') || texto.includes('vez') || texto.includes('1'),
      'deve indicar posição 1'
    );
  });
});
