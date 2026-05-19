'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function ler(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

suite('Fluxo push cadeira de producao — app profissional', () => {
  test('service worker acorda clients abertos no evento push com PUSH_SHOW_MODAL', () => {
    const src = ler('apps/profissional/sw.js');
    const idxPush = src.indexOf('static push(e)');
    assert.ok(idxPush > 0, 'SWProfissional.push deve existir');
    const bloco = src.slice(idxPush, idxPush + 2600);

    assert.ok(
      bloco.includes('clients.matchAll') && bloco.includes('PUSH_SHOW_MODAL'),
      'push deve postar PUSH_SHOW_MODAL para janelas abertas sem depender de notificationclick',
    );
  });

  test('MinhaBarbeariaPage guarda push pendente ate barbearia carregar', () => {
    const src = ler('apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');
    assert.ok(src.includes('#pushPendente'), 'deve haver estado privado para push pendente');
    assert.ok(src.includes('#processarPushPendente'), 'deve processar push pendente apos carregar');
    assert.ok(src.includes('#registrarPushPendente'), 'deve registrar payload quando barbearia ainda nao carregou');
  });

  test('MinhaBarbeariaPage deduplica modal pelo par entradaId/pushType', () => {
    const src = ler('apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');
    assert.ok(src.includes('#pushModalAtiva'), 'deve rastrear modais push em andamento');
    assert.ok(src.includes('#pushProcessados'), 'deve rastrear pushes ja processados');
    assert.ok(src.includes('#chavePush'), 'deve gerar chave de dedupe por entrada/tipo');
  });
});
