'use strict';

const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const SHOP_ID = 'cccccccc-0000-4000-8000-000000000003';
const CLIENT_ID = 'dddddddd-0000-4000-8000-000000000004';

function matchesSel(el, sel) {
  if (sel.startsWith('.')) return (el.className ?? '').split(' ').includes(sel.slice(1));
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return false;
}

function parseHtml(html, criarEl) {
  const flat = [];
  const re = /<([a-z][a-z0-9]*)\b([^>]*?)(?:\/)?>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, tag, attrs] = m;
    const child = criarEl(tag);
    const cm = attrs.match(/\bclass="([^"]*)"/i);
    if (cm) child.className = cm[1];
    const im = attrs.match(/\bid="([^"]*)"/i);
    if (im) child.id = im[1];
    const close = new RegExp(`</${tag}>`, 'i');
    const rest = html.slice(re.lastIndex);
    const end = close.exec(rest);
    if (end) {
      const text = rest.slice(0, end.index).replace(/<[^>]*>/g, '').trim();
      if (text) child.textContent = text;
    }
    flat.push(child);
  }
  return flat;
}

function todosDescendentes(el) {
  const diretos = [...(el?._innerElements ?? []), ...(el?._children ?? [])];
  return [...diretos, ...diretos.flatMap(todosDescendentes)];
}

function criarElMock(docRef) {
  const _children = [];
  const _innerElements = [];
  const _listeners = {};
  const _attrs = {};
  let _innerHTML = '';
  let _textContent = '';

  const el = {
    id: '',
    className: '',
    value: '',
    disabled: false,
    dataset: {},
    _children,
    _innerElements,
    _listeners,
    get innerHTML() { return _innerHTML; },
    set innerHTML(html) {
      _innerHTML = String(html ?? '');
      _children.length = 0;
      _innerElements.length = 0;
      if (_innerHTML) parseHtml(_innerHTML, docRef.createElement).forEach(c => _innerElements.push(c));
    },
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = String(v ?? ''); },
    classList: { add() {}, remove() {} },
    setAttribute: (k, v) => { _attrs[k] = String(v); },
    getAttribute: k => _attrs[k] ?? null,
    appendChild: child => {
      _children.push(child);
      return child;
    },
    remove: () => {},
    addEventListener: (ev, h) => {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(h);
    },
    _fire: (ev, data = {}) => (_listeners[ev] ?? []).forEach(h => h(data)),
    querySelector: sel => {
      for (const c of [..._innerElements, ..._children]) {
        if (matchesSel(c, sel)) return c;
        const found = c.querySelector?.(sel);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: sel => todosDescendentes(el).filter(c => matchesSel(c, sel)),
  };
  return el;
}

function criarSandbox() {
  const appended = [];
  const doc = {
    body: { appendChild: el => appended.push(el), _appended: appended },
    createElement: tag => {
      const el = criarElMock(doc);
      el.tagName = String(tag).toUpperCase();
      return el;
    },
    addEventListener: fn(),
    removeEventListener: fn(),
  };
  const chamadasAdicionar = [];
  const sandbox = vm.createContext({
    console,
    document: doc,
    requestAnimationFrame: fn(cb => cb()),
    setTimeout: fn(cb => { cb(); return 1; }),
    BffApiService: {
      mensalistas: {
        listar: fn().mockResolvedValue({
          data: [{
            id: 'mensal-1',
            ends_at: '2026-06-21T00:00:00.000Z',
            monthly_fee: 149.9,
            client: { full_name: 'Cliente Ativo', avatar_path: null },
          }],
          error: null,
        }),
        favoritosElegiveis: fn().mockResolvedValue({
          data: [{ id: CLIENT_ID, full_name: 'Cliente Novo', avatar_path: null }],
          error: null,
        }),
        buscarClientesDisponiveis: fn().mockResolvedValue({ data: [], error: null }),
        adicionar: fn(async (...args) => {
          chamadasAdicionar.push(args);
          return { data: {}, error: null };
        }),
        remover: fn().mockResolvedValue({ data: null, error: null }),
      },
    },
  });
  carregar(sandbox, 'shared/js/MensalistaModal.js');
  return { sandbox, doc, chamadasAdicionar };
}

suite('MensalistaModal', () => {
  test('renderiza input de mensalidade e busca com inpustyle', async () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.MensalistaModal.abrir({ barbershopId: SHOP_ID });
    await new Promise(resolve => setImmediate(resolve));

    const overlay = doc.body._appended[0];
    assert.ok(overlay.querySelector('.mslm-mensalidade-input'));
    assert.ok((overlay.querySelector('.mslm-busca-input').className).includes('inpustyle'));
    assert.ok((overlay.querySelector('.mslm-btn-buscar').className).includes('inpustyle-btn'));
    assert.strictEqual(overlay.querySelector('.mslm-btn-buscar').textContent, '+');
  });

  test('adicionar mensalista envia valor da mensalidade', async () => {
    const { sandbox, doc, chamadasAdicionar } = criarSandbox();
    sandbox.MensalistaModal.abrir({ barbershopId: SHOP_ID });
    await new Promise(resolve => setImmediate(resolve));

    const overlay = doc.body._appended[0];
    overlay.querySelector('.mslm-mensalidade-input').value = '149.90';
    const btn = todosDescendentes(overlay).find(el => (el.className ?? '').split(' ').includes('mslm-btn-adicionar'));
    assert.ok(btn, 'botao adicionar deve existir');
    btn._fire('click');
    await new Promise(resolve => setImmediate(resolve));

    assert.deepStrictEqual(chamadasAdicionar[0], [SHOP_ID, CLIENT_ID, 149.9]);
  });

  test('mensalista ativo exibe valor armazenado', async () => {
    const { sandbox, doc } = criarSandbox();
    sandbox.MensalistaModal.abrir({ barbershopId: SHOP_ID });
    await new Promise(resolve => setImmediate(resolve));

    const overlay = doc.body._appended[0];
    const mensalidadeEl = todosDescendentes(overlay).find(el => (el.className ?? '').split(' ').includes('mslm-item-mensalidade'));
    assert.ok(mensalidadeEl, 'elemento mslm-item-mensalidade deve existir dentro do container mslm-item-meta');
    assert.match(mensalidadeEl.textContent, /Mensalidade:/);
  });
});
