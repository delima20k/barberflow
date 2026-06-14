'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('node:fs');
const path     = require('node:path');

const root = path.resolve(__dirname, '..');
const src  = fs.readFileSync(path.join(root, 'shared/js/StoriesWidget.js'), 'utf8');

// ── Análise estática ─────────────────────────────────────────────────────────

test('StoriesWidget define classe com campos privados e método carregar()', () => {
  assert.match(src, /class StoriesWidget/);
  assert.match(src, /#barbershopId/);
  assert.match(src, /#scrollEl/);
  assert.match(src, /#shopName/);
  assert.match(src, /#shopLogoSrc/);
  assert.match(src, /async carregar\(\)/);
  assert.match(src, /static iniciarHome/);
});

test('StoriesWidget usa BffApiService.barbearias.listarStories para buscar stories', () => {
  assert.match(src, /BffApiService\.barbearias\.listarStories/);
});

test('StoriesWidget ignora IDs de demonstração iniciando com 00000000', () => {
  assert.match(src, /00000000/);
  assert.match(src, /startsWith\('00000000'\)/);
});

test('StoriesWidget cria cards com video.src = story.media_url', () => {
  assert.match(src, /video\.src\s*=\s*story\.media_url/);
  assert.match(src, /story-video/);
  assert.match(src, /story-card/);
  assert.match(src, /story-play-btn/);
  assert.match(src, /story-card-name/);
  assert.match(src, /story-like-btn/);
  assert.match(src, /story-like-count/);
});

test('StoriesWidget oculta section quando nao ha stories', () => {
  assert.match(src, /hidden\s*=\s*true/);
  assert.match(src, /#ocultarSecao/);
  assert.match(src, /bp-stories-section/);
});

test('StoriesWidget tem data-action story-open nos wraps de video', () => {
  assert.match(src, /story-open/);
  assert.match(src, /dataset\.action\s*=\s*'story-open'/);
});

// ── Testes funcionais com mock de DOM e BffApiService ────────────────────────

function buildDOMStub() {
  // Stub mínimo de document.createElement para StoriesWidget
  function makeEl(tag) {
    const el = {
      _tag: tag,
      _children: [],
      _attrs: {},
      className: '',
      src: '',
      alt: '',
      muted: false,
      loop: false,
      preload: '',
      type: '',
      textContent: '',
      innerHTML: '',
      hidden: false,
      onerror: null,
      dataset: {},
      style: {},
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k] ?? null; },
      appendChild(child) { this._children.push(child); },
      querySelector(sel) {
        // Simple querySelector: find first child matching class selector
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        if (!cls) return null;
        return this._children.find(c => typeof c.className === 'string' && c.className.includes(cls)) ?? null;
      },
      closest(sel) {
        const cls = sel.startsWith('.') ? sel.slice(1) : null;
        if (!cls) return null;
        return (this.className || '').includes(cls) ? this : null;
      },
      querySelectorAll() { return []; },
    };
    return el;
  }

  const scrollEl = makeEl('div');
  scrollEl.className = 'stories-scroll';
  scrollEl._children = [];

  // Override appendChild to track real children array length
  const origAppend = scrollEl.appendChild.bind(scrollEl);
  scrollEl.appendChild = function(child) { origAppend(child); };

  Object.defineProperty(scrollEl, 'children', {
    get() { return this._children; },
  });

  return { scrollEl, makeEl };
}

function buildStoriesWidgetClass(globalMocks = {}) {
  const globals = {
    BffApiService: {
      barbearias: {
        listarStories: async () => ({ data: [], error: null }),
      },
    },
    ApiService: { getLogoUrl: p => `https://cdn/${p}` },
    document: {
      createElement: (tag) => {
        const el = {
          _tag: tag,
          _children: [],
          _attrs: {},
          className: '',
          src: '',
          alt: '',
          muted: false,
          loop: false,
          preload: '',
          type: '',
          textContent: '',
          innerHTML: '',
          hidden: false,
          onerror: null,
          dataset: {},
          style: {},
          setAttribute(k, v) { this._attrs[k] = v; },
          getAttribute(k) { return this._attrs[k] ?? null; },
          appendChild(child) { this._children.push(child); },
          querySelector(sel) {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            if (!cls) return null;
            return this._children.find(c => (c.className ?? '').includes(cls)) ?? null;
          },
          closest(sel) {
            const cls = sel.startsWith('.') ? sel.slice(1) : null;
            if (!cls) return null;
            return (this.className ?? '').includes(cls) ? this : null;
          },
          querySelectorAll() { return []; },
        };
        return el;
      },
    },
    ...globalMocks,
  };

  const fn = new Function(
    ...Object.keys(globals),
    `${src}\nreturn StoriesWidget;`,
  );
  return fn(...Object.values(globals));
}

test('StoriesWidget pode ser instanciado sem lançar erros', () => {
  const StoriesWidget = buildStoriesWidgetClass();
  assert.strictEqual(typeof StoriesWidget, 'function');

  const scrollEl = { children: [], innerHTML: '', hidden: false, querySelectorAll: () => [] };
  const widget   = new StoriesWidget(scrollEl, { barbershopId: 'test-id', shopName: 'Test' });
  assert.ok(widget instanceof StoriesWidget);
});

test('StoriesWidget.iniciarHome é método estático que aceita null sem lançar', () => {
  const StoriesWidget = buildStoriesWidgetClass();
  assert.strictEqual(typeof StoriesWidget.iniciarHome, 'function');
  assert.doesNotThrow(() => StoriesWidget.iniciarHome(null));
});

test('StoriesWidget.carregar oculta section quando BFF retorna lista vazia', async () => {
  let sectionHidden = false;
  const scrollEl = {
    children: [],
    innerHTML: '',
    hidden: false,
    querySelectorAll: () => [],
    closest: (sel) => {
      if (sel === '.bp-stories-section') {
        return { hidden: false, set hidden(v) { sectionHidden = v; } };
      }
      return null;
    },
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: { listarStories: async () => ({ data: [], error: null }) },
    },
  });

  const widget = new StoriesWidget(scrollEl, { barbershopId: '11111111-0000-0000-0000-000000000001' });
  await widget.carregar();
  assert.ok(sectionHidden, 'section deve ser ocultada quando não há stories');
});

test('StoriesWidget.carregar popula scroll com cards quando BFF retorna stories', async () => {
  const appendedCards = [];
  let capturedVideo   = null;

  const scrollEl = {
    get children() { return appendedCards; },
    innerHTML: '',
    hidden: false,
    querySelectorAll: () => [],
    closest: () => ({ hidden: false }),
    appendChild(c) { appendedCards.push(c); },
  };

  const fakeStory = {
    id: 'story-uuid-1',
    owner_id: 'owner-uuid-1',
    media_url: 'https://storage.example.com/signed/video.mp4',
    views_count: 42,
  };

  // Injeta document mock que captura o elemento <video> criado
  const mockDoc = {
    createElement(tag) {
      const el = {
        _tag: tag,
        _children: [],
        _attrs: {},
        className: '',
        src: '',
        alt: '',
        muted: false,
        loop: false,
        preload: '',
        type: '',
        textContent: '',
        innerHTML: '',
        hidden: false,
        onerror: null,
        dataset: {},
        style: {},
        setAttribute(k, v) { this._attrs[k] = v; },
        appendChild(child) { this._children.push(child); },
        querySelector() { return null; },
        closest() { return null; },
        querySelectorAll() { return []; },
      };
      if (tag === 'video') capturedVideo = el;
      return el;
    },
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: { listarStories: async () => ({ data: [fakeStory], error: null }) },
    },
    document: mockDoc,
  });

  const widget = new StoriesWidget(scrollEl, {
    barbershopId: '11111111-0000-0000-0000-000000000001',
    shopName:     'Barbearia Teste',
    shopLogoSrc:  'https://cdn/logo.jpg',
  });
  await widget.carregar();

  assert.strictEqual(appendedCards.length, 1, 'deve adicionar 1 card ao scroll');

  const card = appendedCards[0];
  assert.ok((card.className ?? '').includes('story-card'), 'card deve ter classe story-card');
  assert.strictEqual(card.dataset.storyId, fakeStory.id,       'storyId no dataset');
  assert.strictEqual(card.dataset.ownerId, fakeStory.owner_id, 'ownerId no dataset');

  assert.ok(capturedVideo, 'elemento <video> deve ter sido criado');
  assert.strictEqual(capturedVideo.src, fakeStory.media_url, 'video.src deve ser media_url');
});

