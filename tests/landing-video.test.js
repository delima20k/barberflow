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
  static create(videoId) {
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
    const controller = new context.YouTubeVideoController(root, videoId);
    return { controller, root, loadButton, title, description, created };
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

  it('deve criar o iframe youtube-nocookie somente depois do clique', () => {
    const fixture = YouTubeVideoFixture.create('AbC_123-xY');

    fixture.controller.init();
    const beforeClick = fixture.created.length;
    fixture.loadButton.click();

    assert.deepEqual(
      {
        beforeClick,
        state: fixture.root.dataset.videoState,
        frameCount: fixture.created.length,
        source: fixture.root.children[0].src,
        loading: fixture.root.children[0].loading,
      },
      {
        beforeClick: 0,
        state: 'ready',
        frameCount: 1,
        source: 'https://www.youtube-nocookie.com/embed/AbC_123-xY?rel=0',
        loading: 'lazy',
      },
    );
  });
});
