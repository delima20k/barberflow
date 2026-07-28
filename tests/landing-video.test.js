'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const VIDEO_SOURCE = readFileSync(
  join(
    __dirname,
    '..',
    'apps',
    'landing-page',
    'js',
    'youtube-video.js',
  ),
  'utf8',
);

class YouTubeVideoFixture {
  static create(videoId, { observerAvailable = true } = {}) {
    const listeners = new Map();
    const loadButton = {
      hidden: true,
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      click() {
        listeners.get('click')?.();
      },
    };
    const observers = [];
    const observerFactory = observerAvailable
      ? (callback, options) => {
          const observer = {
            callback,
            options,
            observed: [],
            disconnected: false,
            observe(target) {
              this.observed.push(target);
            },
            disconnect() {
              this.disconnected = true;
            },
            trigger(entry) {
              this.callback([entry]);
            },
          };
          observers.push(observer);
          return observer;
        }
      : () => null;
    const title = { textContent: 'Vídeo de apresentação em breve' };
    const description = { textContent: 'Em breve' };
    const created = [];
    const root = {
      dataset: {},
      children: [],
      ownerDocument: {
        createElement(tagName) {
          const element = { tagName, src: '' };
          created.push(element);
          return element;
        },
      },
      querySelector(selector) {
        return {
          '[data-load-video]': loadButton,
          '[data-video-title]': title,
          '[data-video-description]': description,
        }[selector] ?? null;
      },
      replaceChildren(...children) {
        this.children = children;
      },
    };
    const context = vm.createContext({ console });
    vm.runInContext(VIDEO_SOURCE, context);
    const controller = new context.YouTubeVideoController(
      root,
      videoId,
      observerFactory,
    );
    return {
      controller,
      root,
      loadButton,
      title,
      description,
      created,
      observers,
    };
  }
}

describe('YouTubeVideoController', () => {
  it('deve manter o placeholder e nao criar iframe sem video configurado', () => {
    const fixture = YouTubeVideoFixture.create('');

    fixture.controller.init();

    assert.deepEqual(
      {
        state: fixture.root.dataset.videoState,
        buttonHidden: fixture.loadButton.hidden,
        frameCount: fixture.created.length,
      },
      {
        state: 'unavailable',
        buttonHidden: true,
        frameCount: 0,
      },
    );
  });

  it('deve iniciar o video sem som quando metade do player entrar na tela', () => {
    const fixture = YouTubeVideoFixture.create('AbC_123-xY');

    fixture.controller.init();
    const observer = fixture.observers[0];
    observer.trigger({
      target: fixture.root,
      isIntersecting: true,
      intersectionRatio: 0.49,
    });
    const beforeVisible = fixture.created.length;
    observer.trigger({
      target: fixture.root,
      isIntersecting: true,
      intersectionRatio: 0.5,
    });

    assert.deepEqual(
      {
        beforeVisible,
        threshold: observer.options.threshold,
        observedRoot: observer.observed[0] === fixture.root,
        disconnected: observer.disconnected,
        state: fixture.root.dataset.videoState,
        frameCount: fixture.created.length,
        source: fixture.root.children[0].src,
        loading: fixture.root.children[0].loading,
      },
      {
        beforeVisible: 0,
        threshold: 0.5,
        observedRoot: true,
        disconnected: true,
        state: 'loaded',
        frameCount: 1,
        source:
          'https://www.youtube-nocookie.com/embed/AbC_123-xY?rel=0&autoplay=1&mute=1&playsinline=1',
        loading: 'lazy',
      },
    );
  });

  it('deve manter o clique como fallback quando o observer nao estiver disponivel', () => {
    const fixture = YouTubeVideoFixture.create('AbC_123-xY', {
      observerAvailable: false,
    });

    fixture.controller.init();
    fixture.loadButton.click();

    assert.equal(fixture.root.dataset.videoState, 'loaded');
    assert.equal(fixture.created.length, 1);
    assert.equal(
      fixture.root.children[0].src,
      'https://www.youtube-nocookie.com/embed/AbC_123-xY?rel=0',
    );
  });

  it('deve encerrar a observacao ao destruir o controller', () => {
    const fixture = YouTubeVideoFixture.create('AbC_123-xY');

    fixture.controller.init();
    fixture.controller.destroy();

    assert.equal(fixture.observers[0].disconnected, true);
  });
});
