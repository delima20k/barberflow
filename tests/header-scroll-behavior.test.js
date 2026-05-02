'use strict';
const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { carregar } = require('./_helpers.js');

// =============================================================================
// Helpers de DOM mock
// =============================================================================

/**
 * Cria um elemento stub mínimo com classList, getBoundingClientRect,
 * getAnimations e addEventListener/dispatchEvent.
 */
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
      // onfinish não é invocado automaticamente nos testes — chamamos manualmente se necessário
      a.onfinish = null;
      return a;
    },
    addEventListener: (ev, handler, opts) => {
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

/**
 * Cria o sandbox VM com um DOM mínimo para HeaderScrollBehavior.
 * Retorna { sandbox, header, telaInicio, telaMinhaBarbearia, storiesEl, mbStoriesEl, dispararNavEvent }.
 */
function criarSandbox() {
  const header          = criarEl('app-header');
  const telaInicio      = criarEl('tela-inicio');
  const telaMinhaBarbearia = criarEl('tela-minha-barbearia');
  const storiesEl       = criarEl('stories-scroll');
  const mbStoriesEl     = criarEl('mb-stories-scroll');

  // O #tentarRegistrar para minha-barbearia usa document.querySelector('.mb-stories-scroll')
  // O para inicio usa '#tela-inicio .stories-scroll:not(.mb-stories-scroll)'
  storiesEl.getBoundingClientRect  = () => ({ top: 56, bottom: 180 });
  mbStoriesEl.getBoundingClientRect = () => ({ top: 300, bottom: 420 });

  const docListeners = {};

  const document = {
    getElementById: (id) => {
      if (id === 'app-header') return header;
      if (id === 'tela-inicio') return telaInicio;
      if (id === 'tela-minha-barbearia') return telaMinhaBarbearia;
      return null;
    },
    querySelector: (sel) => {
      if (sel.includes('mb-stories-scroll')) return mbStoriesEl;
      if (sel.includes('stories-scroll'))    return storiesEl;
      if (sel.includes('.tela.ativa'))        return null;     // sobrescrito no teste
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

  // Sobrescrever querySelector para testes específicos
  const dispararNavEvent = (dur = 320) => {
    const evt = { type: 'barberflow:tela-entrando', detail: { dur } };
    (docListeners['barberflow:tela-entrando'] ?? []).forEach(h => h(evt));
  };

  return { sandbox, header, telaInicio, telaMinhaBarbearia, storiesEl, mbStoriesEl, document, dispararNavEvent };
}

// =============================================================================
// Testes
// =============================================================================

suite('HeaderScrollBehavior — init', () => {
  test('init() registra tela-inicio e tela-minha-barbearia quando presentes no DOM', () => {
    const { sandbox, telaInicio, telaMinhaBarbearia } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    // Verifica que os listeners de scroll foram registrados
    assert.ok(telaInicio._listeners['scroll']?.length > 0,
      'tela-inicio deve ter listener de scroll');
    assert.ok(telaMinhaBarbearia._listeners['scroll']?.length > 0,
      'tela-minha-barbearia deve ter listener de scroll');
  });

  test('init() não registra tela-minha-barbearia se ausente do DOM', () => {
    const { document } = criarSandbox();

    // DOM sem tela-minha-barbearia
    const docSemMB = Object.assign({}, document, {
      getElementById: (id) => id === 'tela-minha-barbearia' ? null : document.getElementById(id),
    });
    const sandbox2 = vm.createContext({ 'use strict': undefined, document: docSemMB, console });
    carregar(sandbox2, 'shared/js/HeaderScrollBehavior.js');
    // Não deve lançar — apenas não registra
    assert.doesNotThrow(() => sandbox2.HeaderScrollBehavior.init());
  });

  test('init() é idempotente — segunda chamada não re-registra listeners', () => {
    const { sandbox, telaInicio } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();
    const contagem1 = telaInicio._listeners['scroll']?.length ?? 0;
    sandbox.HeaderScrollBehavior.init();
    const contagem2 = telaInicio._listeners['scroll']?.length ?? 0;
    assert.equal(contagem1, contagem2, 'segundo init não deve duplicar listeners');
  });
});

suite('HeaderScrollBehavior — barberflow:tela-entrando', () => {
  test('evento tela-entrando revela o header quando #oculto=true', () => {
    const { sandbox, header, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    // Forçar estado oculto: classe presente + #oculto via desync detecção
    header.classList.add('header--oculto');

    dispararNavEvent(320);

    assert.equal(header.classList.contains('header--oculto'), false,
      'header--oculto deve ser removido após evento tela-entrando');
  });

  test('evento tela-entrando revela header mesmo quando #oculto=false mas classe CSS presente (desync)', () => {
    const { sandbox, header, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    // Estado de dessincronização: #oculto=false mas classe presente
    header.classList.add('header--oculto');
    // Não chamamos #ocultar() — #oculto continua false
    // O #exibir deve detectar a classe e revelar

    dispararNavEvent(320);

    assert.equal(header.classList.contains('header--oculto'), false,
      '#exibir deve revelar header mesmo com dessincronização de estado');
  });

  test('evento tela-entrando atualiza ultimoScroll para scrollTop atual de cada tela', () => {
    const { sandbox, header, telaInicio, telaMinhaBarbearia, document, dispararNavEvent } = criarSandbox();
    sandbox.HeaderScrollBehavior.init();

    // Simular telas com scrollTop não-zero
    telaInicio.scrollTop = 200;
    telaMinhaBarbearia.scrollTop = 500;

    dispararNavEvent(320);

    // Após o evento, o próximo scroll para cima em tela-inicio deve revelar o header
    // (comportamento correto: scrollAtual < ultimoScroll agora = 200)
    telaInicio.scrollTop = 199;
    // Nenhuma tela ativa — pode processar tela-inicio
    document.querySelector = () => null;
    header.classList.add('header--oculto');
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false,
      'scroll para cima deve revelar header com ultimoScroll atualizado');
  });
});

suite('HeaderScrollBehavior — tela-inicio scroll guard', () => {
  test('scroll em tela-inicio NÃO oculta header quando outra tela tem classe ativa', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    // Sobrescrever querySelector para retornar outra tela com classe ativa
    const outraTela = criarEl('tela-outra');
    outraTela.classList.add('ativa');
    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa')) return outraTela;
      if (sel.includes('mb-stories-scroll')) return criarEl();
      if (sel.includes('stories-scroll'))    return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    // Posicionar stories sobre o header (deve ocultar normalmente)
    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;

    // Disparar scroll em tela-inicio
    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false,
      'tela-inicio não deve ocultar header quando outra tela está ativa (ativa)');
  });

  test('scroll em tela-inicio NÃO oculta header quando outra tela tem classe entrando-lento', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    const outraTela = criarEl('tela-outra');
    outraTela.classList.add('entrando-lento');
    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa, .tela.entrando-lento')) return outraTela;
      if (sel.includes('mb-stories-scroll')) return criarEl();
      if (sel.includes('stories-scroll'))    return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;

    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false,
      'tela-inicio não deve ocultar header quando outra tela está entrando (entrando-lento)');
  });

  test('scroll em tela-inicio oculta header quando nenhuma outra tela está ativa', () => {
    const { sandbox, header, telaInicio, storiesEl, document } = criarSandbox();

    // Nenhuma outra tela ativa
    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa') || sel.includes('entrando-lento')) return null;
      if (sel.includes('mb-stories-scroll')) return criarEl();
      if (sel.includes('stories-scroll'))    return storiesEl;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    // stories toca o header (topo do stories === bottom do header)
    storiesEl.getBoundingClientRect = () => ({ top: 56, bottom: 180 });
    header.getBoundingClientRect    = () => ({ top: 0, bottom: 56 });
    telaInicio.scrollTop = 1;  // scroll para baixo

    telaInicio._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), true,
      'header deve ser ocultado ao rolar tela-inicio quando ela está em primeiro plano');
  });
});

