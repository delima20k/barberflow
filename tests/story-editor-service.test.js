'use strict';

// Testes unitários do StoryEditorService + overlays (lógica pura, sem DOM).

const { test }   = require('node:test');
const assert     = require('node:assert/strict');
const {
  StoryEditorService,
  OverlayBase,
  TextoOverlay,
  EmojiOverlay,
} = require('../shared/js/StoryEditorService.js');

const fakeFile = (type) => ({ type, name: `f.${type.split('/')[1] || 'bin'}` });

// ── Mídia ────────────────────────────────────────────────────

test('definirMedia armazena mídia e reseta overlays', () => {
  const svc = new StoryEditorService();
  svc.adicionarTexto('oi');
  assert.equal(svc.overlays.length, 1);

  const media = svc.definirMedia({ file: fakeFile('video/mp4'), tipo: 'video', origem: 'upload' });
  assert.equal(media.tipo, 'video');
  assert.equal(media.origem, 'upload');
  assert.equal(svc.overlays.length, 0, 'trocar mídia deve resetar overlays');
});

test('definirMedia infere tipo a partir do mime quando não informado', () => {
  const svc = new StoryEditorService();
  assert.equal(svc.definirMedia({ file: fakeFile('image/png') }).tipo, 'imagem');
  assert.equal(svc.definirMedia({ file: fakeFile('video/webm') }).tipo, 'video');
});

test('validarArquivo aceita vídeo/imagem e rejeita o resto', () => {
  assert.equal(StoryEditorService.validarArquivo(fakeFile('video/mp4')), true);
  assert.equal(StoryEditorService.validarArquivo(fakeFile('image/jpeg')), true);
  assert.throws(() => StoryEditorService.validarArquivo(fakeFile('application/pdf')));
  assert.throws(() => StoryEditorService.validarArquivo(fakeFile('')));
});

// ── Overlays ─────────────────────────────────────────────────

test('adicionarTexto/adicionarEmoji criam overlay com estado correto', () => {
  const svc = new StoryEditorService();
  const t = svc.adicionarTexto('Promoção', { x: 10, y: 20, escala: 2 });
  assert.equal(t.tipo, 'texto');
  assert.equal(t.conteudo, 'Promoção');
  assert.deepEqual(t.posicao, { x: 10, y: 20 });
  assert.equal(t.escala, 2);

  const e = svc.adicionarEmoji('🔥');
  assert.equal(e.tipo, 'emoji');
  assert.equal(e.conteudo, '🔥');
  assert.equal(svc.overlays.length, 2);
  assert.notEqual(t.id, e.id, 'ids devem ser únicos');
});

test('respeita o limite máximo de overlays', () => {
  const svc = new StoryEditorService({ maxOverlays: 2 });
  svc.adicionarTexto('a');
  svc.adicionarEmoji('b');
  assert.throws(() => svc.adicionarTexto('c'), /Limite/);
});

test('moverOverlay atualiza x/y', () => {
  const svc = new StoryEditorService();
  const o = svc.adicionarTexto('x');
  svc.moverOverlay(o.id, 33, 44);
  assert.deepEqual(svc.obterOverlay(o.id).posicao, { x: 33, y: 44 });
});

test('redimensionarOverlay atualiza escala dentro dos limites', () => {
  const svc = new StoryEditorService();
  const o = svc.adicionarTexto('x');
  svc.redimensionarOverlay(o.id, 3);
  assert.equal(svc.obterOverlay(o.id).escala, 3);
  svc.redimensionarOverlay(o.id, 999);
  assert.equal(svc.obterOverlay(o.id).escala, StoryEditorService.ESCALA_MAX);
  svc.redimensionarOverlay(o.id, 0.0001);
  assert.equal(svc.obterOverlay(o.id).escala, StoryEditorService.ESCALA_MIN);
});

test('removerOverlay remove pelo id', () => {
  const svc = new StoryEditorService();
  const o = svc.adicionarTexto('x');
  assert.equal(svc.removerOverlay(o.id), true);
  assert.equal(svc.overlays.length, 0);
  assert.equal(svc.removerOverlay('inexistente'), false);
});

