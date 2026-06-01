'use strict';
/**
 * tests/corte-modal.test.js
 *
 * Testa CorteModal via mini-DOM (sem jsdom):
 *   - Modo mensalista: exibe Plano Mensal como checklist + serviços
 *   - Confirmar com só Plano Mensal → retorna [] (MENSALISTA_ID filtrado)
 *   - Confirmar com Plano Mensal + serviço → retorna [svc.id]
 *   - Confirmar com serviço → retorna [svc.id]
 *   - MENSALISTA_ID nunca aparece no array de retorno
 *   - Total do Plano Mensal sempre 0 (não entra no cálculo)
 *   - Cancelar (botão / Escape / fora do card) → retorna null
 *   - Modo normal (não-mensalista): mesmos controles de cancel + confirm
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─── Mini DOM ────────────────────────────────────────────────────────────────

function criarDOM() {
  /**
   * className getter/setter sincroniza com classList._list.
   * Necessário porque CorteModal faz `el.className = '...'` diretamente.
   */
  function criarEl(tag, initClass = '') {
    const classList = {
      _list: new Set(initClass.split(' ').filter(Boolean)),
      add(...cs)    { cs.forEach(c => this._list.add(c)); },
      remove(...cs) { cs.forEach(c => this._list.delete(c)); },
      contains(c)   { return this._list.has(c); },
      toggle(c, f)  {
        if (f !== undefined) { f ? this._list.add(c) : this._list.delete(c); }
        else { this._list.has(c) ? this._list.delete(c) : this._list.add(c); }
      },
    };

    const el = {
      tagName:     tag.toUpperCase(),
      id:          '',
      disabled:    false,
      checked:     false,
      value:       '',
      textContent: '',
      style:       {},
      dataset:     {},
      children:    [],
      _listeners:  {},
      type:        '',
      classList,

      addEventListener(ev, cb)    { (this._listeners[ev] ??= []).push(cb); },
      removeEventListener(ev, cb) {
        if (this._listeners[ev])
          this._listeners[ev] = this._listeners[ev].filter(f => f !== cb);
      },
      dispatchEvent(e) { (this._listeners[e.type] ?? []).forEach(cb => cb(e)); },

      appendChild(child) { this.children.push(child); return child; },
      remove()           { /* NOOP em testes */ },
      focus()            {},

      /** querySelector com suporte a #id, .classe e tagName. */
      querySelector(sel) {
        const find = (node, test) => {
          for (const c of node.children) {
            if (test(c)) return c;
            const r = find(c, test);
            if (r) return r;
          }
          return null;
        };
        if (sel.startsWith('#'))  return find(this, n => n.id === sel.slice(1));
        if (sel.startsWith('.'))  return find(this, n => n.classList._list.has(sel.slice(1)));
        return find(this, n => n.tagName === sel.toUpperCase());
      },

      /**
       * querySelectorAll com suporte a `.classe` e `.classe:checked`.
       * Pesquisa recursiva em todos os descendentes (inclusive filhos appended).
       */
      querySelectorAll(sel) {
        const results  = [];
        const chkMatch = sel.match(/^\.([^:]+):checked$/);
        const clsMatch = sel.match(/^\.([^:]+)$/);
        const find = (node) => {
          for (const c of node.children) {
            if      (chkMatch && c.classList._list.has(chkMatch[1]) && c.checked) results.push(c);
            else if (clsMatch && c.classList._list.has(clsMatch[1]))              results.push(c);
            find(c);
          }
        };
        find(this);
        return results;
      },

      /**
       * Setter de innerHTML: parseia as tags do HTML e cria elementos filhos
       * para que querySelector/querySelectorAll funcionem corretamente nos testes.
       */
      set innerHTML(html) {
        this._html     = html;
        this.children  = [];
        const tagRe    = /<(\w+)([^>]*)>/g;
        let m;
        while ((m = tagRe.exec(html)) !== null) {
          const child  = criarEl(m[1]);
          const attrs  = m[2];
          const classM = attrs.match(/class="([^"]*)"/);
          const idM    = attrs.match(/id="([^"]*)"/);
          if (classM) child.className = classM[1];
          if (idM)    child.id        = idM[1];
          if (/\bdisabled\b/.test(attrs)) child.disabled = true;
          this.children.push(child);
        }
      },
      get innerHTML() { return this._html ?? ''; },
    };

    // Object.defineProperty para que `el.className = '...'` atualize classList._list
    Object.defineProperty(el, 'className', {
      get()  { return [...classList._list].join(' '); },
      set(v) { classList._list = new Set(v.split(' ').filter(Boolean)); },
      enumerable:   true,
      configurable: true,
    });
    if (initClass) el.className = initClass;

    return el;
  }

  const body        = criarEl('body');
  const docListeners = {};

  const document = {
    createElement: (tag) => criarEl(tag),
    body,
    addEventListener(ev, cb)    { (docListeners[ev] ??= []).push(cb); },
    removeEventListener(ev, cb) {
      if (docListeners[ev])
        docListeners[ev] = docListeners[ev].filter(f => f !== cb);
    },
    /** Dispara um evento de teclado para simular Escape etc. */
    _fireKey(key) { (docListeners['keydown'] ?? []).forEach(cb => cb({ key })); },
  };

  return { document, body };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

