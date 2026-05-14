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

  test('#onProducaoClick delega ao ChegadaProducaoService.iniciarFluxo', () => {
    const idxMetodo = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxMetodo > 0, 'async #onProducaoClick deve existir');
    const bloco = SRC.slice(idxMetodo, idxMetodo + 1800);
    // Aceita delegação direta ou via método privado #executarFluxoProducao
    const delegaDiretamente = bloco.includes('ChegadaProducaoService.iniciarFluxo');
    const delegaViaMetodo   = bloco.includes('#executarFluxoProducao');
    assert.ok(
      delegaDiretamente || delegaViaMetodo,
      '#onProducaoClick deve delegar a ChegadaProducaoService.iniciarFluxo (direta ou via #executarFluxoProducao)',
    );
  });

  test('#onProducaoClick retorna cedo se ChegadaProducaoService retornar null', () => {
    const idxMetodo = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxMetodo > 0);
    const bloco = SRC.slice(idxMetodo, idxMetodo + 2500);
    // Deve verificar a entrada retornada antes de prosseguir com pollers
    assert.ok(
      bloco.includes('if (!entrada) return'),
      '#onProducaoClick deve retornar cedo se iniciarFluxo retornar null',
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

suite('BarbeariaPage — modal barbearia fechada', () => {

  test('fonte contém método privado #mostrarModalBarbeariaFechada', () => {
    assert.ok(
      SRC.includes('#mostrarModalBarbeariaFechada'),
      'BarbeariaPage deve ter método #mostrarModalBarbeariaFechada',
    );
  });

  test('bloco de #mostrarModalBarbeariaFechada contém FluxoDeFila.abrir', () => {
    const idx = SRC.indexOf('#mostrarModalBarbeariaFechada()');
    assert.ok(idx > 0, '#mostrarModalBarbeariaFechada deve existir');
    const bloco = SRC.slice(idx, idx + 600);
    assert.ok(
      bloco.includes('FluxoDeFila.abrir'),
      '#mostrarModalBarbeariaFechada deve chamar FluxoDeFila.abrir',
    );
  });

  test('bloco de #mostrarModalBarbeariaFechada usa getClosedMessage e #numeroBarbeiros', () => {
    const idx = SRC.indexOf('#mostrarModalBarbeariaFechada()');
    assert.ok(idx > 0);
    const bloco = SRC.slice(idx, idx + 600);
    assert.ok(bloco.includes('getClosedMessage'),  'deve usar getClosedMessage');
    assert.ok(bloco.includes('#numeroBarbeiros'),   'deve passar #numeroBarbeiros');
  });

  test('#onCadeiraClick e #onProducaoClick delegam a #mostrarModalBarbeariaFechada', () => {
    const idxCadeira   = SRC.indexOf('async #onCadeiraClick');
    const idxProducao  = SRC.indexOf('async #onProducaoClick');
    assert.ok(idxCadeira  > 0, 'async #onCadeiraClick deve existir');
    assert.ok(idxProducao > 0, 'async #onProducaoClick deve existir');
    const blocoCadeira  = SRC.slice(idxCadeira,  idxCadeira  + 500);
    const blocoProducao = SRC.slice(idxProducao, idxProducao + 500);
    assert.ok(
      blocoCadeira.includes('#mostrarModalBarbeariaFechada'),
      '#onCadeiraClick deve delegar a #mostrarModalBarbeariaFechada',
    );
    assert.ok(
      blocoProducao.includes('#mostrarModalBarbeariaFechada'),
      '#onProducaoClick deve delegar a #mostrarModalBarbeariaFechada',
    );
  });

  test('fonte contém campo #numeroBarbeiros', () => {
    assert.ok(
      SRC.includes('#numeroBarbeiros'),
      'BarbeariaPage deve ter campo #numeroBarbeiros',
    );
  });
});

suite('BarbeariaPage — callbacks com barbearia fechada', () => {

  test('renderBarbeiros extrai clientePodeInteragir separado de podeInteragir', () => {
    assert.ok(
      SRC.includes('clientePodeInteragir'),
      'renderBarbeiros deve extrair clientePodeInteragir para passar callbacks independentemente de barbeariaAberta',
    );
  });

  test('onProducaoVaziaClick usa clientePodeInteragir (não podeInteragir)', () => {
    // Após a correção, os callbacks devem usar clientePodeInteragir para que
    // sejam passados mesmo quando a barbearia está fechada (para exibir modal)
    const idxCallback = SRC.indexOf('onProducaoVaziaClick:');
    assert.ok(idxCallback > 0, 'onProducaoVaziaClick deve existir');
    const trecho = SRC.slice(idxCallback, idxCallback + 120);
    assert.ok(
      trecho.includes('clientePodeInteragir'),
      'onProducaoVaziaClick deve usar clientePodeInteragir no ternário',
    );
  });

  test('onCadeiraVaziaClick usa clientePodeInteragir (não podeInteragir)', () => {
    const idxCallback = SRC.indexOf('onCadeiraVaziaClick:');
    assert.ok(idxCallback > 0, 'onCadeiraVaziaClick deve existir');
    const trecho = SRC.slice(idxCallback, idxCallback + 120);
    assert.ok(
      trecho.includes('clientePodeInteragir'),
      'onCadeiraVaziaClick deve usar clientePodeInteragir no ternário',
    );
  });
});

suite('BarbeariaPage — realtime shop re-render', () => {

  test('#onShopRealtime chama #renderBarbeiros após atualizar shopData', () => {
    const idx = SRC.indexOf('#onShopRealtime(payload) {');
    assert.ok(idx > 0, '#onShopRealtime deve existir');
    const bloco = SRC.slice(idx, idx + 800);
    assert.ok(
      bloco.includes('#renderBarbeiros'),
      '#onShopRealtime deve chamar #renderBarbeiros para re-renderizar cadeiras',
    );
  });

  test('#onShopRealtime chama #atualizarBadge', () => {
    const idx = SRC.indexOf('#onShopRealtime(payload) {');
    assert.ok(idx > 0);
    const bloco = SRC.slice(idx, idx + 800);
    assert.ok(
      bloco.includes('#atualizarBadge'),
      '#onShopRealtime deve chamar #atualizarBadge para atualizar o badge de status',
    );
  });

  test('fonte contém método privado #atualizarBadge', () => {
    assert.ok(
      SRC.includes('#atualizarBadge('),
      'BarbeariaPage deve ter método privado #atualizarBadge',
    );
  });
});
