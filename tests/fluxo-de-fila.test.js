'use strict';
// =============================================================================
// fluxo-de-fila.test.js — TDD para FluxoDeFila
//
// Cobertura:
//   - abrir() retorna Promise
//   - overlay é adicionado ao body
//   - id é aplicado ao overlay quando fornecido
//   - duplicate overlay com mesmo id: anterior resolvido com null e removido
//   - tocarSom=true chama QueuePoller.tocarSom
//   - tocarSom=false não chama QueuePoller.tocarSom
//   - clicar em botão resolve com seu valor
//   - fecharBtn=true: botão ✕ resolve null
//   - Escape fecha apenas quando fecharBtn=true
//   - iconeImagem=true: cria <img> no ícone
//   - instância: new FluxoDeFila(config).abrir() idêntico ao static
// =============================================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── DOM mínimo ──────────────────────────────────────────────────────────────

function matchesSel(el, sel) {
  if (sel.startsWith('.')) {
    return (el.className ?? '').split(' ').includes(sel.slice(1));
  }
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return el.tagName?.toLowerCase() === sel.toLowerCase();
}

function todosDescendentes(el) {
  const diretos = [...(el._children ?? [])];
  return [...diretos, ...diretos.flatMap(todosDescendentes)];
}

function criarElMock(docRef) {
  const _children  = [];
  const _listeners = {};
  const _attrs     = {};
  let   _innerHTML = '';

  const el = {
    tagName:   'DIV',
    id:        '',
    className: '',
    style:     {},
    dataset:   {},
    _attrs, _listeners, _children,

    get innerHTML() { return _innerHTML; },
    set innerHTML(html) {
      _innerHTML = html;
      _children.length = 0;
      // Parseia tags abertas para criar elementos filhos
      const re = /<([a-z][a-z0-9]*)\b([^>]*?)(?:\/)?>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const [, tag, attrs] = m;
        const child = criarElMock(docRef);
        child.tagName = tag.toUpperCase();
        const cm = attrs.match(/\bclass="([^"]*)"/i);
        if (cm) child.className = cm[1];
        const im = attrs.match(/\bid="([^"]*)"/i);
        if (im) child.id = im[1];
        const sm = attrs.match(/\bsrc="([^"]*)"/i);
        if (sm) child._attrs.src = sm[1];
        _children.push(child);
      }
    },

    get textContent() { return this._text ?? ''; },
    set textContent(v) { this._text = String(v ?? ''); },

    setAttribute: (k, v) => { _attrs[k] = String(v); },
    getAttribute: k => _attrs[k] ?? null,

    appendChild: child => { _children.push(child); return child; },
    remove:  () => {},
    focus:   () => {},

    classList: (() => {
      const s = new Set();
      return {
        add:      (...c) => c.forEach(x => s.add(x)),
        remove:   (...c) => c.forEach(x => s.delete(x)),
        contains: c => s.has(c),
        _set:     s,
      };
    })(),

    addEventListener: (ev, h) => {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(h);
    },
    removeEventListener: (ev, h) => {
      if (_listeners[ev]) _listeners[ev] = _listeners[ev].filter(x => x !== h);
    },
    _fire: (ev, data) => [...(_listeners[ev] ?? [])].forEach(h => h(data ?? {})),

    querySelector: sel => {
      for (const c of _children) {
        if (matchesSel(c, sel)) return c;
        const found = c.querySelector?.(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: sel => {
      const result = [];
      for (const c of _children) {
        if (matchesSel(c, sel)) result.push(c);
        result.push(...(c.querySelectorAll?.(sel) ?? []));
      }
      return result;
    },
    closest: sel => matchesSel(el, sel) ? el : null,
  };
  return el;
}

function criarDomMock() {
  const appended  = [];
  const listeners = {};

  const doc = {
    body: {
      appendChild: el => appended.push(el),
      _appended: appended,
    },
    createElement: tag => {
      const el = criarElMock(doc);
      el.tagName = tag.toUpperCase();
      return el;
    },
    getElementById: id => {
      if (!id) return null;
      for (const el of appended) {
        if (el.id === id) return el;
        const found = todosDescendentes(el).find(e => e.id === id);
        if (found) return found;
      }
      return null;
    },
    addEventListener:    (ev, h) => { (listeners[ev] = listeners[ev] ?? []).push(h); },
    removeEventListener: (ev, h) => {
      if (listeners[ev]) listeners[ev] = listeners[ev].filter(x => x !== h);
    },
    // querySelectorAll no nível do documento — necessário para o safety-net
    // (FluxoDeFila.#fecharOverlaysRemanescentes busca '.fdf-overlay' no document).
    querySelectorAll: sel => {
      const result = [];
      for (const el of appended) {
        if (matchesSel(el, sel)) result.push(el);
        result.push(...(el.querySelectorAll?.(sel) ?? []));
      }
      return result;
    },
    _listeners: listeners,
    _fireDoc: (ev, data) => [...(listeners[ev] ?? [])].forEach(h => h(data ?? {})),
  };
  return doc;
}

/** Conta listeners de um evento registrados no document mock. */
function contarListenersDoc(doc, ev) {
  return (doc._listeners[ev] ?? []).length;
}

// ─── Factory de sandbox ───────────────────────────────────────────────────────

function criarSandbox() {
  const doc = criarDomMock();
  const tocarSomSpy = fn();

  const sandbox = vm.createContext({
    console,
    document: doc,
    window:   {},
    requestAnimationFrame: fn().mockImplementation(cb => cb()),
    setTimeout:            fn().mockImplementation((cb) => { /* não executa em testes */ }),
    clearTimeout:          fn(),
    QueuePoller: { tocarSom: tocarSomSpy },
  });

  carregar(sandbox, 'shared/js/FluxoDeFila.js');
  carregar(sandbox, 'shared/js/QueueModalPayloadBuilder.js');

  return { sandbox, doc, tocarSomSpy };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Retorna todos os botões com classe fdf-btn dentro do overlay */
function encontrarBotoes(overlay) {
  return overlay.querySelectorAll('button').filter(
    b => (b.className ?? '').split(' ').includes('fdf-btn'),
  );
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('FluxoDeFila — API básica', () => {

  test('FluxoDeFila.abrir() retorna Promise', () => {
    const { sandbox } = criarSandbox();
    const p = sandbox.FluxoDeFila.abrir({
      titulo: 'Teste',
      corpo:  'Corpo',
      acoes:  [{ label: 'OK', valor: 'ok' }],
    });
    assert.ok(typeof p?.then === 'function', 'deve retornar Promise (thenable)');
  });

  test('overlay é adicionado ao body', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [] });
    assert.equal(doc.body._appended.length, 1, 'body deve ter 1 overlay');
  });

  test('id é aplicado ao overlay quando fornecido', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ id: 'meu-modal', titulo: 'T', corpo: 'C', acoes: [] });
    assert.equal(doc.body._appended[0].id, 'meu-modal');
  });

  test('overlay sem id não tem atributo id', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [] });
    assert.equal(doc.body._appended[0].id, '');
  });
});

