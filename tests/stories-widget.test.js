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

test('StoriesWidget cria cards com thumbnail estatica sem carregar video completo', () => {
  assert.doesNotMatch(src, /thumb\.src\s*=\s*story\.media_url/);
  assert.doesNotMatch(src, /video\.src\s*=\s*story\.media_url/);
  assert.match(src, /story-video/);
  assert.match(src, /story-card/);
  // play-btn NÃO deve mais ser criado nos templates de card
  assert.doesNotMatch(src, /playBtn\.className\s*=\s*'story-play-btn'/);
  // story-shop-overlay NÃO deve ser criado nos templates
  assert.doesNotMatch(src, /shopOverlay\.className\s*=.*story-shop-overlay/);
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
      get classList() {
        const self = this;
        return {
          _set: new Set((self.className || '').split(' ').filter(Boolean)),
          add(...cls) { cls.forEach(c => { this._set.add(c); self.className = [...this._set].join(' '); }); },
          remove(...cls) { cls.forEach(c => { this._set.delete(c); self.className = [...this._set].join(' '); }); },
          toggle(c, force) {
            const has = this._set.has(c);
            if (force === true || (!has && force === undefined)) this.add(c);
            else if (force === false || has) this.remove(c);
          },
          contains(c) { return this._set.has(c); },
        };
      },
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k] ?? null; },
      appendChild(child) { this._children.push(child); },
      addEventListener() {},
      removeEventListener() {},
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
          get classList() {
            const self = this;
            const _set = new Set((self.className || '').split(' ').filter(Boolean));
            return {
              add(...cls) { cls.forEach(c => { _set.add(c); self.className = [..._set].join(' '); }); },
              remove(...cls) { cls.forEach(c => { _set.delete(c); self.className = [..._set].join(' '); }); },
              toggle(c, force) {
                const has = _set.has(c);
                if (force === true || (!has && force === undefined)) this.add(c);
                else if (force === false || has) this.remove(c);
              },
              contains(c) { return _set.has(c); },
            };
          },
          setAttribute(k, v) { this._attrs[k] = v; },
          getAttribute(k) { return this._attrs[k] ?? null; },
          appendChild(child) { this._children.push(child); },
          addEventListener() {},
          removeEventListener() {},
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
  let capturedImage   = null;

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

  // Injeta document mock que captura os elementos criados
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
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        closest() { return null; },
        querySelectorAll() { return []; },
      };
      if (tag === 'video') capturedVideo = el;
      if (tag === 'img') capturedImage = el;
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
    context:      'public-shop',
  });
  await widget.carregar();

  assert.strictEqual(appendedCards.length, 1, 'deve adicionar 1 card ao scroll');

  const card = appendedCards[0];
  assert.ok((card.className ?? '').includes('story-card'), 'card deve ter classe story-card');
  assert.strictEqual(card.dataset.shopId, '11111111-0000-0000-0000-000000000001', 'shopId no dataset');
  assert.strictEqual(card.dataset.storyIdx, '0', 'storyIdx no dataset');

  assert.strictEqual(capturedVideo, null, 'card nao deve criar elemento <video>');
  assert.ok(capturedImage, 'card deve criar thumbnail <img>');
  assert.notStrictEqual(capturedImage.src, fakeStory.media_url, 'thumbnail nao deve usar video media_url');
});

test('StoriesWidget public-shop renderiza N cards e preserva indice clicado', async () => {
  const appendedCards = [];
  const scrollEl = {
    get children() { return appendedCards; },
    innerHTML: '',
    hidden: false,
    querySelectorAll: () => [],
    closest: () => ({ hidden: false }),
    appendChild(c) { appendedCards.push(c); },
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: {
        listarStories: async () => ({
          data: [
            { id: 's1', owner_id: 'owner', media_url: 'https://cdn/1.mp4', media_type: 'video' },
            { id: 's2', owner_id: 'owner', media_url: 'https://cdn/2.mp4', media_type: 'video' },
            { id: 's3', owner_id: 'owner', media_url: 'https://cdn/3.mp4', media_type: 'video' },
          ],
          error: null,
        }),
      },
    },
  });

  const widget = new StoriesWidget(scrollEl, {
    barbershopId: 'shop-public',
    shopName: 'Barbearia Publica',
    context: 'public-shop',
  });
  await widget.carregar();

  assert.strictEqual(appendedCards.length, 3, 'public-shop deve renderizar 1 card por video');
  assert.deepStrictEqual(appendedCards.map(card => card.dataset.storyIdx), ['0', '1', '2']);
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

  const widget = new StoriesWidget(scrollEl, { context: 'scan' });
  await widget.carregar();

  // Card de demonstração deve ser ignorado (sem chamada ao BFF e sem ocultar)
  assert.strictEqual(demoCard.hidden, false, 'card demo não deve ser ocultado pelo widget');
});

// ── Novos testes — StoryPlayer e preload ─────────────────────────────────────