suite('HeaderScrollBehavior — tela-minha-barbearia scroll', () => {
  test('scroll para baixo em minha-barbearia oculta header quando mb-stories-scroll toca o header', () => {
    const { sandbox, header, telaMinhaBarbearia, mbStoriesEl, document } = criarSandbox();

    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa') || sel.includes('entrando-lento')) return null;
      if (sel.includes('mb-stories-scroll')) return mbStoriesEl;
      if (sel.includes('stories-scroll'))    return null;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    // mb-stories-scroll toca o header
    mbStoriesEl.getBoundingClientRect = () => ({ top: 56, bottom: 300 });
    header.getBoundingClientRect      = () => ({ top: 0, bottom: 56 });
    telaMinhaBarbearia.scrollTop = 1;  // scroll para baixo

    telaMinhaBarbearia._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), true,
      'header deve ser ocultado ao rolar minha-barbearia e mb-stories-scroll tocar o header');
  });

  test('scroll para cima em minha-barbearia revela o header', () => {
    const { sandbox, header, telaMinhaBarbearia, mbStoriesEl, document, dispararNavEvent } = criarSandbox();

    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa') || sel.includes('entrando-lento')) return null;
      if (sel.includes('mb-stories-scroll')) return mbStoriesEl;
      if (sel.includes('stories-scroll'))    return null;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    // Primeiro: ocultar o header via scroll para baixo
    mbStoriesEl.getBoundingClientRect = () => ({ top: 56, bottom: 300 });
    header.getBoundingClientRect      = () => ({ top: 0, bottom: 56 });
    telaMinhaBarbearia.scrollTop = 100;
    telaMinhaBarbearia._dispatchScroll();
    assert.equal(header.classList.contains('header--oculto'), true, 'pré-condição: header oculto');

    // Cancelar a animação manual para o teste funcionar (estado limpo)
    header._anims.forEach(a => a.cancel());

    // Agora: scroll para cima
    telaMinhaBarbearia.scrollTop = 90;
    telaMinhaBarbearia._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false,
      'header deve ser revelado ao rolar minha-barbearia para cima');
  });

  test('mb-stories-scroll acima do threshold não oculta header quando ainda está abaixo do header', () => {
    const { sandbox, header, telaMinhaBarbearia, mbStoriesEl, document } = criarSandbox();

    document.querySelector = (sel) => {
      if (sel.includes('.tela.ativa') || sel.includes('entrando-lento')) return null;
      if (sel.includes('mb-stories-scroll')) return mbStoriesEl;
      if (sel.includes('stories-scroll'))    return null;
      return null;
    };

    sandbox.HeaderScrollBehavior.init();

    // mb-stories-scroll ABAIXO do header (ainda não tocou)
    mbStoriesEl.getBoundingClientRect = () => ({ top: 80, bottom: 300 });  // top > header.bottom(56)
    header.getBoundingClientRect      = () => ({ top: 0, bottom: 56 });
    telaMinhaBarbearia.scrollTop = 1;

    telaMinhaBarbearia._dispatchScroll();

    assert.equal(header.classList.contains('header--oculto'), false,
      'header NÃO deve ser ocultado enquanto mb-stories-scroll ainda está abaixo do header');
  });
});
