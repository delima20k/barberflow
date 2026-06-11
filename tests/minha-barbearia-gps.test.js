'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MinhaBarbeariaPage salva endereco/GPS pela camada de service', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
    'utf8'
  );
  const salvarGps = source.slice(
    source.indexOf('async #salvarGps()'),
    source.indexOf('\n  #mostrarGpsMsg', source.indexOf('async #salvarGps()'))
  );

  assert.match(salvarGps, /BarbershopService\.salvarEnderecoGps/);
  assert.doesNotMatch(salvarGps, /MapWidget\.recarregarBarbearias/);
  assert.match(salvarGps, /numero:\s*num\s*\|\|\s*null/);
  assert.match(salvarGps, /complemento:\s*comp\s*\|\|\s*null/);
  assert.doesNotMatch(salvarGps, /SupabaseService\.barbershops\(\)\s*\.update/);
  assert.match(salvarGps, /this\.#coordsGps\s*[\r\n\s]*\?/);
  assert.match(salvarGps, /barberflow:barbearia-endereco-atualizado/);
});

test('Integração: evento barberflow:barbearia-endereco-atualizado dispara recarregarBarbearias no MapWidget', () => {
  const controller = fs.readFileSync(
    path.join(root, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
    'utf8'
  );
  const mapWidget = fs.readFileSync(path.join(root, 'shared/js/MapWidget.js'), 'utf8');

  const salvarGps = controller.slice(
    controller.indexOf('async #salvarGps()'),
    controller.indexOf('\n  #mostrarGpsMsg', controller.indexOf('async #salvarGps()'))
  );

  // 1. Controller despacha o evento após save bem-sucedido
  assert.match(salvarGps, /dispatchEvent\s*\(\s*new\s*CustomEvent\s*\(\s*['"]barberflow:barbearia-endereco-atualizado['"]/);

  // 2. MapWidget escuta o evento no init()
  const initMethod = mapWidget.slice(
    mapWidget.indexOf('static async init('),
    mapWidget.indexOf('\n  /**', mapWidget.indexOf('static async init('))
  );
  assert.match(initMethod, /addEventListener\s*\(\s*['"]barberflow:barbearia-endereco-atualizado['"]/);

  // 3. O listener chama recarregarBarbearias()
  assert.match(initMethod, /MapWidget\.recarregarBarbearias\(\)/);

  // 4. Apenas UM listener para esse evento (sem duplicatas)
  const occurrences = (mapWidget.match(/barberflow:barbearia-endereco-atualizado/g) ?? []).length;
  assert.strictEqual(occurrences, 1, 'evento deve ser registrado exatamente uma vez no MapWidget');

  // 5. Controller NÃO chama MapWidget.recarregarBarbearias() diretamente
  assert.doesNotMatch(salvarGps, /MapWidget\.recarregarBarbearias/);
});

test('MinhaBarbeariaPage reabre endereco salvo preservando numero e complemento', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
    'utf8'
  );

  assert.match(source, /#separarEnderecoSalvo\(s\.address\)/);
  assert.match(source, /gpsNumero\) this\.#refs\.gpsNumero\.value = endereco\.numero/);
  assert.match(source, /gpsComplemento\) this\.#refs\.gpsComplemento\.value = endereco\.complemento/);
  assert.match(source, /gpsNumDisplay\) this\.#refs\.gpsNumDisplay\.textContent = endereco\.numero \|\|/);
  assert.match(source, /gpsCompDisplay\) this\.#refs\.gpsCompDisplay\.textContent = endereco\.complemento \|\|/);
});