describe('FluxoDeFila — som', () => {

  test('tocarSom=true chama QueuePoller.tocarSom', () => {
    const { sandbox, tocarSomSpy } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [], tocarSom: true });
    assert.equal(tocarSomSpy.calls.length, 1);
  });

  test('tocarSom=false não chama QueuePoller.tocarSom', () => {
    const { sandbox, tocarSomSpy } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [], tocarSom: false });
    assert.equal(tocarSomSpy.calls.length, 0);
  });

  test('omitir tocarSom não chama QueuePoller.tocarSom', () => {
    const { sandbox, tocarSomSpy } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [] });
    assert.equal(tocarSomSpy.calls.length, 0);
  });
});

describe('FluxoDeFila — resolução por botão', () => {

  test('clicar no 1º botão resolve com seu valor', async () => {
    const { sandbox, doc } = criarSandbox();
    const p = sandbox.FluxoDeFila.abrir({
      titulo: 'T',
      corpo:  'C',
      acoes: [
        { label: 'Sim', valor: 'sim', variante: 'primario' },
        { label: 'Não', valor: 'nao', variante: 'secundario' },
      ],
    });

    const overlay = doc.body._appended[0];
    const botoes  = encontrarBotoes(overlay);
    assert.ok(botoes.length >= 1, 'deve haver pelo menos 1 botão');
    botoes[0]._fire('click', {});

    const resultado = await p;
    assert.equal(resultado, 'sim');
  });

  test('clicar no 2º botão resolve com seu valor', async () => {
    const { sandbox, doc } = criarSandbox();
    const p = sandbox.FluxoDeFila.abrir({
      titulo: 'T',
      corpo:  'C',
      acoes: [
        { label: 'Sim', valor: 'sim' },
        { label: 'Não', valor: 'nao' },
      ],
    });

    const overlay = doc.body._appended[0];
    const botoes  = encontrarBotoes(overlay);
    botoes[1]._fire('click', {});

    assert.equal(await p, 'nao');
  });
});