function carregarCorteModal() {
  const { document, body } = criarDOM();
  const sb = vm.createContext({
    console,
    document,
    requestAnimationFrame: (cb) => cb(),
    setTimeout:            (cb) => cb(),
  });
  carregar(sb, 'shared/js/CorteModal.js');
  // SERVICOS criado dentro do contexto VM para que Array.isArray() funcione
  const servicos = vm.runInContext(`[
    { id: 'svc-1', name: 'Corte Simples', price: 30, duration_min: 30 },
    { id: 'svc-2', name: 'Corte + Barba', price: 50, duration_min: 50 },
  ]`, sb);
  return { CorteModal: sb.CorteModal, document, body, servicos };
}

// ─── Helpers de teste ────────────────────────────────────────────────────────

function ultimoOverlay(body) { return body.children[body.children.length - 1]; }

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('CorteModal', () => {

  test('MENSALISTA_ID é "__mensalista__"', () => {
    const { CorteModal } = carregarCorteModal();
    assert.equal(CorteModal.MENSALISTA_ID, '__mensalista__');
  });

  // ── Modo mensalista ──────────────────────────────────────────────────────

  describe('abrir() — modo mensalista', () => {

    test('retorna Promise', () => {
      const { CorteModal, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'João', clienteMensalista: true });
      assert.equal(typeof p?.then, 'function', 'abrir() deve retornar um Promise');
    });

    test('Escape → resolve null', async () => {
      const { CorteModal, document, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Ana', clienteMensalista: true });
      document._fireKey('Escape');
      assert.equal(await p, null);
    });

    test('botão Cancelar → resolve null', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Pedro', clienteMensalista: true });
      ultimoOverlay(body).querySelector('.crtm-btn--cancelar').dispatchEvent({ type: 'click' });
      assert.equal(await p, null);
    });

    test('fechar (✕) → resolve null', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Bia', clienteMensalista: true });
      ultimoOverlay(body).querySelector('.crtm-fechar').dispatchEvent({ type: 'click' });
      assert.equal(await p, null);
    });

    test('clicar fora do card → resolve null', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Maria', clienteMensalista: true });
      const overlay = ultimoOverlay(body);
      overlay.dispatchEvent({ type: 'click', target: overlay });
      assert.equal(await p, null);
    });

    test('confirmar com só Plano Mensal selecionado → resolve []', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Carlos', clienteMensalista: true });
      const overlay = ultimoOverlay(body);
      const lista   = overlay.querySelector('.crtm-lista');

      // Plano Mensal é o primeiro item da lista (children[0])
      const mensalChk = lista.children[0].querySelector('.crtm-checkbox');
      mensalChk.checked = true;
      lista.dispatchEvent({ type: 'change' });

      overlay.querySelector('.crtm-btn--confirmar').dispatchEvent({ type: 'click' });
      assert.deepEqual([...(await p)], [], 'MENSALISTA_ID deve ser filtrado do retorno');
    });

    test('MENSALISTA_ID nunca aparece no array de retorno', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Luís', clienteMensalista: true });
      const overlay = ultimoOverlay(body);
      const lista   = overlay.querySelector('.crtm-lista');

      // Marca Plano Mensal (idx 0) e svc-2 (idx 2)
      lista.children[0].querySelector('.crtm-checkbox').checked = true;
      lista.children[2].querySelector('.crtm-checkbox').checked = true;
      lista.dispatchEvent({ type: 'change' });

      overlay.querySelector('.crtm-btn--confirmar').dispatchEvent({ type: 'click' });
      const ids = await p;
      assert.ok(!ids.includes(CorteModal.MENSALISTA_ID), 'MENSALISTA_ID não deve aparecer no retorno');
      assert.ok(ids.includes('svc-2'), 'svc-2 deve estar no retorno');
    });

    test('confirmar com serviço selecionado → resolve [svc.id]', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Carla', clienteMensalista: true });
      const overlay = ultimoOverlay(body);
      const lista   = overlay.querySelector('.crtm-lista');

      // svc-1 está no índice 1 (após Plano Mensal)
      lista.children[1].querySelector('.crtm-checkbox').checked = true;
      lista.dispatchEvent({ type: 'change' });

      overlay.querySelector('.crtm-btn--confirmar').dispatchEvent({ type: 'click' });
      assert.deepEqual([...(await p)], ['svc-1']);
    });

    test('total permanece R$ 0,00 ao selecionar só Plano Mensal (preço = 0)', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({
        servicos,
        clienteNome:          'Lara',
        clienteMensalista:    true,
        mensalistaFee:        89.90,
        mensalistaCortesCount: 3,
      });
      const overlay = ultimoOverlay(body);
      const lista   = overlay.querySelector('.crtm-lista');

      lista.children[0].querySelector('.crtm-checkbox').checked = true;
      lista.dispatchEvent({ type: 'change' });

      const totalEl = overlay.querySelector('.crtm-total-val');
      assert.ok(
        totalEl.textContent.includes('0'),
        `Total esperado 0, recebido: "${totalEl.textContent}"`,
      );

      // Limpa Promise pendente
      overlay.querySelector('.crtm-btn--cancelar').dispatchEvent({ type: 'click' });
      await p;
    });

    test('botão confirmar começa desabilitado e habilita após selecionar item', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Duda', clienteMensalista: true });
      const overlay    = ultimoOverlay(body);
      const lista      = overlay.querySelector('.crtm-lista');
      const confirmar  = overlay.querySelector('.crtm-btn--confirmar');

      assert.ok(confirmar.disabled, 'botão deve começar desabilitado');

      lista.children[1].querySelector('.crtm-checkbox').checked = true;
      lista.dispatchEvent({ type: 'change' });
      assert.ok(!confirmar.disabled, 'botão deve habilitar após seleção');

      // Limpa
      confirmar.dispatchEvent({ type: 'click' });
      await p;
    });

  });

  // ── Modo normal ─────────────────────────────────────────────────────────

  describe('abrir() — modo normal (não-mensalista)', () => {

    test('cancelar → resolve null', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Rui' });
      ultimoOverlay(body).querySelector('.crtm-btn--cancelar').dispatchEvent({ type: 'click' });
      assert.equal(await p, null);
    });

    test('Escape → resolve null', async () => {
      const { CorteModal, document, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Fabi' });
      document._fireKey('Escape');
      assert.equal(await p, null);
    });

    test('confirmar com serviço selecionado → resolve [svc.id]', async () => {
      const { CorteModal, body, servicos } = carregarCorteModal();
      const p = CorteModal.abrir({ servicos, clienteNome: 'Rita' });
      const overlay = ultimoOverlay(body);
      const lista   = overlay.querySelector('.crtm-lista');

      lista.children[0].querySelector('.crtm-checkbox').checked = true;
      lista.dispatchEvent({ type: 'change' });
      overlay.querySelector('.crtm-btn--confirmar').dispatchEvent({ type: 'click' });

      assert.deepEqual([...(await p)], ['svc-1']);
    });

  });

});