test('StoriesWidget modo scan ignora cards com IDs de demonstração 00000000', async () => {
  let hiddenCalled = false;
  const demoCard = {
    dataset: { ownerId: '00000000-0000-0000-0000-000000000001' },
    hidden: false,
    querySelector: () => null,
  };

  const scrollEl = {
    children: [],
    innerHTML: '',
    hidden: false,
    querySelectorAll: (sel) => sel.includes('.story-card') ? [demoCard] : [],
    closest: (sel) => {
      if (sel === '.bp-stories-section') return null;
      return null;
    },
    set hidden(v) { hiddenCalled = v; },
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: { listarStories: async () => ({ data: [], error: null }) },
    },
  });

  const widget = new StoriesWidget(scrollEl); // sem barbershopId → modo scan
  await widget.carregar();

  // Card de demonstração deve ser ignorado (sem chamada ao BFF e sem ocultar)
  assert.strictEqual(demoCard.hidden, false, 'card demo não deve ser ocultado pelo widget');
});

test('StoriesWidget modo scan popula video.src para cards com IDs reais', async () => {
  const OWNER_ID   = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  let capturedSrc  = '';

  const realCard = {
    dataset: { ownerId: OWNER_ID, storyId: '' },
    hidden: false,
    querySelector(sel) {
      if (sel === '.story-video') {
        return { set src(v) { capturedSrc = v; }, get src() { return capturedSrc; } };
      }
      return null;
    },
  };

  const scrollEl = {
    children: [],
    innerHTML: '',
    hidden: false,
    querySelectorAll: (sel) => sel.includes('.story-card') ? [realCard] : [],
    closest: () => null,
  };

  const fakeStory = {
    id:        'story-real-1',
    owner_id:  OWNER_ID,
    media_url: 'https://supabase.example.com/signed/video.mp4',
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: {
        listarStories: async (oid) => {
          if (oid === OWNER_ID) return { data: [fakeStory], error: null };
          return { data: [], error: null };
        },
      },
    },
  });

  const widget = new StoriesWidget(scrollEl);
  await widget.carregar();

  assert.strictEqual(capturedSrc, fakeStory.media_url,  'video.src deve ser media_url');
  assert.strictEqual(realCard.dataset.storyId, fakeStory.id, 'storyId deve ser atualizado');
  assert.strictEqual(realCard.hidden, false, 'card com story real não deve ser ocultado');
});