describe('FluxoDeFila — botão fechar', () => {

  test('fecharBtn=true adiciona botão com classe fdf-fechar', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [], fecharBtn: true });

    const overlay   = doc.body._appended[0];
    const btnFechar = todosDescendentes(overlay).find(
      e => (e.className ?? '').split(' ').includes('fdf-fechar'),
    );
    assert.ok(btnFechar, 'deve existir botão fdf-fechar');
  });

  test('fecharBtn=true: clicar no ✕ resolve null', async () => {
    const { sandbox, doc } = criarSandbox();
    const p = sandbox.FluxoDeFila.abrir({
      titulo: 'T', corpo: 'C', acoes: [], fecharBtn: true,
    });

    const overlay   = doc.body._appended[0];
    const btnFechar = todosDescendentes(overlay).find(
      e => (e.className ?? '').split(' ').includes('fdf-fechar'),
    );
    btnFechar._fire('click', {});

    assert.equal(await p, null);
  });

  test('fecharBtn=false: não há botão fdf-fechar', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ titulo: 'T', corpo: 'C', acoes: [], fecharBtn: false });

    const overlay   = doc.body._appended[0];
    const btnFechar = todosDescendentes(overlay).find(
      e => (e.className ?? '').split(' ').includes('fdf-fechar'),
    );
    assert.equal(btnFechar, undefined, 'não deve ter botão fdf-fechar');
  });
});

describe('FluxoDeFila — overlay duplicado', () => {

  test('segunda abertura com mesmo id remove o overlay anterior', () => {
    const { sandbox, doc } = criarSandbox();

    let removido = false;
    sandbox.FluxoDeFila.abrir({ id: 'dup', titulo: 'T', corpo: 'C', acoes: [] });
    // Substitui .remove() do 1º overlay para rastrear
    doc.body._appended[0].remove = () => { removido = true; };

    sandbox.FluxoDeFila.abrir({ id: 'dup', titulo: 'T2', corpo: 'C2', acoes: [] });
    assert.ok(removido, 'overlay anterior deve ter sido removido');
  });

  test('segunda abertura com mesmo id resolve a promise anterior com null', async () => {
    const { sandbox } = criarSandbox();

    const p1 = sandbox.FluxoDeFila.abrir({ id: 'dup2', titulo: 'T', corpo: 'C', acoes: [] });
    sandbox.FluxoDeFila.abrir({ id: 'dup2', titulo: 'T2', corpo: 'C2', acoes: [] });

    assert.equal(await p1, null, 'promise anterior deve resolver null');
  });
});

describe('FluxoDeFila — icone imagem', () => {

  test('iconeImagem=true cria elemento img dentro do ícone', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({
      titulo: 'T', corpo: 'C', acoes: [],
      icone:       'https://cdn.example.com/logo.png',
      iconeImagem: true,
    });

    const overlay = doc.body._appended[0];
    const img = todosDescendentes(overlay).find(e => e.tagName === 'IMG');
    assert.ok(img, 'deve haver um <img> no overlay');
  });
});

describe('FluxoDeFila — instância', () => {

  test('new FluxoDeFila(config).abrir() funciona igual ao static', async () => {
    const { sandbox, doc } = criarSandbox();
    const modal = new sandbox.FluxoDeFila({
      titulo: 'Instância',
      corpo:  'Corpo',
      acoes:  [{ label: 'OK', valor: 'ok' }],
    });

    const p = modal.abrir();
    assert.ok(doc.body._appended.length >= 1, 'overlay deve ter sido adicionado ao body');

    const overlay = doc.body._appended[doc.body._appended.length - 1];
    const botoes  = encontrarBotoes(overlay);
    botoes[0]._fire('click', {});

    assert.equal(await p, 'ok');
  });
});

// ─── Rede de segurança (safety-net) — fecha overlays órfãos na troca de tela ──

