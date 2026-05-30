'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioPrismViewer', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioPrismViewer.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
  const publicSectionJs = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioBarbeirosSection.js'), 'utf8');

  test('exibe avatar, nome e curtidas no topo esquerdo em tela cheia', () => {
    assert.match(js, /pp-prism-meta/);
    assert.match(js, /pp-prism-avatar/);
    assert.match(js, /pp-prism-name/);
    assert.match(js, /pp-prism-likes/);
    assert.match(js, /#renderMeta/);
    assert.match(js, /professionalName/);
    assert.match(js, /professionalAvatarUrl/);
    assert.match(js, /likesCount/);
    assert.match(css, /\.pp-prism-meta\s*\{[\s\S]*top:\s*14px/);
    assert.match(css, /\.pp-prism-meta\s*\{[\s\S]*left:\s*14px/);
    assert.match(css, /\.pp-prism-avatar\s*\{[\s\S]*width:\s*48px/);
    assert.match(css, /\.pp-prism-meta-text\s*\{[\s\S]*display:\s*inline-flex/);
  });

  test('renderiza barra publica e animacao de interacoes somente quando item permite', () => {
    assert.match(js, /#publicActions/);
    assert.match(js, /#reactionLayer/);
    assert.match(js, /#renderPublicActions/);
    assert.match(js, /#emitInteraction/);
    assert.match(js, /portfolioPublicActions/);
    assert.match(js, /pp-prism-public-actions/);
    assert.match(js, /pp-prism-message-input/);
    assert.match(js, /BffApiService\.profissionais\.curtirPortfolioImagem/);
    assert.match(js, /BffApiService\.profissionais\.iniciarMensagemBarbearia/);
    assert.match(css, /\.pp-prism-public-actions\s*\{[\s\S]*width:\s*min\(92vw,\s*460px\)/);
    assert.match(css, /\.pp-prism-message-input\s*\{[\s\S]*width:\s*160px/);
    assert.match(css, /@keyframes\s+pp-prism-float-up/);
  });

  test('galeria publica marca itens para barra publica e usa BFF para curtidas', () => {
    assert.match(publicSectionJs, /portfolioPublicActions:\s*true/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.listarCurtidasPortfolio/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.curtirPortfolioImagem/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.descurtirPortfolioImagem/);
    assert.doesNotMatch(publicSectionJs, /ApiService\.from\('likes'\)/);
  });
});