test('resetar limpa mídia e overlays; estado é snapshot serializável', () => {
  const svc = new StoryEditorService();
  svc.definirMedia({ file: fakeFile('video/mp4'), origem: 'camera' });
  svc.adicionarEmoji('😀', { x: 5, y: 6, escala: 1.5 });

  const est = svc.estado;
  assert.equal(est.media.origem, 'camera');
  assert.equal(est.overlays.length, 1);
  assert.deepEqual(est.overlays[0], {
    id: est.overlays[0].id, tipo: 'emoji', conteudo: '😀', x: 5, y: 6, escala: 1.5,
  });

  svc.resetar();
  assert.equal(svc.estado.media, null);
  assert.equal(svc.estado.overlays.length, 0);
});

// ── Música ───────────────────────────────────────────────────

test('definirMusica guarda a trilha; estado inclui musica; resetar limpa', () => {
  const svc = new StoryEditorService();
  assert.equal(svc.musica, null);

  svc.definirMusica({ id: 'm1', titulo: 'Batida Urban', artista: 'BarberFlow' });
  assert.deepEqual(svc.musica, { id: 'm1', titulo: 'Batida Urban', artista: 'BarberFlow' });
  assert.deepEqual(svc.estado.musica, { id: 'm1', titulo: 'Batida Urban', artista: 'BarberFlow' });

  svc.removerMusica();
  assert.equal(svc.musica, null);

  svc.definirMusica({ id: 'm2', titulo: 'Lo-fi' });
  svc.resetar();
  assert.equal(svc.estado.musica, null);
});

// ── Interface comum (Open/Closed) ────────────────────────────

test('TextoOverlay e EmojiOverlay compartilham o contrato de OverlayBase', () => {
  for (const Cls of [TextoOverlay, EmojiOverlay]) {
    const o = new Cls('z', { x: 1, y: 2, escala: 1 });
    assert.ok(o instanceof OverlayBase, `${Cls.name} deve estender OverlayBase`);
    assert.equal(typeof o.mover, 'function');
    assert.equal(typeof o.redimensionar, 'function');
    assert.ok('tipo' in o && 'posicao' in o && 'escala' in o);
    o.mover(7, 8).redimensionar(2);
    assert.deepEqual(o.posicao, { x: 7, y: 8 });
    assert.equal(o.escala, 2);
  }
});

test('overlay.render usa o document injetado (stub)', () => {
  const criados = [];
  const stubDoc = {
    createElement: (tag) => {
      const el = { tagName: tag.toUpperCase(), className: '', textContent: '', dataset: {}, style: {} };
      criados.push(el);
      return el;
    },
  };
  const o = new TextoOverlay('Olá', { x: 4, y: 5, escala: 1.2 });
  const node = o.render(stubDoc);
  assert.equal(node.className, 'sc-overlay-item sc-overlay-texto');
  assert.equal(node.dataset.overlayId, o.id);
  assert.equal(node.textContent, 'Olá');
  assert.match(node.style.transform, /translate\(4px, 5px\) scale\(1\.2\)/);
});

// ── Pinça (pura) ─────────────────────────────────────────────

test('escalaPinca aplica a razão de distâncias respeitando min/max', () => {
  // dobra a distância → dobra a escala
  assert.equal(StoryEditorService.escalaPinca(100, 200, 1), 2);
  // metade da distância → metade da escala
  assert.equal(StoryEditorService.escalaPinca(100, 50, 2), 1);
  // clamp no máximo
  assert.equal(StoryEditorService.escalaPinca(10, 10000, 1), StoryEditorService.ESCALA_MAX);
  // clamp no mínimo
  assert.equal(StoryEditorService.escalaPinca(10000, 1, 1), StoryEditorService.ESCALA_MIN);
  // entrada inválida → mantém base
  assert.equal(StoryEditorService.escalaPinca(0, 100, 1.5), 1.5);
});