describe('FluxoDeFila — safety-net em barberflow:tela-entrando', () => {

  test('registra o listener global uma única vez (idempotência) mesmo abrindo 2 modais', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ id: 'a', titulo: 'A', corpo: 'C', acoes: [] });
    sandbox.FluxoDeFila.abrir({ id: 'b', titulo: 'B', corpo: 'C', acoes: [] });
    assert.equal(
      contarListenersDoc(doc, 'barberflow:tela-entrando'), 1,
      'o safety-net deve registrar exatamente 1 listener global',
    );
  });

  test('troca de tela força o fecho de overlay órfão: resolve null e remove o keydown', async () => {
    const { sandbox, doc } = criarSandbox();
    // Modal aberto e NUNCA fechado pelo usuário (Promise ficaria pendente).
    const p = sandbox.FluxoDeFila.abrir({ id: 'orfao', titulo: 'T', corpo: 'C', acoes: [], fecharBtn: true });
    assert.equal(contarListenersDoc(doc, 'keydown'), 1, 'modal aberto registra 1 keydown');

    // Simula navegação de tela (evento disparado pelo AnimationService).
    doc._fireDoc('barberflow:tela-entrando', {});

    assert.equal(await p, null, 'overlay órfão deve resolver a Promise com null');
    assert.equal(
      contarListenersDoc(doc, 'keydown'), 0,
      'o keydown do overlay órfão deve ser removido do document',
    );
  });

  test('não refecha overlay que já está saindo (evita trabalho redundante)', () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.FluxoDeFila.abrir({ id: 'saindo', titulo: 'T', corpo: 'C', acoes: [], fecharBtn: true });
    const overlay = doc.body._appended[0];
    overlay.classList.add('fdf-overlay--saindo');

    let resolveuDeNovo = false;
    overlay._fdfResolve = () => { resolveuDeNovo = true; };
    doc._fireDoc('barberflow:tela-entrando', {});

    assert.equal(resolveuDeNovo, false, 'overlay já em saída não deve ser fechado de novo');
  });
});

// ─── Integração com QueueModalPayloadBuilder: dedup por id evita acúmulo ──────

describe('FluxoDeFila — dedup dos payloads de fila (sem acúmulo de listener)', () => {

  test('montarPayloadPresencaFisica agora traz id estável', () => {
    const { sandbox } = criarSandbox();
    const config = sandbox.QueueModalPayloadBuilder.montarPayloadPresencaFisica({
      nomeBarbearia: 'Studio X', clienteNome: 'João',
    });
    assert.equal(config.id, 'modal-presenca-fisica');
  });

  test('reabrir o modal de presença sem fechar o anterior NÃO acumula overlay/keydown', () => {
    const { sandbox, doc } = criarSandbox();
    const config = sandbox.QueueModalPayloadBuilder.montarPayloadPresencaFisica({
      nomeBarbearia: 'Studio X', clienteNome: 'João',
    });

    // 1ª abertura — cliente entra na fila e NÃO responde (Promise pendente).
    sandbox.FluxoDeFila.abrir(config);
    const overlay1 = doc.body._appended[0];
    // Faz o remove() do mock realmente tirar o overlay da lista (como no browser).
    overlay1.remove = () => {
      const i = doc.body._appended.indexOf(overlay1);
      if (i >= 0) doc.body._appended.splice(i, 1);
    };
    assert.equal(contarListenersDoc(doc, 'keydown'), 1, '1ª abertura: 1 keydown');

    // 2ª abertura (mesmo id) — o dedup deve remover o overlay órfão anterior.
    sandbox.FluxoDeFila.abrir(config);

    assert.equal(doc.body._appended.length, 1, 'deve haver apenas 1 overlay no body');
    assert.equal(
      contarListenersDoc(doc, 'keydown'), 1,
      'keydown não deve acumular — o do overlay anterior foi removido pelo dedup',
    );
  });

  test('montarPayloadProximoNaFila e montarPayloadToast também trazem id', () => {
    const { sandbox } = criarSandbox();
    assert.equal(sandbox.QueueModalPayloadBuilder.montarPayloadProximoNaFila().id, 'modal-proximo-fila');
    assert.equal(sandbox.QueueModalPayloadBuilder.montarPayloadToast(1).id, 'modal-toast-fila');
  });
});
