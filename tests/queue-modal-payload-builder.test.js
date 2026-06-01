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

const { describe, test } = require('node:test');
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

// ─── describe ───────────────────────────────────────────────────────────────────

describe('QueueModalPayloadBuilder — montarPayloadPosicao', () => {
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

  test('posicao 2 gera texto de "2º lugar" sem barbearia', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2);
    assert.ok(config.corpo.includes('2'), 'corpo deve conter 2');
    assert.ok(
      config.corpo.includes('2º') || config.corpo.includes('lugar') || config.corpo.includes('próximos'),
      'corpo deve mencionar posição de segundo ou "próximos"',
    );
    // Não deve conter fragmento de barbearia quando não fornecido
    assert.ok(!config.corpo.includes('na <strong>'), 'não deve conter shopPart sem barbearia');
  });
});

describe('QueueModalPayloadBuilder — montarPayloadProximoNaFila', () => {
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

describe('QueueModalPayloadBuilder — montarPayloadToast', () => {
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

describe('QueueModalPayloadBuilder — montarPayloadPosicao (enriquecido)', () => {

  test('inclui posicaoAnterior → posicao no corpo quando posicaoAnterior fornecido', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2, { posicaoAnterior: 4 });
    assert.ok(config.corpo.includes('4'), 'corpo deve conter posição anterior');
    assert.ok(config.corpo.includes('2'), 'corpo deve conter nova posição');
  });

  test('não inclui bloco de movimentação quando posicaoAnterior ausente', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2);
    // Não deve ter seta de movimentação sem posicaoAnterior
    assert.ok(!config.corpo.includes('→'), 'não deve incluir seta sem posicaoAnterior');
  });

  test('inclui clienteNome no titulo quando fornecido', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2, { clienteNome: 'Carlos' });
    const textoGeral = config.titulo + config.corpo;
    assert.ok(textoGeral.includes('Carlos'), 'deve personalizar com nome do cliente');
  });

  test('usa iconesDuplos quando shopLogoUrl fornecido', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2, {
      shopLogoUrl: 'https://example.com/logo.png',
    });
    assert.ok(config.iconesDuplos, 'deve ter iconesDuplos quando shopLogoUrl presente');
    assert.ok(config.iconesDuplos.barbearia === 'https://example.com/logo.png');
    assert.ok(!config.icone, 'não deve ter icone simples quando iconesDuplos presente');
  });

  test('usa icone simples quando shopLogoUrl ausente', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2);
    assert.ok(!config.iconesDuplos, 'sem shopLogoUrl não deve ter iconesDuplos');
    assert.ok(typeof config.icone === 'string', 'deve ter icone simples como fallback');
  });

  test('botão de ação tem label "OK"', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(3);
    assert.ok(config.acoes.length > 0, 'deve ter ao menos uma ação');
    assert.equal(config.acoes[0].label, 'OK', 'label do botão deve ser "OK"');
  });

  test('id do overlay definido (proteção contra duplicatas)', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(2);
    assert.ok(typeof config.id === 'string' && config.id.length > 0, 'deve ter id de overlay');
  });

  test('tocarSom true quando posicao === 1', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(1);
    assert.equal(config.tocarSom, true, 'deve tocar som quando é o próximo');
  });

  test('tocarSom ausente/false quando posicao > 1', () => {
    const { QueueModalPayloadBuilder } = criarSandbox();
    const config = QueueModalPayloadBuilder.montarPayloadPosicao(3);
    assert.ok(!config.tocarSom, 'não deve tocar som quando não é o próximo');
  });
});
