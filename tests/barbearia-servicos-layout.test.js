'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_helpers');

describe('BarbeariaPage servicos publicos', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
  const clienteHtml = fs.readFileSync(path.join(ROOT, 'apps/cliente/index.html'), 'utf8');
  const profissionalHtml = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');

  test('renderiza servicos em colunas horizontais com ate cinco itens cada', () => {
    const renderServicos = js.slice(
      js.indexOf('#renderServicos(lista, shop = null)'),
      js.indexOf('static #isMensalidadeServico', js.indexOf('#renderServicos(lista, shop = null)')),
    );
    const carouselCss = css.slice(
      css.indexOf('.bp-serv-carousel'),
      css.indexOf('.bp-serv-carousel::-webkit-scrollbar'),
    );
    const colunaCss = css.slice(
      css.indexOf('.bp-serv-coluna'),
      css.indexOf('.bp-serv-item'),
    );

    assert.match(renderServicos, /for\s*\(let i = 0; i < itens\.length; i \+= 5\)/);
    assert.doesNotMatch(renderServicos, /class="bp-serv-linha"/);
    assert.match(renderServicos, /class="bp-serv-coluna"/);
    assert.match(renderServicos, /itens\.slice\(i, i \+ 5\)\.join\(''\)/);
    assert.match(renderServicos, /<h2 class="bp-serv-nome">/);
    assert.match(renderServicos, /<span class="bp-serv-preco">/);
    assert.match(renderServicos, /filter\(sv => !BarbeariaPage\.#isMensalidadeServico\(sv, shop\)\)/);
    assert.doesNotMatch(renderServicos, /bp-serv-card|bp-serv-card-vazio|<img|image_path/);
    assert.match(carouselCss, /display:\s*flex/);
    assert.match(carouselCss, /flex-direction:\s*row/);
    assert.match(carouselCss, /overflow-x:\s*auto/);
    assert.match(colunaCss, /flex-direction:\s*column/);
    assert.match(colunaCss, /flex:\s*0 0 calc\(\(100% - 18px\) \/ 2\)/);
    assert.doesNotMatch(css, /\.bp-serv-linha/);
    assert.match(css, /\.bp-serv-preco\s*\{[\s\S]*color:\s*var\(--gold/);
  });

  test('banner de mensalidade usa servico fallback quando barbershops nao tem colunas novas', () => {
    const fetchServicos = js.slice(
      js.indexOf('static async #fetchServicos'),
      js.indexOf('static async #fetchPortfolio'),
    );
    const idxRenderizar = js.lastIndexOf('#renderizar(shop, servicos, portfolio)');
    const idxRenderMensalBanner = js.lastIndexOf('#renderMensalBanner(shop, servicos = [])');
    const renderizar = js.slice(idxRenderizar, idxRenderizar + 500);
    const renderMensalBanner = js.slice(
      idxRenderMensalBanner,
      js.indexOf('#abrirPortfolioViewer', idxRenderMensalBanner),
    );

    assert.match(fetchServicos, /select\('id, name, category, price, duration_min, image_path, description'\)/);
    assert.match(renderizar, /#renderServicos\(servicos, shop\)/);
    assert.match(renderizar, /#renderMensalBanner\(shop, servicos\)/);
    assert.match(renderMensalBanner, /this\.#obterMensalBanner\(\)/);
    assert.match(renderMensalBanner, /servicos\.find\(sv => BarbeariaPage\.#isMensalidadeServico\(sv, shop\)\)/);
    assert.match(renderMensalBanner, /precoShop > 0 \? precoShop : precoServico/);
    assert.match(renderMensalBanner, /bp-mensal-banner__linha/);
    assert.match(renderMensalBanner, /<p class="bp-mensal-banner__tag">Mensalidade<\/p>/);
    assert.match(renderMensalBanner, /<p class="bp-mensal-banner__valor">\$\{val\}/);
    assert.match(renderMensalBanner, /shop\.monthly_plan_message \?\? mensalidadeServico\?\.description \?\? mensalidadeServico\?\.name/);
  });

  test('banner de mensalidade cria container e reconhece cadastro por nome', () => {
    const helpers = js.slice(
      js.indexOf('static #isMensalidadeServico'),
      js.indexOf('#abrirPortfolioViewer', js.indexOf('static #isMensalidadeServico')),
    );

    assert.match(helpers, /static #isMensalidadeServico\(servico, shop = null\)/);
    assert.match(helpers, /category/);
    assert.match(helpers, /name/);
    assert.match(helpers, /description/);
    assert.match(helpers, /monthly_plan_price/);
    assert.match(helpers, /monthly_plan_message/);
    assert.match(helpers, /duration_min/);
    assert.match(helpers, /image_path/);
    assert.match(helpers, /includes\('mensalidade'\)/);
    assert.match(helpers, /#obterMensalBanner\(\)/);
    assert.match(helpers, /document\.createElement\('div'\)/);
    assert.match(helpers, /id = 'bp-mensal-banner'/);
    assert.match(helpers, /insertAdjacentElement\('afterend', el\)/);
  });

  test('banner de mensalidade fica abaixo dos servicos com gradiente da paleta', () => {
    for (const html of [clienteHtml, profissionalHtml]) {
      const telaStart = html.indexOf('<main id="tela-barbearia"');
      const telaEnd = html.indexOf('</main>', telaStart);
      const tela = html.slice(telaStart, telaEnd);
      const servicosIndex = tela.indexOf('id="bp-servicos-lista"');
      const bannerIndex = tela.indexOf('id="bp-mensal-banner"');

      assert.ok(servicosIndex >= 0, 'lista de servicos deve existir');
      assert.ok(bannerIndex > servicosIndex, 'banner mensal deve ficar abaixo da lista de servicos');
    }

    const bannerCss = css.slice(
      css.indexOf('.bp-mensal-banner {'),
      css.indexOf('.bp-mensal-banner[hidden]'),
    );
    const tagCss = css.slice(
      css.indexOf('.bp-mensal-banner__tag'),
      css.indexOf('.bp-mensal-banner__valor'),
    );
    const valorCss = css.slice(
      css.indexOf('.bp-mensal-banner__valor'),
      css.indexOf('.bp-mensal-banner__periodo'),
    );
    const msgCss = css.slice(
      css.indexOf('.bp-mensal-banner__msg'),
      css.indexOf('/* ── Config:'),
    );

    assert.match(bannerCss, /background:\s*linear-gradient/);
    assert.match(bannerCss, /#1a1008/);
    assert.match(bannerCss, /#6B4A32/i);
    assert.match(bannerCss, /#D4AF37/i);
    assert.match(bannerCss, /#C75A1A/i);
    assert.match(css, /\.bp-mensal-banner__linha\s*\{[\s\S]*display:\s*flex/);
    assert.match(tagCss, /color:\s*var\(--gold/);
    assert.match(valorCss, /color:\s*#fff/);
    assert.match(msgCss, /color:\s*var\(--gold/);
  });
});