test('StoriesWidget define MediaViewer singleton e open()', () => {
  assert.match(src, /class MediaViewer/);
  assert.match(src, /getInstance\(\)/);
  assert.match(src, /open\s*\(\s*\{/);
  assert.match(src, /media-viewer/);
  assert.match(src, /is-loaded/);
});

test('StoriesWidget.carregar popula card de video com imagem estatica', async () => {
  const appendedCards = [];
  let capturedVideo = null;
  let capturedImage = null;

  const scrollEl = {
    get children() { return appendedCards; },
    innerHTML: '',
    hidden: false,
    querySelectorAll: () => [],
    closest: () => ({ hidden: false }),
    appendChild(c) { appendedCards.push(c); },
  };

  const mockDoc = {
    createElement(tag) {
      const el = {
        _tag: tag, _children: [], _attrs: {}, className: '', src: '', alt: '',
        muted: false, loop: false, preload: '', type: '', textContent: '',
        innerHTML: '', hidden: false, onerror: null, onloadedmetadata: null,
        dataset: {}, style: {},
        get classList() {
          const self = this;
          const _set = new Set((self.className || '').split(' ').filter(Boolean));
          return {
            add(...cls) { cls.forEach(c => { _set.add(c); self.className = [..._set].join(' '); }); },
            remove(...cls) { cls.forEach(c => { _set.delete(c); self.className = [..._set].join(' '); }); },
            toggle(c, force) {
              const has = _set.has(c);
              if (force === true || (!has && force === undefined)) this.add(c);
              else if (force === false || has) this.remove(c);
            },
            contains(c) { return _set.has(c); },
          };
        },
        setAttribute(k, v) { this._attrs[k] = v; },
        appendChild(child) { this._children.push(child); },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        closest() { return null; },
        querySelectorAll() { return []; },
      };
      if (tag === 'video') capturedVideo = el;
      if (tag === 'img') capturedImage = el;
      return el;
    },
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: {
        listarStories: async () => ({
          data: [{ id: 'sid', owner_id: 'oid', media_url: 'https://cdn/v.mp4', media_type: 'video', views_count: 0 }],
          error: null,
        }),
      },
    },
    document: mockDoc,
  });

  const widget = new StoriesWidget(scrollEl, { barbershopId: 'bbb' });
  await widget.carregar();

  assert.strictEqual(capturedVideo, null, 'card nao deve criar video');
  assert.ok(capturedImage, 'card deve criar img estatica');
  assert.doesNotMatch(capturedImage.src, /v\.mp4$/, 'img nao deve apontar para o video completo');
});
test('StoriesWidget.carregar não lança quando scrollEl não tem addEventListener', async () => {
  const scrollEl = {
    children: [],
    innerHTML: '',
    hidden: false,
    querySelectorAll: () => [],
    closest: () => null,
  };

  const StoriesWidget = buildStoriesWidgetClass({
    BffApiService: {
      barbearias: { listarStories: async () => ({ data: [], error: null }) },
    },
  });

  const widget = new StoriesWidget(scrollEl, { barbershopId: 'aaa' });
  await assert.doesNotReject(() => widget.carregar(), 'carregar não deve lançar sem addEventListener');
});

test('StoriesWidget modo scan usa poster estatico para cards com IDs reais', async () => {
  const OWNER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  let capturedSrc = '';
  let capturedPoster = '';

  const realCard = {
    dataset: { ownerId: OWNER_ID, storyId: '' },
    hidden: false,
    querySelector(sel) {
      if (sel === '.story-video') {
        return {
          tagName: 'VIDEO',
          preload: '',
          set src(v) { capturedSrc = v; },
          get src() { return capturedSrc; },
          setAttribute(k, v) { if (k === 'poster') capturedPoster = v; },
          removeAttribute(k) { if (k === 'src') capturedSrc = ''; },
          closest() { return { classList: { add() {} } }; },
        };
      }
      return null;
    },
  };

  const scrollEl = {
    children: [],
    innerHTML: '',
    hidden: false,
    querySelectorAll: (sel) => {
      if (sel.includes('[data-owner-id]')) return [realCard];
      if (sel.includes('[data-shop-id]')) return [];
      return [];
    },
    closest: () => null,
  };

  const fakeStory = {
    id: 'story-real-1',
    owner_id: OWNER_ID,
    media_url: 'https://supabase.example.com/signed/video.mp4',
    media_type: 'video',
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

  const widget = new StoriesWidget(scrollEl, { context: 'scan' });
  await widget.carregar();

  assert.strictEqual(capturedSrc, '', 'video estatico nao deve receber src');
  assert.notStrictEqual(capturedPoster, fakeStory.media_url, 'poster nao deve usar video completo');
  assert.strictEqual(realCard.dataset.shopId, OWNER_ID, 'shopId deve ser atualizado');
  assert.strictEqual(realCard.hidden, false, 'card com story real nao deve ser ocultado');
});
