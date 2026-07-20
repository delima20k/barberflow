'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..', 'apps', 'landing-page');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  toggle(name, force) {
    const enabled = force ?? !this.values.has(name);
    enabled ? this.values.add(name) : this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.ownerDocument = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.disabled = false;
    this.scrollLeft = 0;
    this.clientWidth = 320;
    this.offsetLeft = 0;
    this.scrollRequest = null;
    this.scrollIntoViewCalled = false;
    this.#text = '';
  }

  #text;

  set className(value) {
    this.classList = new FakeClassList();
    String(value).split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
  }

  get className() {
    return [...this.classList.values].join(' ');
  }

  set textContent(value) {
    this.#text = String(value);
    this.children = [];
  }

  get textContent() {
    return [this.#text, ...this.children.map((child) => child.textContent)].join('');
  }

  append(...children) {
    children.forEach((child) => {
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      child.offsetLeft = this.children.length * this.clientWidth;
      this.children.push(child);
    });
  }

  replaceChildren(...children) {
    this.children = [];
    this.#text = '';
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    const normalized = {
      button: 0,
      pointerType: 'mouse',
      preventDefault() {},
      ...event,
      currentTarget: this,
    };
    this.listeners.get(type)?.forEach((listener) => listener(normalized));
  }

  listenerCount() {
    return [...this.listeners.values()]
      .reduce((total, listeners) => total + listeners.size, 0);
  }

  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }

  closest(selector) {
    if (selector === '[data-carousel-index]' && 'carouselIndex' in this.dataset) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  scrollTo(options) {
    this.scrollRequest = options;
    this.scrollLeft = options.left;
  }

  scrollIntoView() {
    this.scrollIntoViewCalled = true;
  }

  setPointerCapture() {}

  releasePointerCapture() {}
}

class FakeDocument {
  createElement(tagName) {
    const element = new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }
}

class CarouselFixture {
  constructor() {
    this.document = new FakeDocument();
    this.root = new FakeElement('section');
    this.viewport = new FakeElement('div');
    this.track = new FakeElement('div');
    this.previous = new FakeElement('button');
    this.next = new FakeElement('button');
    this.dots = new FakeElement('div');
    this.status = new FakeElement('p');
    this.nodes = new Map([
      ['[data-carousel-viewport]', this.viewport],
      ['[data-carousel-track]', this.track],
      ['[data-carousel-prev]', this.previous],
      ['[data-carousel-next]', this.next],
      ['[data-carousel-dots]', this.dots],
      ['[data-carousel-status]', this.status],
    ]);

    for (const element of [
      this.root,
      this.viewport,
      this.track,
      this.previous,
      this.next,
      this.dots,
      this.status,
    ]) {
      element.ownerDocument = this.document;
    }

    this.track.clientWidth = this.viewport.clientWidth;
    this.root.querySelector = (selector) => this.nodes.get(selector) ?? null;
  }

  load() {
    const context = vm.createContext({
      console,
      document: this.document,
      Object,
      globalThis: null,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (callback) => {
        callback();
        return 1;
      },
      cancelAnimationFrame() {},
    });
    context.globalThis = context;

    vm.runInContext(
      readFileSync(join(ROOT, 'config', 'landing-features.js'), 'utf8'),
      context,
    );
    vm.runInContext(
      readFileSync(join(ROOT, 'js', 'carousel.js'), 'utf8'),
      context,
    );

    return {
      Catalog: context.LandingFeatureCatalog,
      Carousel: context.LandingCarousel,
    };
  }
}

