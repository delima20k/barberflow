'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioPrismViewer', () => {
  const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioPrismViewer.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');
  const proCss = fs.readFileSync(path.join(ROOT, 'apps/profissional/assets/css/styles.css'), 'utf8');
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
    const metaCss = css.slice(css.indexOf('.pp-prism-meta {'), css.indexOf('.pp-prism-meta[hidden]'));
    assert.doesNotMatch(metaCss, /background:\s*rgba/);
    assert.doesNotMatch(metaCss, /border:\s*1px/);
    assert.match(metaCss, /box-shadow:\s*none/);
    assert.match(css, /\.pp-prism-avatar\s*\{[\s\S]*width:\s*48px/);
    const avatarCss = css.slice(css.indexOf('.pp-prism-avatar {'), css.indexOf('.pp-prism-meta-text'));
    assert.doesNotMatch(avatarCss, /border:\s*1px/);
    assert.match(css, /\.pp-prism-meta-text\s*\{[\s\S]*display:\s*inline-flex/);

    const proMetaCss = proCss.slice(proCss.indexOf('.pp-prism-meta {'), proCss.indexOf('.pp-prism-meta[hidden]'));
    const proAvatarCss = proCss.slice(proCss.indexOf('.pp-prism-avatar {'), proCss.indexOf('.pp-prism-meta-text'));
    assert.doesNotMatch(proMetaCss, /background:\s*rgba/);
    assert.doesNotMatch(proMetaCss, /border:\s*1px/);
    assert.doesNotMatch(proAvatarCss, /border:\s*1px/);
  });

  test('renderiza barra publica e animacao de interacoes somente quando item permite', () => {
    assert.match(js, /#publicActions/);
    assert.match(js, /#reactionLayer/);
    assert.match(js, /#renderPublicActions/);
    assert.match(js, /#emitInteraction/);
    assert.match(js, /portfolioPublicActions/);
    assert.match(js, /pp-prism-public-actions/);
    assert.match(js, /pp-prism-public-logo" src="\/shared\/img\/icon-512-cliente\.png"/);
    assert.match(js, /pp-prism-message-input/);
    assert.match(js, /static #sadEmoji\(\)/);
    assert.match(js, /data-public-emoji="\$\{PortfolioPrismViewer\.#laughEmoji\(\)\}"/);
    assert.match(js, /data-public-emoji="\$\{PortfolioPrismViewer\.#sadEmoji\(\)\}"/);
    assert.match(js, /#handlePublicMessage\(emojiBtn\.dataset\.publicEmoji/);
    assert.ok(js.includes('data-public-like-icon aria-hidden="true">👍</span>'));
    assert.match(js, /count\.hidden\s*=\s*likesCount\s*<=\s*0/);
    assert.match(js, /icon\.hidden\s*=\s*likesCount\s*>\s*0/);
    assert.match(js, /BffApiService\.profissionais\.curtirPortfolioImagem/);
    assert.match(js, /BffApiService\.profissionais\.iniciarMensagemBarbearia/);
    assert.match(css, /\.pp-prism-public-actions\s*\{[\s\S]*width:\s*min\(92vw,\s*460px\)/);
    assert.match(css, /\.pp-prism-public-actions\s*\{[\s\S]*position:\s*absolute/);
    assert.match(css, /\.pp-prism-public-actions\s*\{[\s\S]*bottom:\s*max\(18px,\s*env\(safe-area-inset-bottom\)\)/);
    assert.match(css, /\.pp-prism-public-actions\s*\{[\s\S]*z-index:\s*5/);
    assert.match(css, /\.pp-prism-message-input\s*\{[\s\S]*width:\s*160px/);
    const publicButtonCss = css.slice(css.indexOf('.pp-prism-public-like,'), css.indexOf('.pp-prism-public-like.is-liked'));
    const proPublicButtonCss = proCss.slice(proCss.indexOf('.pp-prism-public-like,'), proCss.indexOf('.pp-prism-public-like.is-liked'));
    assert.match(publicButtonCss, /border:\s*0/);
    assert.match(publicButtonCss, /background:\s*transparent/);
    assert.match(proPublicButtonCss, /border:\s*0/);
    assert.match(proPublicButtonCss, /background:\s*transparent/);
    assert.match(css, /@keyframes\s+pp-prism-float-up/);
  });

  test('portfolio publico legado da barbearia tambem habilita a barra publica', () => {
    const barbeariaPageJs = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');
    const bloco = barbeariaPageJs.slice(
      barbeariaPageJs.indexOf('#abrirPortfolioViewer'),
      barbeariaPageJs.indexOf('#renderPortfolio', barbeariaPageJs.indexOf('#abrirPortfolioViewer')),
    );

    assert.match(bloco, /id:\s*img\.id/);
    assert.match(bloco, /professionalId:/);
    assert.match(bloco, /likesCount:/);
    assert.match(bloco, /portfolioPublicActions:\s*Boolean\(img\.id\)/);
  });

  test('galeria publica marca itens para barra publica e usa BFF para curtidas', () => {
    assert.match(publicSectionJs, /portfolioPublicActions:\s*true/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.listarCurtidasPortfolio/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.curtirPortfolioImagem/);
    assert.match(publicSectionJs, /BffApiService\.profissionais\.descurtirPortfolioImagem/);
    assert.doesNotMatch(publicSectionJs, /ApiService\.from\('likes'\)/);
  });

  test('card normal do portfolio publico nao mostra botao de mensagem', () => {
    const blocoCarrossel = publicSectionJs.slice(
      publicSectionJs.indexOf('static #renderCarrossel'),
      publicSectionJs.indexOf('static #fetchPortfolio'),
    );

    assert.doesNotMatch(blocoCarrossel, /pbp-msg-btn/);
    assert.doesNotMatch(css, /\.pbp-msg-btn/);
  });

  test('card normal do portfolio publico deixa topo transparente e usa icone de joia', () => {
    const blocoCarrossel = publicSectionJs.slice(
      publicSectionJs.indexOf('static #renderCarrossel'),
      publicSectionJs.indexOf('static #fetchPortfolio'),
    );
    const barberRowCss = css.slice(
      css.indexOf('.pbp-barber-row'),
      css.indexOf('.pbp-avatar'),
    );
    const likeBtnCss = css.slice(
      css.indexOf('.pbp-like-btn'),
      css.indexOf('.pbp-like-btn { right: 8px; }'),
    );
    const likeAtivoCss = css.slice(
      css.indexOf('.pbp-like-btn.curtido'),
      css.indexOf('.pbp-like-btn:active'),
    );

    assert.match(blocoCarrossel, />👍 <span class="pbp-like-count">/);
    assert.doesNotMatch(blocoCarrossel, /ðŸ’Ž|💎/);
    assert.match(barberRowCss, /background:\s*transparent/);
    assert.match(barberRowCss, /border:\s*0/);
    assert.match(likeBtnCss, /background:\s*transparent/);
    assert.match(likeBtnCss, /border:\s*0/);
    assert.doesNotMatch(likeAtivoCss, /background:/);
    assert.doesNotMatch(likeAtivoCss, /border-color:/);
  });
});
