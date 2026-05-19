'use strict';
const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { carregar } = require('./_helpers.js');

// =============================================================================
// Helpers de DOM mock
// =============================================================================

function criarEl(id = '') {
  const _classes   = new Set();
  const _listeners = {};
  const _anims     = [];

  const el = {
    id,
    style: {},
    scrollTop: 0,
    offsetHeight: 56,
    classList: {
      add:      (...cls) => cls.forEach(c => _classes.add(c)),
      remove:   (...cls) => cls.forEach(c => _classes.delete(c)),
      contains: c => _classes.has(c),
      _classes,
    },
    getBoundingClientRect: () => ({ top: 0, bottom: 56 }),
    getAnimations:  () => [..._anims],
    animate:        () => {
      const a = { cancel: () => { const i = _anims.indexOf(a); if (i > -1) _anims.splice(i, 1); } };
      _anims.push(a);
      a.onfinish = null;
      return a;
    },
    addEventListener: (ev, handler) => {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(handler);
    },
    dispatchEvent: (evt) => {
      (_listeners[evt.type] ?? []).forEach(h => h(evt));
    },
    _listeners,
    _anims,
    _dispatchScroll: () => {
      (_listeners['scroll'] ?? []).forEach(h => h());
    },
  };

  return el;
}

function criarSandbox() {
  const header     = criarEl('app-header');
  const telaInicio = criarEl('tela-inicio');
  const storiesEl  = criarEl('stories-scroll');

  storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });

  const docListeners = {};

  const document = {
    getElementById: (id) => {
      if (id === 'app-header') return header;
      if (id === 'tela-inicio') return telaInicio;
      return null;
    },
    querySelector: (sel) => {
      if (sel.includes('stories-scroll')) return storiesEl;
      if (sel.includes('.tela.ativa'))    return null;
      return null;
    },
    addEventListener: (ev, handler) => {
      if (!docListeners[ev]) docListeners[ev] = [];
      docListeners[ev].push(handler);
    },
    _listeners: docListeners,
  };

  const sandbox = vm.createContext({ 'use strict': undefined, document, console });
  carregar(sandbox, 'shared/js/HeaderScrollBehavior.js');

  const dispararNavEvent = (dur = 320) => {
    const evt = { type: 'barberflow:tela-entrando', detail: { dur } };
    (docListeners['barberflow:tela-entrando'] ?? []).forEach(h => h(evt));
  };

  return { sandbox, header, telaInicio, storiesEl, document, dispararNavEvent };
}

// =============================================================================
// Testes
// =============================================================================

suite('HeaderScrollBehavior — init', () => {
  test('init() registra apenas tela-inicio (minha-barbearia abre abaixo do header)', () => {
    const { sandbox, telaInicio } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    assert.ok(telaInicio._listeners['scroll']?.length > 0,
      'tela-inicio deve ter listener de scroll');
  });

  test('init() não lança se #app-header ausente', () => {
    const document = {
      getElementById: () => null,
      querySelector:  () => null,
      addEventListener: () => {},
    };
    const sandbox = vm.createContext({ 'use strict': undefined, document, console });
    carregar(sandbox, 'shared/js/HeaderScrollBehavior.js');
    assert.doesNotThrow(() => sandbox.HeaderScrollBehavior.init());
  });

  test('init() é idempotente', () => {
    const { sandbox, telaInicio } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();
    const c1 = telaInicio._listeners['scroll']?.length ?? 0;
    sandbox.HeaderScrollBehavior.init();
    const c2 = telaInicio._listeners['scroll']?.length ?? 0;
    assert.equal(c1, c2);
  });
});

suite('HeaderScrollBehavior — barberflow:tela-entrando', () => {
  test('evento tela-entrando revela o header quando classe header--oculto está presente', () => {
    const { sandbox, header, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    header.classList.add('header--oculto');
    dispararNavEvent(320);

    assert.equal(header.classList.contains('header--oculto'), false);
  });

  test('evento tela-entrando NÃO executa animação se header já está visível', () => {
    const { sandbox, header, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    // header já está visível (sem classe, sem flag oculto)
    dispararNavEvent(320);

    assert.equal(header._anims.length, 0,
      'não deve disparar WAAPI se o header já está visível');
  });

  test('evento tela-entrando atualiza ultimoScroll para scrollTop atual', () => {
    const { sandbox, header, telaInicio, document, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    telaInicio.scrollTop = 200;
    dispararNavEvent(320);

    telaInicio.scrollTop = 199;
    document.querySelector = () => null;
    header.classList.add('header--oculto');
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false);
  });
});

suite('HeaderScrollBehavior — tela-inicio scroll guard', () => {
  test('NÃO oculta header quando outra tela está ativa', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    const outra = criarEl('tela-outra');
    outra.classList.add('ativa');
    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa')) return outra;
      if (sel.includes('stories-scroll')) return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false);
  });

  test('NÃO oculta header quando outra tela está entrando-lento', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    const outra = criarEl('tela-outra');
    outra.classList.add('entrando-lento');
    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa, .tela.entrando-lento')) return outra;
      if (sel.includes('stories-scroll')) return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false);
  });

  test('OCULTA header quando nenhuma outra tela está ativa', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa') || sel.includes('entrando-lento')) return null;
      if (sel.includes('stories-scroll')) return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), true);
  });
});