describe('LandingFeatureCatalog', () => {
  it('deve fornecer doze funcionalidades imutaveis e completas', () => {
    const fixture = new CarouselFixture();
    const { Catalog } = fixture.load();
    const features = Catalog.all();

    assert.equal(features.length, 12);
    assert.equal(new Set(features.map((feature) => feature.id)).size, 12);
    assert.equal(new Set(features.map((feature) => feature.image)).size, 12);
    assert.ok(features.every((feature) => feature.benefits.length === 3));
    assert.deepEqual(
      Array.from(features.filter((feature) => feature.imageReady), (feature) => feature.id),
      [
        'home',
        'barbearia-publica',
        'cadeiras-fila',
        'minha-barbearia',
        'presenca-barbeiros',
        'stories',
        'portfolio',
        'chatflow',
        'mapa',
        'card-whatsapp',
        'financas',
      ],
    );
    assert.deepEqual(
      Array.from(features.filter((feature) => !feature.imageReady), (feature) => feature.id),
      ['convite-parceiro'],
    );
    assert.ok(features.every((feature) => Object.isFrozen(feature)));
    assert.ok(features.every((feature) => Object.isFrozen(feature.benefits)));
    assert.ok(Object.isFrozen(features));
  });

  it('deve manter os prints ativos otimizados e disponiveis', () => {
    const fixture = new CarouselFixture();
    const { Catalog } = fixture.load();
    const readyFeatures = Catalog.all().filter((feature) => feature.imageReady);

    assert.equal(readyFeatures.length, 11);
    for (const feature of readyFeatures) {
      const imagePath = join(ROOT, feature.image);
      assert.equal(existsSync(imagePath), true, `Imagem ausente: ${feature.image}`);
      assert.ok(statSync(imagePath).size <= 200 * 1024, `Imagem acima de 200 KB: ${feature.image}`);

      const signature = readFileSync(imagePath).subarray(0, 12);
      assert.equal(signature.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(signature.subarray(8, 12).toString('ascii'), 'WEBP');
    }
  });

  it('deve preservar o enquadramento completo dos prints no mockup', () => {
    const css = readFileSync(join(ROOT, 'css', 'sections', 'showcase-media.css'), 'utf8');

    assert.match(css, /\.feature-media img\s*\{[\s\S]*?object-fit:\s*contain;/);
  });

  it('deve manter a ordem e os caminhos de imagem esperados', () => {
    const fixture = new CarouselFixture();
    const { Catalog } = fixture.load();
    const features = Catalog.all();

    assert.deepEqual(
      Array.from(features, (feature) => feature.id),
      [
        'home',
        'barbearia-publica',
        'cadeiras-fila',
        'minha-barbearia',
        'presenca-barbeiros',
        'stories',
        'portfolio',
        'chatflow',
        'mapa',
        'convite-parceiro',
        'card-whatsapp',
        'financas',
      ],
    );
    assert.equal(features[0].image, 'assets/images/screenshots/home-barberflow.webp');
    assert.equal(features[11].image, 'assets/images/screenshots/financas.webp');
  });

  it('nao deve anunciar atendimento em domicilio sem recurso no aplicativo', () => {
    const source = readFileSync(join(ROOT, 'config', 'landing-features.js'), 'utf8');

    assert.doesNotMatch(source, /barbeiro-movel|domic[ií]lio/i);
  });
});

describe('LandingCarousel', () => {
  it('deve renderizar os slides, indicadores e estado inicial acessivel', () => {
    const fixture = new CarouselFixture();
    const { Catalog, Carousel } = fixture.load();
    const carousel = new Carousel(fixture.root, Catalog.all()).init();

    assert.equal(fixture.track.children.length, 12);
    assert.equal(fixture.dots.children.length, 12);
    assert.match(fixture.track.children[0].textContent, /Encontre tudo logo na primeira tela/);
    assert.match(fixture.status.textContent, /Slide 1 de 12/);
    assert.equal(fixture.previous.disabled, true);
    assert.equal(fixture.next.disabled, false);
    assert.equal(carousel.index, 0);
  });

  it('deve limitar navegacao, aceitar teclado e indicadores', () => {
    const fixture = new CarouselFixture();
    const { Catalog, Carousel } = fixture.load();
    const carousel = new Carousel(fixture.root, Catalog.all()).init();

    carousel.goTo(99, 'auto');
    assert.equal(carousel.index, 11);
    assert.equal(fixture.next.disabled, true);
    assert.equal(fixture.viewport.scrollRequest.left, 11 * fixture.viewport.clientWidth);

    fixture.viewport.dispatch('keydown', { key: 'Home' });
    assert.equal(carousel.index, 0);

    fixture.dots.dispatch('click', { target: fixture.dots.children[4] });
    assert.equal(carousel.index, 4);
    assert.equal(fixture.dots.children[4].getAttribute('aria-current'), 'true');
  });

  it('deve permitir arraste por mouse e remover listeners no destroy', () => {
    const fixture = new CarouselFixture();
    const { Catalog, Carousel } = fixture.load();
    const carousel = new Carousel(fixture.root, Catalog.all()).init();

    fixture.viewport.dispatch('pointerdown', { clientX: 260, pointerId: 1 });
    fixture.viewport.dispatch('pointermove', { clientX: 80, pointerId: 1 });
    fixture.viewport.dispatch('pointerup', { clientX: 80, pointerId: 1 });
    assert.equal(carousel.index, 1);

    carousel.destroy();
    assert.equal(fixture.viewport.listenerCount(), 0);
    assert.equal(fixture.previous.listenerCount(), 0);
    assert.equal(fixture.next.listenerCount(), 0);
    assert.equal(fixture.dots.listenerCount(), 0);
  });
});
