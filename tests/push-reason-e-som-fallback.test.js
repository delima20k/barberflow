'use strict';

/**
 * tests/push-reason-e-som-fallback.test.js
 *
 * Duas correções do diagnóstico de push (2026-07-13):
 *
 * 1) BffApiService.post — as respostas de falha de negócio do push
 *    ({ ok:false, reason: SEND_FAILED / NO_SUBSCRIPTION / PUSH_UNAVAILABLE })
 *    vêm no TOP-LEVEL (sem chave `dados`) e eram descartadas (data=null),
 *    cegando os logs do cliente. Agora o corpo é repassado quando carrega
 *    `ok` e não há `dados` — os ramos data?.ok===false voltam a funcionar.
 *
 * 2) ProducaoSomAlerta (classe nova, app profissional) — fallback do som:
 *    toca PushSoundService.alertar() quando o Realtime (mb-fila) detecta
 *    entrada em produção (in_service), garantindo o mp3 com o app ABERTO
 *    mesmo se o Web Push falhar. Dedup por entrada + cooldown.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { fn, carregar, ROOT } = require('./_helpers.js');

const SRC_MB = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
  'utf8',
);
const SRC_HTML_PRO = fs.readFileSync(path.join(ROOT, 'apps/profissional/index.html'), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Sandbox: BffApiService com fetch mockado
// ─────────────────────────────────────────────────────────────────────────────

function criarSandboxBff(respostaJson, { httpOk = true, status = 200 } = {}) {
  const fetchSpy = fn().mockResolvedValue({
    ok: httpOk,
    status,
    json: async () => respostaJson,
  });
  const sandbox = vm.createContext({
    console, Object, String, Number, JSON, Promise, Error, Array, Math, Date,
    window: { location: { hostname: 'localhost' } },
    localStorage: { getItem: () => null },
    fetch: fetchSpy,
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout,
    URLSearchParams,
  });
  carregar(sandbox, 'shared/js/BffApiService.js');
  return { sandbox, fetchSpy };
}

describe('BffApiService.post — repassa ok/reason das falhas de push (unit VM)', () => {
  test('{ ok:false, reason:SEND_FAILED } sem dados → chega ao chamador (não vira null)', async () => {
    const { sandbox } = criarSandboxBff({ ok: false, reason: 'SEND_FAILED', data: { falhas: 2 } });
    const { data, error } = await sandbox.BffApiService.post('/api/v1/notificacoes/push-barbeiro', {});
    assert.strictEqual(error, null);
    assert.strictEqual(data?.ok, false, 'ramo data?.ok===false volta a disparar no cliente');
    assert.strictEqual(data?.reason, 'SEND_FAILED', 'razão real visível no console do cliente');
  });

  test('{ ok:true, reason:DUPLICATE } sem dados → também visível', async () => {
    const { sandbox } = criarSandboxBff({ ok: true, reason: 'DUPLICATE' });
    const { data } = await sandbox.BffApiService.post('/x', {});
    assert.strictEqual(data?.reason, 'DUPLICATE');
  });

  test('retrocompatível: { ok:true, dados:{...} } continua devolvendo só dados', async () => {
    const { sandbox } = criarSandboxBff({ ok: true, dados: { enviados: 1 } });
    const { data } = await sandbox.BffApiService.post('/x', {});
    assert.deepStrictEqual(data, { enviados: 1 }, 'shape antigo preservado para todos os consumidores');
  });

  test('retrocompatível: corpo sem ok e sem dados → data continua null', async () => {
    const { sandbox } = criarSandboxBff({ mensagem: 'qualquer' });
    const { data } = await sandbox.BffApiService.post('/x', {});
    assert.strictEqual(data, null);
  });

  test('HTTP não-ok continua virando error (comportamento preservado)', async () => {
    const { sandbox } = criarSandboxBff({ error: 'forbidden' }, { httpOk: false, status: 403 });
    const { data, error } = await sandbox.BffApiService.post('/x', {});
    assert.strictEqual(data, null);
    assert.strictEqual(error?.status, 403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sandbox: ProducaoSomAlerta com relógio e PushSoundService controlados
// ─────────────────────────────────────────────────────────────────────────────

function criarSandboxSom() {
  let agora = 0;
  const alertar = fn();
  const sandbox = vm.createContext({
    console, Object, Set, String, Number,
    window: {},
    Date: { now: () => agora },
    PushSoundService: { alertar },
  });
  carregar(sandbox, 'apps/profissional/assets/js/ProducaoSomAlerta.js');
  return {
    sandbox,
    alertar,
    avancar: (ms) => { agora += ms; },
  };
}

const evento = (id, status = 'in_service', professionalId = 'prof-1') =>
  ({ new: { id, status, professional_id: professionalId } });

describe('ProducaoSomAlerta — fallback de som (unit VM)', () => {
  test('entrada in_service toca o som (uma vez) e retorna true', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    assert.strictEqual(s.processarEvento(evento('e1')), true);
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('status waiting / payload sem entrada não tocam', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    assert.strictEqual(s.processarEvento(evento('e1', 'waiting')), false);
    assert.strictEqual(s.processarEvento({ new: null }), false);
    assert.strictEqual(s.processarEvento(null), false);
    assert.strictEqual(alertar.calls.length, 0);
  });

  test('mesma entrada (UPDATEs em sequência) toca só na primeira vez', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    s.processarEvento(evento('e1'));
    avancar(10_000);
    assert.strictEqual(s.processarEvento(evento('e1')), false, 'dedup por id da entrada');
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('cooldown: segunda entrada dentro da janela não toca (evita rajada/eco do push)', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    s.processarEvento(evento('e1'));
    avancar(1_000); // < COOLDOWN_MS
    assert.strictEqual(s.processarEvento(evento('e2')), false);
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('após o cooldown, nova entrada toca normalmente', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    s.processarEvento(evento('e1'));
    avancar(sandbox.ProducaoSomAlerta.COOLDOWN_MS + 1);
    assert.strictEqual(s.processarEvento(evento('e2')), true);
    assert.strictEqual(alertar.calls.length, 2);
  });

  test('reset() limpa o dedup (troca de barbearia)', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);
    s.processarEvento(evento('e1'));
    s.reset();
    avancar(10_000);
    assert.strictEqual(s.processarEvento(evento('e1')), true);
    assert.strictEqual(alertar.calls.length, 2);
  });

  test('teto de memória: ao estourar MAX_ENTRADAS o conjunto é reciclado sem quebrar', () => {
    const { sandbox, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    const MAX = sandbox.ProducaoSomAlerta.MAX_ENTRADAS;
    for (let i = 0; i < MAX; i++) {
      avancar(sandbox.ProducaoSomAlerta.COOLDOWN_MS + 1);
      s.processarEvento(evento(`e${i}`));
    }
    avancar(sandbox.ProducaoSomAlerta.COOLDOWN_MS + 1);
    assert.strictEqual(s.processarEvento(evento('e0')), false, 'ainda lembrado antes do teto');
    s.processarEvento(evento('overflow')); // dispara a reciclagem
    avancar(sandbox.ProducaoSomAlerta.COOLDOWN_MS + 1);
    assert.strictEqual(s.processarEvento(evento('e0')), true, 'após reciclar, id antigo pode alertar de novo');
  });

  test('sem PushSoundService no ambiente, não lança', () => {
    const { sandbox, avancar } = criarSandboxSom();
    // Novo contexto sem PushSoundService
    const semSom = vm.createContext({ console, Object, Set, Date: { now: () => 10_000 }, window: {} });
    carregar(semSom, 'apps/profissional/assets/js/ProducaoSomAlerta.js');
    const s = new semSom.ProducaoSomAlerta();
    assert.doesNotThrow(() => s.processarEvento(evento('e1')));
    void sandbox; void avancar;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProducaoSomAlerta.suprimirPorAcaoPropria() — barbeiro não ouve a própria ação
// ─────────────────────────────────────────────────────────────────────────────
//
// Bug real: barbeiro senta cliente manualmente (MinhaBarbeariaRuntimeController
// #fluxoSentar) → notificarBarbeiro:false já suprime o Web Push, mas o Realtime
// (mb-fila) devolve a MESMA mudança pro próprio app aberto, e ProducaoSomAlerta
// tocava o som mesmo assim, por não distinguir quem causou a transição.

describe('ProducaoSomAlerta.suprimirPorAcaoPropria() — ação do próprio barbeiro', () => {

  test('evento in_service do professionalId suprimido NÃO toca dentro da janela', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);

    s.suprimirPorAcaoPropria('prof-1');
    assert.strictEqual(s.processarEvento(evento('e1', 'in_service', 'prof-1')), false);
    assert.strictEqual(alertar.calls.length, 0);
  });

  test('evento in_service de OUTRO professionalId continua tocando normalmente', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);

    // Supressão é só pro barbeiro que agiu (prof-1) — parceiro diferente
    // sentando um cliente de verdade não deve ficar mudo.
    s.suprimirPorAcaoPropria('prof-1');
    assert.strictEqual(s.processarEvento(evento('e1', 'in_service', 'prof-2')), true);
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('após a janela de supressão expirar, evento do mesmo professionalId volta a tocar', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);

    s.suprimirPorAcaoPropria('prof-1', 5000);
    avancar(5001); // janela expirou
    assert.strictEqual(s.processarEvento(evento('e1', 'in_service', 'prof-1')), true);
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('sem chamar suprimirPorAcaoPropria(), comportamento é inalterado (evento sempre toca)', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);

    assert.strictEqual(s.processarEvento(evento('e1', 'in_service', 'prof-1')), true);
    assert.strictEqual(alertar.calls.length, 1);
  });

  test('reset() também limpa a supressão por ação própria', () => {
    const { sandbox, alertar, avancar } = criarSandboxSom();
    const s = new sandbox.ProducaoSomAlerta();
    avancar(10_000);

    s.suprimirPorAcaoPropria('prof-1');
    s.reset();
    assert.strictEqual(s.processarEvento(evento('e1', 'in_service', 'prof-1')), true, 'reset() deve limpar a supressão');
    assert.strictEqual(alertar.calls.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fiação — canal mb-fila e entrega no app profissional
// ─────────────────────────────────────────────────────────────────────────────

describe('Fiação — som de produção no app profissional', () => {
  test('callback do canal mb-fila repassa o payload ao ProducaoSomAlerta antes do re-render', () => {
    const idx = SRC_MB.indexOf('#iniciarRealtimeFila(barbershopId)');
    assert.ok(idx > 0, '#iniciarRealtimeFila deve existir');
    const bloco = SRC_MB.slice(idx, idx + 1400);
    assert.match(bloco, /\(payload\)\s*=>\s*\{/, 'callback agora recebe o payload');
    assert.match(bloco, /processarEvento\(payload\)/, 'payload vai ao alerta de som');
    assert.match(bloco, /#agendarReRenderEquipe\(\)/, 're-render preservado');
  });

  test('instância criada com guard de carga (typeof ProducaoSomAlerta)', () => {
    assert.match(SRC_MB, /typeof ProducaoSomAlerta !== 'undefined'/, 'guard de script não carregado');
    assert.match(SRC_MB, /#somProducao/, 'campo privado da instância');
  });

  test('index.html do profissional carrega ProducaoSomAlerta.js', () => {
    assert.match(SRC_HTML_PRO, /assets\/js\/ProducaoSomAlerta\.js/, 'script tag no app profissional');
  });

  test('#fluxoSentar suprime o som ANTES de chamar CadeiraService.sentar()', () => {
    const idxSentar = SRC_MB.indexOf('async #fluxoSentar(tipo, professionalId)');
    assert.ok(idxSentar > 0, '#fluxoSentar deve existir');
    const bloco = SRC_MB.slice(idxSentar, idxSentar + 3500);

    const idxSuprimir = bloco.indexOf('#somProducao?.suprimirPorAcaoPropria(professionalId)');
    const idxAwaitCS  = bloco.indexOf('await CadeiraService.sentar({');
    assert.ok(idxSuprimir > 0, 'deve chamar suprimirPorAcaoPropria(professionalId)');
    assert.ok(idxAwaitCS > 0, 'deve chamar CadeiraService.sentar()');
    assert.ok(
      idxSuprimir < idxAwaitCS,
      'suprimirPorAcaoPropria() precisa vir ANTES do await — a janela tem que estar aberta antes da escrita no banco, senão o evento Realtime pode chegar antes da supressão ser marcada',
    );
  });

  test('#handlePushAction ("chegou") suprime o som ANTES de updateClientConfirmed()', () => {
    const idxFn = SRC_MB.indexOf('async #handlePushAction(');
    assert.ok(idxFn > 0, '#handlePushAction deve existir');
    const idxChegou = SRC_MB.indexOf("acao === 'chegou'", idxFn);
    assert.ok(idxChegou > idxFn, 'ramo "chegou" deve existir dentro de #handlePushAction');
    const bloco = SRC_MB.slice(idxChegou, idxChegou + 800);

    const idxSuprimir = bloco.indexOf("#somProducao?.suprimirPorAcaoPropria(this.#profissionalId)");
    const idxAwaitUpd = bloco.indexOf("await QueueRepository.updateClientConfirmed(entradaId, 'yes')");
    assert.ok(idxSuprimir > 0, 'deve chamar suprimirPorAcaoPropria(this.#profissionalId)');
    assert.ok(idxAwaitUpd > 0, 'deve chamar QueueRepository.updateClientConfirmed');
    assert.ok(
      idxSuprimir < idxAwaitUpd,
      'suprimirPorAcaoPropria() precisa vir ANTES do await — clique no botão "chegou" pode reabrir o app com o dedup do ProducaoSomAlerta vazio, e o Realtime devolveria essa mesma escrita como se fosse um evento novo',
    );
  });

  test('#handlePushAction ("aguardar") suprime o som antes de BarbeiroEsperaFluxo.iniciarEspera() (preventivo)', () => {
    const idxFn = SRC_MB.indexOf('async #handlePushAction(');
    assert.ok(idxFn > 0, '#handlePushAction deve existir');
    const idxAguardar = SRC_MB.indexOf("acao === 'aguardar'", idxFn);
    assert.ok(idxAguardar > idxFn, 'ramo "aguardar" deve existir dentro de #handlePushAction');
    const bloco = SRC_MB.slice(idxAguardar, idxAguardar + 500);

    const idxSuprimir = bloco.indexOf("#somProducao?.suprimirPorAcaoPropria(this.#profissionalId)");
    const idxIniciarEspera = bloco.indexOf('BarbeiroEsperaFluxo.iniciarEspera({');
    assert.ok(idxSuprimir > 0, 'deve chamar suprimirPorAcaoPropria(this.#profissionalId)');
    assert.ok(idxIniciarEspera > 0, 'deve chamar BarbeiroEsperaFluxo.iniciarEspera');
    assert.ok(
      idxSuprimir < idxIniciarEspera,
      'supressão preventiva deve vir antes de iniciarEspera(), mesmo hoje sem escrita no banco nesse ramo',
    );
  });
});
