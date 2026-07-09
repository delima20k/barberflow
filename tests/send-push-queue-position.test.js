const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readSendPushSource() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'functions', 'send-push', 'index.ts'),
    'utf8',
  );
}

describe('send-push — payload de posicao na fila', () => {
  test('aceita pushType queue_position_update e valida position', () => {
    const source = readSendPushSource();

    assert.match(source, /pushType\?: string/);
    assert.match(source, /queue_position_update/);
    assert.match(source, /position deve ser um numero positivo/);
  });

  test('monta titulo, body, tag e dados especificos para mudanca de posicao', () => {
    const source = readSendPushSource();

    assert.match(source, /Voc.+ subiu na fila!/);
    assert.match(source, /bf-queue-position-\$\{entradaId\}-\$\{posicaoAtual\}/);
    assert.match(source, /previousPosition/);
    assert.match(source, /isNext/);
  });

  test('mantem payload antigo de chamado para in_service', () => {
    const source = readSendPushSource();

    assert.match(source, /bf-inservice-\$\{entradaId\}/);
    assert.match(source, /Voc.+ foi chamado!/);
  });

  test('permite chamada interna somente para queue_position_update', () => {
    const source = readSendPushSource();

    assert.match(source, /x-barberflow-internal-secret/);
    assert.match(source, /QUEUE_POSITION_PUSH_INTERNAL_SECRET/);
    assert.match(source, /const isPreAuthQueuePosition = preAuthBody\.pushType === 'queue_position_update'/);
    assert.match(source, /if \(!isInternalQueuePosition\)/);
  });
});
