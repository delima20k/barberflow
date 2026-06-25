'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');

const { OpenGraphHtmlBuilder } = require('../infrastructure/share/OpenGraphHtmlBuilder');
const BarbeariaShareController = require('../controllers/BarbeariaShareController');

const SHOP_ID = '30000000-0000-4000-8000-000000000003';

// Stub mínimo de res do Express.
function criarRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
  };
}

function criarReq(id) {
  return { params: { id }, protocol: 'https', get: () => 'bff.berberflow.shop' };
}

suite('OpenGraphHtmlBuilder', () => {
  test('inclui meta tags OG e redirect para o destino', () => {
    const html = new OpenGraphHtmlBuilder().build({
      title: 'Barbearia Central',
      description: 'São Paulo - SP · Veja no BarberFlow.',
      image: 'https://cdn.exemplo/logo.png',
      canonicalUrl: 'https://bff.berberflow.shop/b/abc',
      redirectUrl: 'https://app.berberflow.shop/?barbearia=abc',
    });
    assert.match(html, /<meta property="og:title" content="Barbearia Central">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/cdn\.exemplo\/logo\.png">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /http-equiv="refresh" content="0; url=https:\/\/app\.berberflow\.shop\/\?barbearia=abc"/);
    assert.match(html, /location\.replace\("https:\/\/app\.berberflow\.shop\/\?barbearia=abc"\)/);
  });

  test('sem imagem usa twitter:card summary e omite og:image', () => {
    const html = new OpenGraphHtmlBuilder().build({
      title: 'BarberFlow', description: 'x',
      canonicalUrl: 'https://b/og', redirectUrl: 'https://app/',
    });
    assert.match(html, /<meta name="twitter:card" content="summary">/);
    assert.doesNotMatch(html, /og:image/);
  });

  test('escapa conteúdo malicioso no título', () => {
    const html = new OpenGraphHtmlBuilder().build({
      title: '"><script>alert(1)</script>',
      description: 'd', canonicalUrl: 'https://b', redirectUrl: 'https://app/',
    });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});

suite('BarbeariaShareController', () => {
  const builder = new OpenGraphHtmlBuilder();
  const baseDeps = {
    builder,
    appBaseUrl: 'https://app.berberflow.shop',
    supabaseUrl: 'https://proj.supabase.co',
  };

  test('barbearia encontrada → 200, HTML com nome e redirect com ?barbearia=', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Barbearia Central', city: 'São Paulo', state: 'SP',
        logo_path: 'logo.png', cover_path: 'capa.png',
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res = criarRes();
    await ctrl.handle(criarReq(SHOP_ID), res);

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Barbearia Central/);
    assert.match(res.body, new RegExp(`barbearia=${SHOP_ID}`));
    // usa cover_path (preferência) na URL pública do Supabase
    assert.match(res.body, /proj\.supabase\.co\/storage\/v1\/object\/public\/barbershops\/capa\.png/);
  });

  test('barbearia inexistente → 200 genérico, redirect para a home', async () => {
    const repo = { getPublicShareData: async () => null };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res = criarRes();
    await ctrl.handle(criarReq(SHOP_ID), res);

    assert.equal(res.statusCode, 200);
    assert.doesNotMatch(res.body, new RegExp(`barbearia=${SHOP_ID}`));
    assert.match(res.body, /location\.replace\("https:\/\/app\.berberflow\.shop"\)/);
  });

  test('id inválido (repo lança) → fallback genérico sem quebrar', async () => {
    const repo = { getPublicShareData: async () => { throw new Error('uuid inválido'); } };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res = criarRes();
    await ctrl.handle(criarReq('xxx'), res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /BarberFlow/);
  });

  test('construtor valida dependências', () => {
    assert.throws(() => new BarbeariaShareController({ builder, appBaseUrl: 'x', supabaseUrl: 'y' }), /getPublicShareData/);
    assert.throws(() => new BarbeariaShareController({ repo: { getPublicShareData() {} }, appBaseUrl: 'x' }), /build/);
  });
});
