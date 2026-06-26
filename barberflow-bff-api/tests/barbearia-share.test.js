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
    redirectedTo: null,
    set(k, v) { this.headers[String(k).toLowerCase()] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
    redirect(code, url) { this.statusCode = code; this.redirectedTo = url; this.headers['location'] = url; return this; },
  };
}

// UA padrão = scraper (recebe HTML com OG). Passe um UA de navegador p/ testar humano.
function criarReq(id, query = {}, ua = 'facebookexternalhit/1.1') {
  return {
    params: { id },
    protocol: 'https',
    query,
    get: (h) => (String(h).toLowerCase() === 'user-agent' ? ua : 'bff.berberflow.shop'),
  };
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
    // NÃO pode ter meta-refresh: o scraper (FB/WhatsApp) o segue e acaba lendo
    // as OG tags genéricas do SPA cliente, sobrescrevendo as da barbearia.
    assert.doesNotMatch(html, /http-equiv="refresh"/);
    // Humano é redirecionado só por JS (scraper não executa JS).
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
    objectExists: async () => false, // por padrão, sem og-card no Storage
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
    // og:url = domínio público do app (NÃO o host do request, que é bff via proxy)
    assert.match(res.body, new RegExp(`<meta property="og:url" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}">`));
    assert.doesNotMatch(res.body, /og:url" content="https:\/\/bff\.berberflow\.shop/);
    // og:image servido pelo próprio domínio (proxy ?img=1), não expõe o Supabase
    assert.match(res.body, new RegExp(`<meta property="og:image" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}\\?img=1">`));
    assert.doesNotMatch(res.body, /supabase\.co/);
  });

  test('humano (UA de navegador) → 302 direto p/ a SPA, sem página intermediária', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Barbearia Central', city: 'SP', state: 'SP',
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res = criarRes();
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1';
    await ctrl.handle(criarReq(SHOP_ID, {}, ua), res);

    assert.equal(res.statusCode, 302);
    assert.equal(res.redirectedTo, `https://app.berberflow.shop/?barbearia=${SHOP_ID}`);
    assert.equal(res.body, ''); // não serve HTML "Redirecionando…"
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

  test('com og-card no Storage usa o card (jpg) em vez da capa do perfil', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Barbearia X', city: 'SP', state: 'SP',
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo, objectExists: async () => true });
    const res  = criarRes();
    await ctrl.handle(criarReq(SHOP_ID, { og: '1' }), res);

    // og:image = proxy no próprio domínio; banner paisagem 1200×630 (WhatsApp grande)
    assert.match(res.body, new RegExp(`<meta property="og:image" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}\\?img=1">`));
    assert.doesNotMatch(res.body, /supabase\.co/);
    assert.match(res.body, /<meta property="og:image:width" content="1200">/);
    assert.match(res.body, /<meta property="og:image:height" content="630">/);
    assert.match(res.body, /<meta property="og:image:type" content="image\/jpeg">/);
    // og:url preserva ?og=1 e usa o domínio público do app
    assert.match(res.body, new RegExp(`og:url" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}\\?og=1"`));
  });

  test('sem card no Storage mas com capa: og:image proxy, sem dimensões', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Y', city: null, state: null,
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res  = criarRes();
    await ctrl.handle(criarReq(SHOP_ID, {}), res);

    assert.match(res.body, new RegExp(`<meta property="og:image" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}\\?img=1">`));
    assert.doesNotMatch(res.body, /og:image:width/); // capa não tem dimensões conhecidas
  });

  test('sem card e sem capa: omite og:image', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Sem Imagem', city: null, state: null,
        cover_path: null, logo_path: null,
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo });
    const res  = criarRes();
    await ctrl.handle(criarReq(SHOP_ID, {}), res);

    assert.doesNotMatch(res.body, /og:image/);
    assert.match(res.body, /twitter:card" content="summary"/);
  });

  test('com og-card no Storage: og:image proxy mesmo sem ?og=1 (independe do timing)', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'Z', city: null, state: null,
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const ctrl = new BarbeariaShareController({ ...baseDeps, repo, objectExists: async () => true });
    const res  = criarRes();
    await ctrl.handle(criarReq(SHOP_ID, {}), res);

    assert.match(res.body, new RegExp(`<meta property="og:image" content="https://app\\.berberflow\\.shop/b/${SHOP_ID}\\?img=1">`));
    assert.match(res.body, /og:image:width" content="1200"/);
  });

  test('?img=1 compõe e serve o banner 1200×630 pelo próprio domínio', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'X', city: null, state: null,
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const sharp = require('sharp');
    const cardQuadrado = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().toBuffer();
    const origFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => cardQuadrado,
    });
    try {
      const ctrl = new BarbeariaShareController({ ...baseDeps, repo, objectExists: async () => true });
      const res  = criarRes();
      await ctrl.handle(criarReq(SHOP_ID, { img: '1' }), res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'image/jpeg');
      const meta = await sharp(res.body).metadata();
      assert.equal(meta.width, 1200);  // banner paisagem → WhatsApp mostra grande
      assert.equal(meta.height, 630);
    } finally {
      global.fetch = origFetch;
    }
  });

  test('cai no og-card.png legado quando não há jpg (compat, via ?img=1)', async () => {
    const repo = {
      getPublicShareData: async () => ({
        id: SHOP_ID, name: 'W', city: null, state: null,
        cover_path: 'capa.png', logo_path: null,
      }),
    };
    const sharp = require('sharp');
    const cardPng = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    let fetched = '';
    const origFetch = global.fetch;
    global.fetch = async (u) => {
      fetched = String(u);
      return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => cardPng };
    };
    try {
      const ctrl = new BarbeariaShareController({
        ...baseDeps, repo, objectExists: async (u) => u.endsWith('og-card.png'),
      });
      const res = criarRes();
      await ctrl.handle(criarReq(SHOP_ID, { img: '1' }), res);
      assert.equal(res.statusCode, 200);
      assert.match(fetched, /og-card\.png$/); // buscou o png legado, não o jpg
    } finally {
      global.fetch = origFetch;
    }
  });

  test('construtor valida dependências', () => {
    assert.throws(() => new BarbeariaShareController({ builder, appBaseUrl: 'x', supabaseUrl: 'y' }), /getPublicShareData/);
    assert.throws(() => new BarbeariaShareController({ repo: { getPublicShareData() {} }, appBaseUrl: 'x' }), /build/);
  });
});
