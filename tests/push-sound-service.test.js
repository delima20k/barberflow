'use strict';

// =============================================================
// push-sound-service.test.js
//
// Cobre PushSoundService (som customizado de push — Opção C):
//   - tocar() toca o mp3 correto
//   - corta em 5s (pause + currentTime=0), mesmo com arquivo maior
//   - reusa a mesma instância de Audio (não empilha)
//   - autoplay bloqueado (play() rejeitado) não quebra
//   - parar() interrompe o som
// + asserções de fonte nos SW (silent dinâmico + BF_PUSH_SOUND)
// =============================================================

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { carregar, ROOT } = require('./_helpers.js');

function criarSandbox({ playRejects = false } = {}) {
  const timers = [];
  const audios = [];
  const documentListeners = new Map();
  let seq = 0;

  class AudioMock {
    constructor(url) {
      this.url = url; this.preload = ''; this.currentTime = 0; this.paused = true;
      this.volume = 1; this.muted = false;
      this.playCalls = 0; this.pauseCalls = 0;
      audios.push(this);
    }
    play() {
      this.playCalls++; this.paused = false;
      return playRejects ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve();
    }
    pause() { this.pauseCalls++; this.paused = true; }
  }

  const sandbox = vm.createContext({
    console,
    document: {
      addEventListener: (event, handler, options) => documentListeners.set(event, { handler, options }),
      removeEventListener: (event, handler) => {
        const listener = documentListeners.get(event);
        if (listener?.handler === handler) documentListeners.delete(event);
      },
    },
    Audio: AudioMock,
    setTimeout: (fn, delay) => { const id = ++seq; timers.push({ id, fn, delay }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
  });

  carregar(sandbox, 'shared/js/PushSoundService.js');

  const runByDelay = (delay) => {
    const alvo = timers.filter(t => t.delay === delay);
    for (const t of alvo) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); }
    for (const t of alvo) t.fn();
  };

  const dispararGesto = (event = 'pointerdown') => documentListeners.get(event)?.handler();

  return { sandbox, audios, timers, documentListeners, dispararGesto, runByDelay };
}

describe('PushSoundService — comportamento', () => {
  test('tocar() reproduz o mp3 de notificação', () => {
    const { sandbox, audios } = criarSandbox();
    sandbox.PushSoundService.tocar();
    assert.equal(audios.length, 1, 'cria uma instância de Audio');
    assert.match(audios[0].url, /notificacao-push\.mp3$/, 'usa o mp3 correto');
    assert.equal(audios[0].playCalls, 1, 'chama play()');
    assert.equal(audios[0].paused, false, 'fica tocando');
  });

  test('corta o som em 5s (pause + currentTime=0)', () => {
    const { sandbox, audios, runByDelay } = criarSandbox();
    sandbox.PushSoundService.tocar();
    const a = audios[0];
    assert.equal(a.paused, false, 'tocando antes do corte');

    runByDelay(5000);
    assert.ok(a.pauseCalls >= 1, 'pausa no corte de 5s');
    assert.equal(a.paused, true, 'parado após 5s');
    assert.equal(a.currentTime, 0, 'rebobina para 0');
  });

  test('reusa a mesma instância de Audio (não empilha áudios)', () => {
    const { sandbox, audios } = criarSandbox();
    sandbox.PushSoundService.tocar();
    sandbox.PushSoundService.tocar();
    assert.equal(audios.length, 1, 'reaproveita a instância existente');
    assert.equal(audios[0].playCalls, 2, 'toca de novo do início');
  });

  test('autoplay bloqueado (play rejeitado) não lança', () => {
    const { sandbox } = criarSandbox({ playRejects: true });
    assert.doesNotThrow(() => sandbox.PushSoundService.tocar(), 'best-effort silencioso');
  });

  test('parar() interrompe o som', () => {
    const { sandbox, audios } = criarSandbox();
    sandbox.PushSoundService.tocar();
    sandbox.PushSoundService.parar();
    assert.equal(audios[0].paused, true, 'para o áudio');
    assert.equal(audios[0].currentTime, 0, 'rebobina');
  });

  test('preparar() tenta desbloquear o audio no primeiro gesto do usuario', async () => {
    const { sandbox, audios, documentListeners, dispararGesto } = criarSandbox();

    sandbox.PushSoundService.preparar();
    assert.ok(documentListeners.has('pointerdown'), 'registra listener de gesto');

    dispararGesto('pointerdown');
    assert.equal(documentListeners.size, 0, 'remove listeners depois do primeiro gesto');
    assert.equal(audios.length, 1, 'cria audio no gesto');
    assert.equal(audios[0].playCalls, 1, 'tenta tocar silenciosamente no gesto');

    await Promise.resolve();
    assert.equal(audios[0].paused, true, 'pausa apos preparar');
    assert.equal(audios[0].currentTime, 0, 'rebobina apos preparar');

    sandbox.PushSoundService.tocar();
    assert.equal(audios.length, 1, 'reusa audio preparado');
    assert.equal(audios[0].playCalls, 2, 'toca o mesmo audio no push');
  });
});

describe('PushSoundService — fonte dos Service Workers', () => {
  const swCli = fs.readFileSync(path.join(ROOT, 'apps/cliente/sw.js'), 'utf8');
  const swPro = fs.readFileSync(path.join(ROOT, 'apps/profissional/sw.js'), 'utf8');

  test('ambos os SW usam silent dinâmico (emForeground) e emitem BF_PUSH_SOUND', () => {
    for (const [nome, src] of [['cliente', swCli], ['profissional', swPro]]) {
      assert.match(src, /silent:\s*emForeground/, `${nome}: silent deve ser dinâmico`);
      assert.match(src, /temJanelaAberta/, `${nome}: deve detectar janela aberta`);
      assert.match(src, /BF_PUSH_SOUND/, `${nome}: deve emitir BF_PUSH_SOUND com janela aberta`);
      assert.match(src, /notificacao-push\.mp3/, `${nome}: deve pre-cachear o mp3 do push`);
      assert.match(src, /PushSoundService\.js/, `${nome}: deve pre-cachear o servico de som`);
      assert.match(src, /matchAll\(\{\s*type:\s*'window'/, `${nome}: deve consultar clientes de janela`);
    }
  });
});
