'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'shared', 'js', 'PaymentFlowHandler.js'),
  'utf8',
);

test('PaymentFlowHandler usa invoiceUrl e mostra erro claro quando o link falta', () => {
  assert.match(SOURCE, /const invoiceUrl = data\?\.invoiceUrl/);
  assert.match(SOURCE, /window\.location\.assign\(invoiceUrl\)/);
  assert.match(
    SOURCE,
    /Cobranca criada sem link de pagamento\. Tente novamente ou fale com suporte\./,
  );
});
