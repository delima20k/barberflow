'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MinhaBarbeariaPage salva endereco/GPS pela camada de service', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js'),
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
  assert.match(salvarGps, /!this\.#coordsGps/);
});

test('MinhaBarbeariaPage reabre endereco salvo preservando numero e complemento', () => {
  const source = fs.readFileSync(
    path.join(root, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js'),
    'utf8'
  );

  assert.match(source, /#separarEnderecoSalvo\(s\.address\)/);
  assert.match(source, /gpsNumero\) this\.#refs\.gpsNumero\.value = endereco\.numero/);
  assert.match(source, /gpsComplemento\) this\.#refs\.gpsComplemento\.value = endereco\.complemento/);
  assert.match(source, /gpsNumDisplay\) this\.#refs\.gpsNumDisplay\.textContent = endereco\.numero \|\|/);
  assert.match(source, /gpsCompDisplay\) this\.#refs\.gpsCompDisplay\.textContent = endereco\.complemento \|\|/);
});
