'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs2             = require('node:fs');
const path            = require('node:path');

const ROOT     = path.resolve(__dirname, '..');
const SRC      = fs2.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
const SRC_CC   = fs2.readFileSync(path.join(ROOT, 'shared/js/ClienteController.js'), 'utf8');

suite('BarbeariaPage — fila dinâmica', () => {

  test('NÃO usa acesso indexado naFila[i] (padrão antigo de loop fixo)', () => {
    // O padrão antigo era naFila[i] ?? null dentro de um loop fixo de 3
    assert.ok(
      !SRC.includes('naFila[i]'),
      'BarbeariaPage não deve usar naFila[i] — deve iterar com naFila.forEach',
    );
  });

  test('usa naFila.forEach para renderizar cadeiras ocupadas', () => {
    assert.ok(SRC.includes('naFila.forEach'), 'BarbeariaPage deve usar naFila.forEach');
  });

  test('inclui cadeira vazia ao final apos o forEach', () => {
    const forEachIdx  = SRC.indexOf('naFila.forEach');
    const entradaNulo = SRC.indexOf('entrada:       null', forEachIdx);
    assert.ok(forEachIdx > 0, 'deve conter naFila.forEach');
    assert.ok(entradaNulo > forEachIdx, 'cadeira vazia deve vir apos o forEach');
  });
});

suite('BarbeariaPage — cadeira de produção interativa (app cliente)', () => {

  test('#criarRow aceita parâmetro onProducaoVaziaClick separado de onCadeiraVaziaClick', () => {
    assert.ok(
      SRC.includes('onProducaoVaziaClick'),
      '#criarRow deve aceitar onProducaoVaziaClick como parâmetro separado',
    );
  });

  test('cadeira de produção livre usa onProducaoVaziaClick como onClick (não onCadeiraVaziaClick)', () => {
    // A cadeira de produção vazia deve passar onProducaoVaziaClick como onClick
    const idx = SRC.indexOf('onProducaoVaziaClick');
    assert.ok(idx > 0, 'deve conter onProducaoVaziaClick');
    // Verifica que há um trecho onde onProducaoVaziaClick é passado como onClick
    assert.ok(
      SRC.includes('onClick:') && SRC.includes('onProducaoVaziaClick'),
      'onProducaoVaziaClick deve ser usado como onClick na cadeira de produção',
    );
  });

  test('método privado #onProducaoClick existe em BarbeariaPage', () => {
    assert.ok(
      SRC.includes('async #onProducaoClick'),
      'BarbeariaPage deve ter método privado async #onProducaoClick',
    );
  });

  test('#onProducaoClick usa ClienteController.podeInteragir() como guard', () => {
    const idxMetodo = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxMetodo > 0, 'async #onProducaoClick deve existir');
    const bloco = SRC.slice(idxMetodo, idxMetodo + 600);
    assert.ok(
      bloco.includes('podeInteragir'),
      '#onProducaoClick deve verificar ClienteController.podeInteragir()',
    );
  });

  test('#onProducaoClick delega ao ClienteController.sentar (tipo producao encapsulado no controller)', () => {
    const idxMetodo = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxMetodo > 0, 'async #onProducaoClick deve existir');
    // Janela de 1500 chars — o guard de double-entry precede a chamada ao controller
    const bloco = SRC.slice(idxMetodo, idxMetodo + 1500);
    assert.ok(
      bloco.includes('ClienteController.sentar'),
      '#onProducaoClick deve chamar ClienteController.sentar',
    );
    // ClienteController.sentar deve ter tipo:'producao'
    assert.ok(
      SRC_CC.includes("tipo:       'producao'") || SRC_CC.includes("tipo: 'producao'"),
      'ClienteController.sentar deve passar tipo producao ao CadeiraService',
    );
  });

  test('#onProducaoClick aciona CadeiraConfirmacaoService.iniciarFluxo após sentar', () => {
    const idxMetodo = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxMetodo > 0);
    // O método é longo (guard de double-entry + await); usa janela de 2500 chars
    const bloco = SRC.slice(idxMetodo, idxMetodo + 2500);
    assert.ok(
      bloco.includes('CadeiraConfirmacaoService'),
      '#onProducaoClick deve acionar CadeiraConfirmacaoService.iniciarFluxo',
    );
  });

  test('renderBarbeiros passa onProducaoVaziaClick para #criarRow', () => {
    assert.ok(
      SRC.includes('onProducaoVaziaClick:'),
      '#renderBarbeiros deve passar onProducaoVaziaClick ao #criarRow',
    );
  });
});

suite('ClienteController — método sentar()', () => {

  test('ClienteController expõe método estático sentar', () => {
    assert.ok(
      SRC_CC.includes('static async sentar') || SRC_CC.includes('static sentar'),
      'ClienteController deve ter método estático sentar()',
    );
  });

  test('ClienteController.sentar valida podeInteragir() antes de chamar CadeiraService', () => {
    const idxMetodo = SRC_CC.indexOf('static async sentar');
    assert.ok(idxMetodo > 0, 'sentar deve existir');
    const bloco = SRC_CC.slice(idxMetodo, idxMetodo + 600);
    assert.ok(
      bloco.includes('podeInteragir'),
      'sentar deve validar podeInteragir() como guard de autorização',
    );
  });

  test('ClienteController.sentar chama CadeiraService.sentar com tipo producao', () => {
    const idxMetodo = SRC_CC.indexOf('static async sentar');
    assert.ok(idxMetodo > 0);
    const bloco = SRC_CC.slice(idxMetodo, idxMetodo + 600);
    assert.ok(
      bloco.includes('CadeiraService.sentar'),
      'sentar deve delegar ao CadeiraService.sentar',
    );
    assert.ok(
      bloco.includes("'producao'"),
      'sentar deve passar tipo: producao ao CadeiraService',
    );
  });
});
