const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function readHtml(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function scriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
}

function externalScriptTags(html) {
  return scriptTags(html).filter((tag) => /\bsrc=/.test(tag));
}

function scriptSrc(tag) {
  const match = tag.match(/\bsrc=(["'])(.*?)\1/);
  // Ignora cache-buster (?v=...) — a identidade do script é o path.
  return match ? match[2].split('?')[0] : null;
}

function srcOrder(html) {
  return externalScriptTags(html).map(scriptSrc).filter(Boolean);
}

function assertBefore(order, first, second) {
  const firstIndex = order.indexOf(first);
  const secondIndex = order.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} deve existir no HTML`);
  assert.notEqual(secondIndex, -1, `${second} deve existir no HTML`);
  assert.ok(firstIndex < secondIndex, `${first} deve carregar antes de ${second}`);
}

describe('fase 1 de carregamento de scripts', () => {
  test('cliente usa defer em todos os scripts externos', () => {
    const tags = externalScriptTags(readHtml('apps/cliente/index.html'));
    // Contagem literal era frágil (quebrava a cada script novo) — o invariante
    // real é: nenhum script externo bloqueante (todos defer/async/module).
    assert.ok(tags.length > 50, 'parser deve encontrar os scripts do app');
    assert.deepEqual(
      tags.filter((tag) => !/\b(?:defer|async|type=)/.test(tag)),
      [],
    );
  });

  test('profissional usa defer em todos os scripts externos', () => {
    const tags = externalScriptTags(readHtml('apps/profissional/index.html'));
    assert.ok(tags.length > 50, 'parser deve encontrar os scripts do app');
    assert.deepEqual(
      tags.filter((tag) => !/\b(?:defer|async|type=)/.test(tag)),
      [],
    );
  });

  test('ordem critica do cliente permanece preservada', () => {
    const order = srcOrder(readHtml('apps/cliente/index.html'));

    assertBefore(order, '/shared/js/supabase.min.js', '/shared/js/SupabaseService.js');
    assertBefore(order, '/shared/js/SupabaseService.js', '/shared/js/AuthService.js');
    assertBefore(order, '/shared/js/NavigationViewService.js', '/shared/js/Router.js');
    assertBefore(order, '/shared/js/BffApiService.js', '/shared/js/PortfolioGallery.js');
    assertBefore(order, '/shared/js/BffApiService.js', '/shared/js/BarbeiroAtividadeStatus.js');
    assertBefore(order, '/shared/js/BarbeiroAtividadeStatus.js', '/shared/js/BarbeariaPage.js');
    assertBefore(order, '/shared/js/PortfolioPrismViewer.js', '/shared/js/PortfolioGallery.js');
    assertBefore(order, '/shared/js/PortfolioBarbeirosSection.js', '/shared/js/BarbeariaPage.js');
    assertBefore(order, '/shared/js/Router.js', 'assets/js/pages/LoginPage.js');
    assertBefore(order, 'assets/js/AppBootstrap.js', 'assets/js/app.js');
  });

  test('ordem critica do profissional permanece preservada', () => {
    const order = srcOrder(readHtml('apps/profissional/index.html'));

    assertBefore(order, '/shared/js/supabase.min.js', '/shared/js/SupabaseService.js');
    assertBefore(order, '/shared/js/SupabaseService.js', '/shared/js/AuthService.js');
    assertBefore(order, '/shared/js/NavigationViewService.js', '/shared/js/Router.js');
    assertBefore(order, '/shared/js/BffApiService.js', '/shared/js/PortfolioGallery.js');
    assertBefore(order, '/shared/js/BffApiService.js', '/shared/js/BarbeiroAtividadeStatus.js');
    assertBefore(order, '/shared/js/BarbeiroAtividadeStatus.js', '/shared/js/BarbeariaPage.js');
    assertBefore(order, '/shared/js/PortfolioPrismViewer.js', '/shared/js/PortfolioGallery.js');
    assertBefore(order, '/shared/js/PortfolioBarbeirosSection.js', '/shared/js/BarbeariaPage.js');
    assertBefore(order, '/shared/js/PortfolioGallery.js', '/shared/js/BarbeiroPage.js');
    assertBefore(order, 'assets/js/AppBootstrap.js', 'assets/js/app.js');
  });

  test('profissional usa app.js como entry-point de modulo', () => {
    const tags = externalScriptTags(readHtml('apps/profissional/index.html'));
    const appTag = tags.find((tag) => tag.includes('assets/js/app.js'));

    assert.match(appTag, /\btype="module"/);
    assert.equal(tags.some((tag) => tag.includes('MinhaBarbeariaPage/AgendaSection/')), false);
    assert.equal(tags.some((tag) => tag.includes('/shared/js/PageSection.js')), false);
  });

  test('atalho admin inline do profissional roda apos load ou idle', () => {
    const html = readHtml('apps/profissional/index.html');
    assert.match(html, /window\.addEventListener\('load'/);
    assert.match(html, /requestIdleCallback/);
    assert.match(html, /bindAdminShortcut/);
  });
});
