'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs2             = require('node:fs');
const path            = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs2.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');

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
