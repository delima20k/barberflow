'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_CORTE_MODAL = fs.readFileSync(path.join(ROOT, 'shared/js/CorteModal.js'), 'utf8');
const SRC_RUNTIME = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
  'utf8',
);

suite('Mensalista na selecao da cadeira', () => {
  test('CorteModal tem opcao especial Mensalista opt-in', () => {
    assert.ok(SRC_CORTE_MODAL.includes("static MENSALISTA_ID = '__mensalista__'"));
    assert.ok(SRC_CORTE_MODAL.includes('incluirMensalista = false'));
    assert.ok(SRC_CORTE_MODAL.includes("#criarMensalistaItem"));
    assert.ok(SRC_CORTE_MODAL.includes("name:         'Mensalista'"));
    assert.ok(SRC_CORTE_MODAL.includes('...(incluirMensalista ? [CorteModal.#criarMensalistaItem()] : [])'));
  });

  test('fluxo de sentar habilita Mensalista e nao salva ID falso como servico', () => {
    assert.ok(SRC_RUNTIME.includes('incluirMensalista:    true'));
    assert.ok(
      SRC_RUNTIME.includes('serviceIds.filter(id => id !== CorteModal.MENSALISTA_ID)'),
      'deve remover o ID sentinela antes de chamar CadeiraService.sentar',
    );
    assert.ok(SRC_RUNTIME.includes('serviceIds:     serviceIdsParaSalvar'));
  });
});
