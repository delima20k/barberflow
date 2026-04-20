'use strict';
/**
 * _helpers.js — infraestrutura compartilhada dos testes
 *
 * Fornece:
 *   fn()       — substituto nativo de jest.fn()
 *   carregar() — carrega JS em sandbox VM e exporta símbolos top-level
 */

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ─── Mock de função (substituto de jest.fn()) ────────────────────────────────

/**
 * Cria uma função espiã que rastreia todas as chamadas.
 *
 *   .calls            → Array<args[]> de cada invocação
 *   .mockReturnValue(v) → fixa retorno síncrono
 *   .mockResolvedValue(v) → fixa retorno como Promise.resolve(v)
 *   .mockRejectedValue(e) → fixa retorno como Promise.reject(e)
 *   .mockReturnThis()   → fixa retorno como `this`
 *   .mockClear()        → zera .calls sem trocar a implementação
 *   .mockImplementation(f) → substitui a implementação
 */
function fn(impl) {
  let _impl = impl ?? (() => undefined);
  const spy = function (...args) {
    spy.calls.push(args);
    return _impl.apply(this, args);
  };
  spy.calls               = [];
  spy.mockReturnValue     = (v)  => { _impl = () => v;                      return spy; };
  spy.mockResolvedValue   = (v)  => { _impl = () => Promise.resolve(v);     return spy; };
  spy.mockRejectedValue   = (e)  => { _impl = () => Promise.reject(e);      return spy; };
  spy.mockReturnThis      = ()   => { _impl = function() { return this; };   return spy; };
  spy.mockImplementation  = (f)  => { _impl = f;                             return spy; };
  spy.mockClear           = ()   => { spy.calls = [];                        return spy; };
  return spy;
}

// ─── Carregador de módulos em VM ─────────────────────────────────────────────

/**
 * Carrega um arquivo JS no sandbox VM e exporta todos os símbolos top-level
 * (class X / const X =) para o globalThis do sandbox.
 * Necessário porque 'use strict' impede que declarações virem props do global.
 */
function carregar(sandbox, relPath) {
  const raw   = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const nomes = [...raw.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${raw}\n${exp}`, sandbox);
}

module.exports = { fn, carregar, ROOT };
