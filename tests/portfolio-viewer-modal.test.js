'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('PortfolioViewerModal', () => {
  test('mantem viewer reutilizavel sem botoes de navegacao e com swipe 3D', () => {
    const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioViewerModal.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

    assert.doesNotMatch(js, /portfolio-viewer__nav/);
    assert.match(js, /portfolio-viewer__cube/);
    assert.match(js, /portfolio-viewer__face/);
    assert.match(js, /pointerdown/);
    assert.match(js, /pointermove/);
    assert.match(js, /pointerup/);
    assert.match(js, /animationend/);
    assert.match(js, /--portfolio-spin-angle/);
    assert.match(js, /#prepararTroca/);
    assert.match(js, /#finalizarTroca/);
    assert.match(js, /#renderFaces/);
    assert.match(css, /portfolio-viewer__cube/);
    assert.match(css, /translateZ\(calc\(var\(--portfolio-cube-depth\) \* -1\)\) rotateY\(var\(--portfolio-spin-angle\)\)/);
    assert.match(css, /portfolio-spin-next/);
    assert.match(css, /100%\s*\{[\s\S]*?transform: translateZ\(calc\(var\(--portfolio-cube-depth\) \* -1\)\) rotateY\(-90deg\)/);
    assert.match(css, /portfolio-spin-prev/);
    assert.match(css, /100%\s*\{[\s\S]*?transform: translateZ\(calc\(var\(--portfolio-cube-depth\) \* -1\)\) rotateY\(90deg\)/);
    assert.match(css, /portfolio-viewer__actions/);
    assert.match(css, /top:\s*18px/);
    assert.match(css, /right:\s*72px/);
  });

  test('mantem metadados da imagem no topo esquerdo em tela cheia', () => {
    const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioViewerModal.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

    assert.match(js, /portfolio-viewer__meta/);
    assert.match(js, /portfolio-viewer__avatar/);
    assert.match(js, /portfolio-viewer__name/);
    assert.match(js, /portfolio-viewer__likes/);
    assert.match(js, /#renderMeta/);
    assert.match(css, /\.portfolio-viewer__meta\s*\{[\s\S]*top:\s*18px/);
    assert.match(css, /\.portfolio-viewer__meta\s*\{[\s\S]*left:\s*18px/);
    assert.match(css, /\.portfolio-viewer__avatar\s*\{[\s\S]*width:\s*48px/);
    assert.match(css, /\.portfolio-viewer__meta-text\s*\{[\s\S]*display:\s*inline-flex/);
  });

  test('fallback modal reaproveita interactions historicas do portfolio', () => {
    const js = fs.readFileSync(path.join(ROOT, 'shared/js/PortfolioViewerModal.js'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'shared/css/components.css'), 'utf8');

    assert.match(js, /#reactionLayer/);
    assert.match(js, /#replayInteractions/);
    assert.match(js, /#normalizarInteracoes/);
    assert.match(js, /#FLOAT_STACK_SIZE\s*=\s*8/);
    assert.match(js, /--pp-prism-float-stack/);
    assert.match(js, /interactions/);
    assert.match(js, /portfolio-viewer__reactions/);
    assert.match(js, /pp-prism-float--emoji/);
    assert.match(js, /pp-prism-float--like/);
    assert.match(css, /\.portfolio-viewer__reactions/);
    assert.match(css, /bottom:\s*calc\(18px \+ \(var\(--pp-prism-float-stack,\s*0\) \* (?:0\.5rem|10px)\)\)/);
    assert.match(css, /\.pp-prism-float--emoji/);
    assert.match(css, /\.pp-prism-float--like/);
  });
});
