'use strict';

// =============================================================
// push-sound-service.test.js
//
// Cobre PushSoundService (som customizado de push — Opção C):
//   - tocar() toca o mp3 correto
//   - corta em 3s (pause + currentTime=0), mesmo com arquivo maior
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
  const loggerErrors = [];
  const vibrateCalls = [];
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
    navigator: {
      vibrate: (pattern) => {
        vibrateCalls.push(pattern);
        return true;
      },
    },
    LoggerService: {
      error: (...args) => loggerErrors.push(args),
    },
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

  return {
    sandbox,
    audios,
    timers,
    loggerErrors,
    vibrateCalls,
    documentListeners,
    dispararGesto,
    runByDelay,
  };
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

  test('corta o som em 3s (pause + currentTime=0)', () => {
    const { sandbox, audios, runByDelay } = criarSandbox();
    sandbox.PushSoundService.tocar();
    const a = audios[0];
    assert.equal(a.paused, false, 'tocando antes do corte');

    runByDelay(3000);
    assert.ok(a.pauseCalls >= 1, 'pausa no corte de 3s');
    assert.equal(a.paused, true, 'parado após 3s');
    assert.equal(a.currentTime, 0, 'rebobina para 0');
  });

  test('reusa a mesma instância de Audio (não empilha áudios)', () => {
    const { sandbox, audios } = criarSandbox();
    sandbox.PushSoundService.tocar();
    sandbox.PushSoundService.tocar();
    assert.equal(audios.length, 1, 'reaproveita a instância existente');
    assert.equal(audios[0].playCalls, 2, 'toca de novo do início');
  });

  test('autoplay bloqueado (play rejeitado) não lança e registra o erro', async () => {
    const { sandbox, loggerErrors } = criarSandbox({ playRejects: true });
    assert.doesNotThrow(() => sandbox.PushSoundService.tocar(), 'best-effort silencioso');
    await Promise.resolve();
    assert.equal(loggerErrors.length, 1, 'deve registrar a rejeição de audio.play()');
    assert.match(String(loggerErrors[0][0]), /audio\.play/i);
    assert.match(String(loggerErrors[0][1]?.message), /autoplay blocked/i);
  });

  test('alertar() toca o mp3 e vibra no app aberto', () => {
    const { sandbox, audios, vibrateCalls } = criarSandbox();
    const pattern = [200, 100, 200];

    sandbox.PushSoundService.alertar(pattern);

    assert.equal(audios[0].playCalls, 1, 'deve tentar tocar o mp3');
    assert.deepEqual(vibrateCalls, [pattern], 'deve chamar navigator.vibrate com o padrão recebido');
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

  test('preparar() registra rejeição de autoplay sem quebrar o gesto', async () => {
    const { sandbox, loggerErrors, dispararGesto } = criarSandbox({ playRejects: true });

    sandbox.PushSoundService.preparar();
    assert.doesNotThrow(() => dispararGesto('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(loggerErrors.length, 1);
    assert.match(String(loggerErrors[0][0]), /preparação falhou/i);
  });
});

describe('PushSoundService — fonte dos Service Workers', () => {
  const swCli = fs.readFileSync(path.join(ROOT, 'apps/cliente/sw.js'), 'utf8');
  const swPro = fs.readFileSync(path.join(ROOT, 'apps/profissional/sw.js'), 'utf8');

  test('ambos os SW mantêm som/vibração ativos e emitem BF_PUSH_SOUND antes da notificação', () => {
    for (const [nome, src] of [['cliente', swCli], ['profissional', swPro]]) {
      const pushStart = src.indexOf('static push(e)');
      const pushBlock = src.slice(pushStart, pushStart + 4500);
      const soundIndex = pushBlock.indexOf('BF_PUSH_SOUND');
      const notificationIndex = pushBlock.indexOf('await self.registration.showNotification');

      assert.match(pushBlock, /silent:\s*false/, `${nome}: notificação não pode ser silenciosa`);
      assert.doesNotMatch(pushBlock, /^\s*silent:\s*(?:true|emForeground)/m, `${nome}: silent não pode conflitar com vibrate`);
      assert.match(src, /temJanelaAberta/, `${nome}: deve detectar janela aberta`);
      assert.match(src, /BF_PUSH_SOUND/, `${nome}: deve emitir BF_PUSH_SOUND com janela aberta`);
      assert.ok(soundIndex >= 0 && soundIndex < notificationIndex, `${nome}: mp3 deve ser solicitado antes de showNotification`);
      assert.match(src, /notificacao-push\.mp3/, `${nome}: deve pre-cachear o mp3 do push`);
      assert.match(src, /PushSoundService\.js/, `${nome}: deve pre-cachear o servico de som`);
      assert.match(src, /matchAll\(\{\s*type:\s*'window'/, `${nome}: deve consultar clientes de janela`);
    }
  });

  test('AppBootstrap dos dois apps delega som e vibração ao PushSoundService', () => {
    for (const app of ['cliente', 'profissional']) {
      const src = fs.readFileSync(
        path.join(ROOT, `apps/${app}/assets/js/AppBootstrap.js`),
        'utf8',
      );
      assert.match(src, /PushSoundService\.alertar\(e\.data\?\.vibrate\)/);
    }
  });
});

describe('MP3 de push — Content-Type', () => {
  test('servidor local mapeia .mp3 para audio/mpeg', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
    assert.match(src, /'\.mp3'\s*:\s*'audio\/mpeg'/);
  });

  test('Vercel declara audio/mpeg para o arquivo de notificação', () => {
    for (const configPath of ['vercel.json', 'apps/cliente/vercel.json', 'apps/profissional/vercel.json']) {
      const config = JSON.parse(fs.readFileSync(path.join(ROOT, configPath), 'utf8'));
      const rule = config.headers?.find(item => item.source === '/shared/audio/notificacao-push.mp3');
      assert.ok(rule, `${configPath}: deve declarar header para o mp3`);
      assert.ok(
        rule.headers.some(header => header.key === 'Content-Type' && header.value === 'audio/mpeg'),
        `${configPath}: Content-Type deve ser audio/mpeg`,
      );
    }
  });
});
