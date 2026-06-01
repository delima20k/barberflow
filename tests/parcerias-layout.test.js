'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_helpers');

describe('Tela Parcerias layout', () => {
  it('deve posicionar as informacoes do usuario como rodape abaixo das fotos', () => {
    const html = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');
    const telaInicio = html.indexOf('<main id="tela-parcerias"');
    const telaFim = html.indexOf('<main id="tela-financas"', telaInicio);
    const tela = html.slice(telaInicio, telaFim);

    const carrosselIndex = tela.indexOf('id="parcerias-fotos-carrossel"');
    const infoIndex = tela.indexOf('class="parcerias-usuario-info"');

    assert.ok(carrosselIndex >= 0, 'carrossel de fotos deve existir na tela Parcerias');
    assert.ok(infoIndex > carrosselIndex, 'informacoes do usuario devem ficar abaixo do carrossel');
  });
});
