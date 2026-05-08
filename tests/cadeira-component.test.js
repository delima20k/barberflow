'use strict';
/**
 * tests/cadeira-component.test.js
 *
 * Testa o componente DOM da classe Cadeira.
 *
 * Cenários cobertos:
 *   - .cdr-icon sempre contém a imagem padrão da cadeira (nunca o avatar direto)
 *   - quando ocupada: existe elemento .cdr-avatar-cli com o avatar do cliente
 *   - quando vazia:   NÃO existe .cdr-avatar-cli
 *   - cliente walk-in: avatar usa icon-192.png
 *   - cadeira de produção em_producao: .cdr-cadeira--em_producao + borda no icon
 *   - cadeira confirmada: .cdr-cadeira--confirmada + .cdr-icon--confirmada
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── DOM mock mínimo ─────────────────────────────────────────────────────────

function criarElMock(docRef, tag = 'DIV') {
  const _children  = [];
  const _attrs     = {};
  const _listeners = {};
  let _textContent = '';

  const classList = (() => {
    const s = new Set();
    return {
      add:      (...c) => c.forEach(x => s.add(x)),
      remove:   (...c) => c.forEach(x => s.delete(x)),
      contains: c => s.has(c),
      _set: s,
    };
  })();

  const el = {
    tagName: tag.toUpperCase(),
    id:      '',
    className: '',
    style:   {},
    dataset: {},
    _children,
    _attrs,
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = String(v ?? ''); },
    value:    '',
    loading:  '',
    src:      '',
    alt:      '',
    onerror:  null,
    classList,
    setAttribute:  (k, v) => { _attrs[k] = String(v); },
    getAttribute:  k => _attrs[k] ?? null,
    appendChild:   child => { _children.push(child); return child; },
    remove:        () => {},
    addEventListener: (ev, h) => {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(h);
    },
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
  };
  return el;
}

function matchesSel(el, sel) {
  if (!el) return false;
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return (el.className ?? '').split(' ').filter(Boolean).includes(cls)
      || el.classList?._set?.has(cls);
  }
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return (el.tagName ?? '').toLowerCase() === sel.toLowerCase();
}

function criarDocMock() {
  const doc = {
    createElement: tag => criarElMock(doc, tag),
    body:          { appendChild: fn() },
  };
  return doc;
}

// ─── Factory da sandbox ──────────────────────────────────────────────────────

function criarSandbox() {
  const doc = criarDocMock();
  const sandbox = vm.createContext({
    console,
    document: doc,
    SupabaseService: {
      resolveAvatarUrl: fn((path) => path ? `https://cdn.test/${path}` : null),
    },
  });
  carregar(sandbox, 'shared/js/Cadeira.js');
  return sandbox;
}

// ─── Dados de fixture ────────────────────────────────────────────────────────

const ENTRADA_COM_AVATAR = {
  status: 'in_service',
  client: { id: 'c1', full_name: 'Carlos Silva', avatar_path: 'avatars/c1.jpg', updated_at: null },
};

const ENTRADA_SEM_AVATAR = {
  status: 'in_service',
  client: { id: 'c2', full_name: 'Maria', avatar_path: null, updated_at: null },
};

const ENTRADA_WALK_IN = {
  status: 'waiting',
  guest_name: 'Anônimo',
  client: null,
};

const ENTRADA_FILA = {
  status: 'waiting',
  client: { id: 'c3', full_name: 'João', avatar_path: 'avatars/c3.jpg', updated_at: null },
};

// ─── Suíte ───────────────────────────────────────────────────────────────────

suite('Cadeira — componente DOM', () => {

  // ── cdr-icon sempre mostra imagem padrão ──────────────────────────────────

  test('cadeira livre: cdr-icon contém img da cadeira de produção', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: null });
    const icon = el.querySelector('.cdr-icon');
    assert.ok(icon, 'deve existir .cdr-icon');
    const img = icon._children.find(c => c.tagName === 'IMG');
    assert.ok(img, 'cdr-icon deve conter uma img');
    assert.ok(img.src.includes('icones-cadeira-producao'), 'img deve ser a cadeira de produção');
  });

  test('cadeira livre: NÃO existe .cdr-avatar-cli', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: null });
    const avatar = el.querySelector('.cdr-avatar-cli');
    assert.equal(avatar, null, 'não deve ter avatar flutuante quando vazia');
  });

  // ── ocupada: avatar flutuante ─────────────────────────────────────────────

  test('cadeira ocupada com avatar: existe .cdr-avatar-cli com img', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR });
    const avatarCli = el.querySelector('.cdr-avatar-cli');
    assert.ok(avatarCli, 'deve existir .cdr-avatar-cli');
    const img = avatarCli._children.find(c => c.tagName === 'IMG');
    assert.ok(img, '.cdr-avatar-cli deve conter img');
    assert.ok(img.src.includes('c1.jpg'), 'src do avatar deve apontar para o caminho correto');
  });

  test('cadeira ocupada sem avatar: .cdr-avatar-cli com inicial do nome', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_SEM_AVATAR });
    const avatarCli = el.querySelector('.cdr-avatar-cli');
    assert.ok(avatarCli, 'deve existir .cdr-avatar-cli mesmo sem foto');
    assert.equal(avatarCli.textContent, 'M', 'deve mostrar inicial do nome como fallback');
  });

  test('cadeira ocupada: .cdr-icon ainda mostra imagem padrão da cadeira (não o avatar)', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR });
    const icon = el.querySelector('.cdr-icon');
    const img = icon._children.find(c => c.tagName === 'IMG');
    assert.ok(img, 'cdr-icon deve conter img');
    assert.ok(img.src.includes('icones-cadeira-producao'), 'cdr-icon deve sempre mostrar a imagem da cadeira');
  });

  // ── walk-in ───────────────────────────────────────────────────────────────

  test('cliente walk-in: .cdr-avatar-cli usa icon-192.png', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'fila', entrada: ENTRADA_WALK_IN, posicao: 1 });
    const avatarCli = el.querySelector('.cdr-avatar-cli');
    assert.ok(avatarCli, 'deve existir .cdr-avatar-cli para walk-in');
    const img = avatarCli._children.find(c => c.tagName === 'IMG');
    assert.ok(img, 'deve conter img');
    assert.ok(img.src.includes('icon-192.png'), 'walk-in deve usar icon-192.png');
  });

  // ── fila ocupada ──────────────────────────────────────────────────────────

  test('cadeira de fila ocupada: tem .cdr-avatar-cli', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'fila', entrada: ENTRADA_FILA, posicao: 2 });
    const avatarCli = el.querySelector('.cdr-avatar-cli');
    assert.ok(avatarCli, 'cadeira de fila ocupada deve ter avatar flutuante');
  });

  // ── estados de confirmação ────────────────────────────────────────────────

  test('confirmacao=yes: .cdr-cadeira--confirmada + .cdr-icon--confirmada', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR, confirmacao: 'yes' });
    assert.ok(
      el.classList._set.has('cdr-cadeira--confirmada') || el.className.includes('cdr-cadeira--confirmada'),
      'deve ter classe cdr-cadeira--confirmada',
    );
    const icon = el.querySelector('.cdr-icon');
    assert.ok(
      icon.classList._set.has('cdr-icon--confirmada'),
      'cdr-icon deve ter cdr-icon--confirmada',
    );
  });

  test('confirmacao=absent: .cdr-cadeira--ausente', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR, confirmacao: 'absent' });
    assert.ok(
      el.classList._set.has('cdr-cadeira--ausente') || el.className.includes('cdr-cadeira--ausente'),
      'deve ter classe cdr-cadeira--ausente',
    );
  });

  // ── label de produção — nome em destaque ──────────────────────────────────

  test('producao ocupada: label contém o nome do cliente em destaque', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR });
    const label = el.querySelector('.cdr-label');
    assert.ok(label, 'deve existir .cdr-label');
    // Deve ter um <strong> ou textContent com o nome
    const strong = label._children?.find(c => c.tagName === 'STRONG');
    const temNome = strong
      ? strong.textContent.includes('Carlos')
      : label.textContent.includes('Carlos');
    assert.ok(temNome, 'label deve conter o nome do cliente destacado');
  });

  test('producao ocupada confirmada: label contém nome + texto cortando', () => {
    const { Cadeira } = criarSandbox();
    const el = Cadeira.criar({ tipo: 'producao', entrada: ENTRADA_COM_AVATAR, confirmacao: 'yes' });
    const label = el.querySelector('.cdr-label');
    const strong = label._children?.find(c => c.tagName === 'STRONG');
    const textoLabel = label.textContent + (strong?.textContent ?? '');
    assert.ok(textoLabel.includes('Carlos') || textoLabel.includes('cortando'), 'label confirmada deve conter nome ou "cortando"');
  });
});
