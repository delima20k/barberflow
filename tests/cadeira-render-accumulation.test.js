'use strict';
/**
 * tests/cadeira-render-accumulation.test.js
 *
 * DIAGNÓSTICO (não altera código de app): mede acúmulo de recursos ao longo de
 * ciclos de vida das telas que renderizam cadeirinhas, para responder:
 *   vazamento (contadores crescem sem parar) vs tempestade de re-render (platô
 *   de recursos, mas rebuild caro por evento).
 *
 * Instrumenta em sandbox VM (sem navegador/rede/auth):
 *   - MutationObserver           (instâncias criadas × disconnect())
 *   - document.addEventListener  (× removeEventListener)
 *   - SupabaseService.channel    (× removeChannel)
 *   - setInterval                (× clearInterval)
 *   - innerHTML = ...            (rebuilds de DOM por evento de fila)
 *
 * Dois modos:
 *   MODO A — lifecycle: perfil null (pipeline sai cedo). Mede nav-toggle e re-bind.
 *   MODO B — ativo: perfil+shop mockados → alcança #iniciarRealtimeFila; dispara
 *            o callback de queue_entries N vezes (fila crescente) e conta rebuilds.
 *
 * Compara DEPLOYADO (6c8f2fe7) vs WORKING TREE, para Minha Barbearia e pública.
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const fs              = require('node:fs');
const path            = require('node:path');
const { execSync }    = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DEPLOY_REF = '6c8f2fe7';

function lerWT(rel)     { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function lerDeploy(rel) {
  try { return execSync(`git show ${DEPLOY_REF}:${rel}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); }
  catch { return null; }
}

function compat(raw) {
  return raw
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s+class\s+/gm, 'class ')
    .replace(/^export\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\s*$/gm, '');
}
function rodar(sandbox, raw) {
  const src   = compat(raw);
  const nomes = [...src.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${src}\n${exp}`, sandbox);
}

// ─── Harness ─────────────────────────────────────────────────────────────────

function medir({ rawArquivos, montar, perfil = null, shop = null }) {
  const c = {
    observersCriados: 0, observersDisconnect: 0,
    docAdd: 0, docRemove: 0,
    channel: 0, removeChannel: 0,
    setInterval: 0, clearInterval: 0,
    innerHTML: 0,
  };
  const observers = [];
  const realtime  = { cb: null };      // callback de postgres_changes de queue_entries
  const elCache   = new Map();

  function criarElStub() {
    const _cls = new Set();
    let _html = '';
    const el = {
      style: { setProperty: () => {} }, dataset: {}, textContent: '', value: '',
      disabled: false, hidden: false,
      get innerHTML() { return _html; },
      set innerHTML(v) { c.innerHTML++; _html = v; },
      classList: {
        add: (...x) => x.forEach(v => _cls.add(v)),
        remove: (...x) => x.forEach(v => _cls.delete(v)),
        toggle: (v, f) => { const on = f ?? !_cls.has(v); on ? _cls.add(v) : _cls.delete(v); return on; },
        contains: v => _cls.has(v),
      },
      getAttribute: () => null, setAttribute: () => {}, removeAttribute: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      appendChild: () => {}, append: () => {}, prepend: () => {}, removeChild: () => {},
      remove: () => {}, insertBefore: () => {}, replaceChildren: () => {},
      querySelector: () => criarElStub(), querySelectorAll: () => [],
      closest: () => null, contains: () => false, focus: () => {}, click: () => {},
      getAnimations: () => [], cloneNode: () => criarElStub(),
      _cls,
    };
    return el;
  }

  const document = {
    getElementById: (id) => { if (!elCache.has(id)) elCache.set(id, criarElStub()); return elCache.get(id); },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => criarElStub(),
    addEventListener: () => { c.docAdd++; }, removeEventListener: () => { c.docRemove++; },
    dispatchEvent: () => true, body: criarElStub(), activeElement: null,
  };

  const canalStub = () => {
    const ch = {
      on: (evt, cfgOrCb, maybeCb) => {
        const cb = typeof cfgOrCb === 'function' ? cfgOrCb : maybeCb;
        const cfg = typeof cfgOrCb === 'object' ? cfgOrCb : null;
        if (cfg && cfg.table === 'queue_entries' && typeof cb === 'function') realtime.cb = cb;
        return ch;
      },
      subscribe: (cb) => { if (typeof cb === 'function') cb('SUBSCRIBED'); return ch; },
      send: () => {}, unsubscribe: () => {},
    };
    return ch;
  };

  // fila crescente controlada externamente (simula adicionar usuários)
  const filaState = { entradas: [] };
  const chainQuery = (data) => {
    const q = new Proxy({}, { get: (_t, prop) => {
      if (prop === 'then') return (res) => Promise.resolve({ data, error: null }).then(res);
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve({ data, error: data ? null : { code: 'PGRST116' } });
      return () => q;
    }});
    return q;
  };

  const erros = [];
  const sandbox = vm.createContext({
    console: { log: () => {}, warn: () => {}, error: (...a) => { erros.push(a.map(x => x?.stack || String(x)).join(' ')); }, info: () => {} },
    document, window: {},
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    localStorage:   { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail ?? {}; } },
    Event: class { constructor(t) { this.type = t; } },
    CSS: { escape: (s) => String(s) },
    MutationObserver: function (cb) {
      c.observersCriados++; this._cb = cb; this._ativo = true;
      this.observe = () => {}; this.takeRecords = () => [];
      this.disconnect = () => { if (this._ativo) { this._ativo = false; c.observersDisconnect++; } };
      observers.push(this);
    },
    setTimeout: (f) => { if (typeof f === 'function') { try { f(); } catch (_) {} } return 0; },
    clearTimeout: () => {},
    setInterval: () => { c.setInterval++; return c.setInterval; },
    clearInterval: () => { c.clearInterval++; },
    requestAnimationFrame: (f) => { if (typeof f === 'function') f(0); return 0; },
    cancelAnimationFrame: () => {},
    Date, Promise, Math, JSON, Proxy, Array, Object, String, Number, Boolean, Set, Map, Symbol,
    AuthService: { getPerfil: () => perfil, iniciarListener: () => {}, inicializarSessao: () => {} },
    SupabaseService: {
      channel: () => { c.channel++; return canalStub(); },
      removeChannel: () => { c.removeChannel++; },
      client: { from: () => chainQuery([]) },
      services: () => chainQuery([]),
      barbershops: () => chainQuery(shop),
      getLogoUrl: () => null, resolveAvatarUrl: () => '',
    },
    ApiService: { getLogoUrl: () => null, resolveAvatarUrl: () => '', from: () => chainQuery([]) },
    BffApiService: { barbearias: {
      gestaoVinculada: () => Promise.resolve({ data: null, error: null }),
      listarStories:   () => Promise.resolve({ data: [], error: null }),
      statusBarbeiros: () => Promise.resolve({ data: [], error: null }),
      minha:           () => Promise.resolve({ data: shop, error: null }),
    } },
    CadeiraService: {
      sincronizarFilas: () => Promise.resolve(filaState.entradas),
      getFilaAtiva:     () => Promise.resolve(filaState.entradas),
    },
    QueueRepository: { getByBarbershop: () => Promise.resolve(filaState.entradas) },
    LoggerService: { info: () => {}, warn: () => {}, error: () => {} },
    BarbeiroEsperaFluxo: { restaurar: () => {}, estaAguardando: () => false, resetarTimer: () => {}, iniciarEspera: () => {}, finalizarEspera: () => {} },
    BarbeiroAtividadeStatus: { listar: () => Promise.resolve([]), criarParagrafo: () => criarElStub(), atualizarParagrafo: () => {}, assinar: () => { c.channel++; return canalStub(); }, mapa: () => new Map() },
    MediaP2P: class { cancelarTodos() {} cancelar() {} registrar() { return Promise.resolve('blob:x'); } temPendente() { return false; } fazerUpload() { return Promise.resolve('p'); } },
    CacheManager: { get: () => null, set: () => {} },
    ClienteController: { podeInteragir: () => false },
    BarbershopAvailabilityService: { canClientClickChair: () => false },
    Pro: { nav: () => {} }, App: { nav: () => {} },
    // Section classes referenciadas sem guard em #atualizarSecoesExtraidas
    SettingsSection: class {}, QueueSection: class {}, PortfolioSection: class {},
    StatusFechamentoModal: { labelStatus: () => 'Aberta', classeStatus: () => 'status--aberta' },
    AnimationService: { gaspar: () => {} },
    StoryViewer: class {}, PortfolioPrismViewer: class {},
  });
  sandbox.globalThis = sandbox;

  for (const raw of rawArquivos) rodar(sandbox, raw);

  const dispararObservers = () => {
    for (const o of observers) if (o._ativo && typeof o._cb === 'function') { try { o._cb([{ attributeName: 'class' }], o); } catch (_) {} }
  };

  const snapshot = () => ({
    observersVivos: c.observersCriados - c.observersDisconnect,
    docListeners:   c.docAdd - c.docRemove,
    canaisVivos:    c.channel - c.removeChannel,
    timersVivos:    c.setInterval - c.clearInterval,
    innerHTML:      c.innerHTML,
  });

  const alvo = montar(sandbox, { dispararObservers, realtime, filaState, snapshot });
  return { sandbox, c, snapshot, alvo, dispararObservers, realtime, filaState, erros };
}

function imprimir(titulo, serie, colunas) {
  console.log(`\n=== ${titulo} ===`);
  console.log('iter'.padEnd(16), ...colunas.map(k => k.padStart(13)));
  for (const r of serie) console.log(String(r.iter).padEnd(16), ...colunas.map(k => String(r[k]).padStart(13)));
}

// ─── Fontes ──────────────────────────────────────────────────────────────────

const MB_REL   = 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js';
const MBP_REL  = 'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js';
const ADA_REL  = 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryBrowserMediaAdapter.js';

const SRC_MB_WT  = [lerWT(ADA_REL), lerWT(MB_REL), lerWT(MBP_REL)];
const dep = [lerDeploy(ADA_REL), lerDeploy(MB_REL), lerDeploy(MBP_REL)];
const SRC_MB_DEPLOY = dep.every(Boolean) ? dep : null;

const SHOP = { id: 'shop1', owner_id: 'p1', name: 'Teste', is_open: true, close_reason: null, cover_path: null, logo_path: null };
const PERFIL = { id: 'p1', full_name: 'Dono', avatar_path: null };

function montarMB(sandbox, ctx) {
  const page = new sandbox.MinhaBarbeariaPage();
  page.bind();
  const telaEl = sandbox.document.getElementById('tela-minha-barbearia');
  telaEl.classList.add('ativa');
  ctx.dispararObservers();  // ativa a tela → dispara #carregar (perfil null bail / perfil+shop segue)
  return {
    page, telaEl,
    bind: () => page.bind(),
    toggle: () => { telaEl.classList.remove('ativa'); ctx.dispararObservers(); telaEl.classList.add('ativa'); ctx.dispararObservers(); },
  };
}

// =============================================================================
// MODO A — lifecycle (perfil null): nav-toggle + re-bind
// =============================================================================
describe('Cadeirinhas — MODO A lifecycle (nav-toggle + re-bind)', () => {

  function correrLifecycle(rawArquivos, titulo) {
    const h = medir({ rawArquivos, montar: montarMB, perfil: null, shop: null });
    const serie = [{ iter: 'bind inicial', ...h.snapshot() }];
    for (let i = 1; i <= 10; i++) { h.alvo.toggle(); serie.push({ iter: `nav ${i}`, ...h.snapshot() }); }
    for (let i = 1; i <= 3; i++)  { h.alvo.bind();   serie.push({ iter: `rebind ${i}`, ...h.snapshot() }); }
    imprimir(titulo, serie, ['observersVivos', 'docListeners', 'canaisVivos', 'timersVivos']);
    return serie;
  }

  test('WORKING TREE', () => {
    const s = correrLifecycle(SRC_MB_WT, 'Minha Barbearia — WORKING TREE (lifecycle)');
    assert.ok(s.length);
  });

  test('DEPLOYADO 6c8f2fe7', (t) => {
    if (!SRC_MB_DEPLOY) { t.skip('6c8f2fe7 indisponível'); return; }
    const s = correrLifecycle(SRC_MB_DEPLOY, 'Minha Barbearia — DEPLOYADO 6c8f2fe7 (lifecycle)');
    assert.ok(s.length);
  });
});

// =============================================================================
// MODO B — ativo (perfil+shop): dispara evento de fila N× e conta rebuilds
// =============================================================================
describe('Cadeirinhas — MODO B ativo (evento de fila → re-render)', () => {

  async function correrAtivo(rawArquivos, titulo) {
    const h = medir({ rawArquivos, montar: montarMB, perfil: PERFIL, shop: SHOP });
    // deixa o #carregar assíncrono terminar (microtasks)
    for (let k = 0; k < 20; k++) await Promise.resolve();

    const serie = [{ iter: 'após carregar', ...h.snapshot(), realtimeCapturado: !!h.realtime.cb }];

    if (!h.realtime.cb) {
      imprimir(titulo + ' [pipeline não alcançou #iniciarRealtimeFila]', serie,
        ['observersVivos', 'docListeners', 'canaisVivos', 'timersVivos', 'innerHTML']);
      if (h.erros.length) console.log('   1º erro capturado no #carregar:\n   ' + h.erros[0].split('\n').slice(0, 4).join('\n   '));
      return { serie, alcancou: false };
    }

    // Simula 10 operações "adicionar usuário": fila cresce e dispara evento realtime
    for (let i = 1; i <= 10; i++) {
      h.filaState.entradas = Array.from({ length: i }, (_, k) => ({
        id: `e${k}`, status: k === 0 ? 'in_service' : 'waiting', position: k,
        professional: { id: 'p1' }, client: { full_name: `C${k}` },
      }));
      h.realtime.cb({ eventType: 'INSERT', new: { barbershop_id: 'shop1' } });
      for (let m = 0; m < 15; m++) await Promise.resolve();  // deixa #reRenderEquipe async terminar
      serie.push({ iter: `add #${i}`, ...h.snapshot() });
    }
    imprimir(titulo, serie, ['observersVivos', 'docListeners', 'canaisVivos', 'timersVivos', 'innerHTML']);
    return { serie, alcancou: true };
  }

  test('WORKING TREE', async () => {
    const r = await correrAtivo(SRC_MB_WT, 'Minha Barbearia — WORKING TREE (ativo)');
    assert.ok(r.serie.length);
  });

  test('DEPLOYADO 6c8f2fe7', async (t) => {
    if (!SRC_MB_DEPLOY) { t.skip('6c8f2fe7 indisponível'); return; }
    const r = await correrAtivo(SRC_MB_DEPLOY, 'Minha Barbearia — DEPLOYADO 6c8f2fe7 (ativo)');
    assert.ok(r.serie.length);
  });
});
