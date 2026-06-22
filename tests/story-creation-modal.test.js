'use strict';

// Testes de componente do StoryCreationModal — vm-sandbox + DOM mock
// (estilo tests/fluxo-de-fila.test.js). Verifica render, sub-modal de
// emoji, criação de overlay de texto, arrasto e callback de finalizar.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const { carregar, fn } = require('./_helpers');

// ── DOM mock mínimo ──────────────────────────────────────────

function matchSel(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('.')) {
    const classes = sel.slice(1).split('.').filter(Boolean);
    const own = el.className.split(/\s+/).filter(Boolean);
    return classes.every(c => own.includes(c));
  }
  return el.tagName === sel.toUpperCase();
}
function query(root, selector) {
  const sels = selector.split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  (function walk(node) {
    for (const c of node._children) {
      if (sels.some(s => matchSel(c, s))) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    className: '', textContent: '', value: '', src: '',
    type: '', accept: '', placeholder: '',
    muted: false, hidden: false, disabled: false, files: null,
    volume: 1, currentTime: 0, duration: 30, paused: true,
    _children: [], parentNode: null, dataset: {}, style: {}, attributes: {},
    get firstChild() { return el._children[0] ?? null; },
    classList: {
      _set: () => new Set(el.className.split(/\s+/).filter(Boolean)),
      add(c)      { const s = el.classList._set(); s.add(c);    el.className = [...s].join(' '); },
      remove(c)   { const s = el.classList._set(); s.delete(c); el.className = [...s].join(' '); },
      contains(c) { return el.className.split(/\s+/).includes(c); },
      toggle(c, f){ const has = el.classList.contains(c); const add = f === undefined ? !has : f; add ? el.classList.add(c) : el.classList.remove(c); },
    },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k)    { return el.attributes[k] ?? null; },
    appendChild(c)     { c.parentNode = el; el._children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = el; const i = el._children.indexOf(ref); if (i < 0) el._children.push(c); else el._children.splice(i, 0, c); return c; },
    remove()           { const p = el.parentNode; if (p) p._children = p._children.filter(x => x !== el); el.parentNode = null; },
    addEventListener(ev, h)    { (listeners[ev] ??= []).push(h); },
    removeEventListener(ev, h) { if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== h); },
    _fire(ev, data = {}) { [...(listeners[ev] ?? [])].forEach(h => h({ target: el, preventDefault() {}, stopPropagation() {}, ...data })); },
    setPointerCapture() {}, releasePointerCapture() {},
    focus() { el._fire('focus'); }, blur() { el._fire('blur'); }, click() { el._fire('click'); },
    play() { el.paused = false; return Promise.resolve(); },
    pause() { el.paused = true; },
    querySelector(s)    { return query(el, s)[0] ?? null; },
    querySelectorAll(s) { return query(el, s); },
  };
  return el;
}

function criarSandbox() {
  const docListeners = {};
  const document = {
    body: makeEl('body'),
    documentElement: makeEl('html'),
    createElement: (t) => makeEl(t),
    addEventListener: (ev, h) => { (docListeners[ev] ??= []).push(h); },
    removeEventListener: (ev, h) => { if (docListeners[ev]) docListeners[ev] = docListeners[ev].filter(f => f !== h); },
    _fire: (ev, data = {}) => [...(docListeners[ev] ?? [])].forEach(h => h(data)),
  };
  const sandbox = vm.createContext({ document, window: {}, console });
  carregar(sandbox, 'shared/js/StoryEditorService.js');
  carregar(sandbox, 'shared/js/MusicCacheService.js');
  carregar(sandbox, 'shared/js/MusicCatalogService.js');
  carregar(sandbox, 'shared/js/AudioPreviewPlayer.js');
  carregar(sandbox, 'shared/js/MusicPlaybackState.js');
  carregar(sandbox, 'shared/js/MusicRepository.js');
  carregar(sandbox, 'shared/js/MusicStateManager.js');
  carregar(sandbox, 'shared/js/MusicPlayerService.js');
  carregar(sandbox, 'shared/js/MusicSelectionController.js');
  carregar(sandbox, 'shared/js/MusicPreviewController.js');
  carregar(sandbox, 'shared/js/StoryCreationModal.js');
  return { sandbox, document };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

function catalogoFixture(qtd = 3) {
  const generos = ['Pop', 'Rock'];
  const tracks = Array.from({ length: qtd }, (_, i) => ({
    music_id: `id-${i}`, music_name: `Faixa ${i}`, artist: 'Artista',
    duration: 35, genre: generos[i % generos.length], url: `https://r2/${i}.m4a`, ext: 'm4a',
  }));
  return { generatedAt: 'x', count: tracks.length, genres: ['Todos', ...generos], tracks };
}

function stubApi(catalogo) {
  return { musicas: { catalogo: async () => ({ data: catalogo, error: null }) } };
}

function FakeAudioFactory() {
  const instances = [];
  class FakeAudio {
    constructor() {
      this.src = '';
      this.volume = 1;
      this.preload = '';
      this.currentTime = 0;
      this.duration = 30;
      this.paused = true;
      this.listeners = {};
      this.playCount = 0;
      instances.push(this);
    }
    addEventListener(ev, handler) { (this.listeners[ev] ??= []).push(handler); }
    play() { this.paused = false; this.playCount += 1; return Promise.resolve(); }
    pause() { this.paused = true; }
    emit(ev) { for (const h of this.listeners[ev] ?? []) h(); }
  }
  FakeAudio.instances = instances;
  return FakeAudio;
}

const getOverlay = (document) => document.body.querySelector('.sc-overlay');

// ── Testes ───────────────────────────────────────────────────

test('abrir() monta a estrutura básica da modal', () => {
  const { sandbox, document } = criarSandbox();
  sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });

  const ov = getOverlay(document);
  assert.ok(ov, '.sc-overlay deve ser anexado ao body');
  assert.ok(ov.querySelector('.sc-preview'), 'tem o quadro de preview');
  assert.ok(ov.querySelector('.sc-side-menu'), 'tem o menu lateral');
  assert.ok(ov.querySelector('.sc-text-bar'), 'tem a barra de texto abaixo do preview');
  assert.equal(ov.querySelectorAll('.sc-tool').length, 4, 'menu lateral: upload, câmera, música, emoji');
  assert.ok(ov.querySelector('.sc-bottom-actions'), 'tem a barra de ações inferior');
  assert.equal(ov.querySelectorAll('.sc-btn').length, 2, 'dois botões inferiores');
  assert.ok(ov.querySelector('.sc-btn--primario'), 'tem o botão Finalizar');
});

test('botão Emoji abre a sub-modal de emojis', () => {
  const { sandbox, document } = criarSandbox();
  sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
  const ov = getOverlay(document);
  const stage = ov.querySelector('.sc-stage');

  assert.equal(ov.querySelector('.sc-emoji-sheet'), null, 'sheet não existe antes');
  ov.querySelectorAll('.sc-tool')[3]._fire('click'); // 4º = Emoji
  const sheet = ov.querySelector('.sc-emoji-sheet');
  assert.ok(sheet, 'sub-modal de emoji aberta');
  assert.equal(sheet.parentNode, stage, 'sheet interno fica dentro do palco sc-stage');
  assert.ok(sheet.querySelector('.sc-emoji-close'), 'tem botao proprio de fechar');
  assert.equal(sheet.hidden, false);
  assert.equal(sheet.querySelectorAll('.sc-emoji-btn').length, sandbox.StoryCreationModal.EMOJIS.length);

  sheet.querySelector('.sc-emoji-close')._fire('click');
  assert.equal(sheet.hidden, true, 'botao fecha apenas a sheet de emoji');
  assert.ok(getOverlay(document), 'modal principal continua aberta');
});

test('enviar texto cria um overlay de texto no preview e no serviço', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  const input = ov.querySelector('.sc-text-input');
  input.value = 'Promoção';
  ov.querySelector('.sc-text-send')._fire('click');

  assert.equal(service.estado.overlays.length, 1);
  assert.equal(service.estado.overlays[0].tipo, 'texto');
  assert.equal(service.estado.overlays[0].conteudo, 'Promoção');
  assert.ok(ov.querySelector('.sc-overlay-item.sc-overlay-texto'), 'overlay renderizado no preview');
  assert.equal(input.value, '', 'input é limpo após enviar');
});

test('escolher emoji cria um overlay de emoji', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[3]._fire('click');
  ov.querySelector('.sc-emoji-btn')._fire('click');

  assert.equal(service.estado.overlays.length, 1);
  assert.equal(service.estado.overlays[0].tipo, 'emoji');
  assert.ok(ov.querySelector('.sc-overlay-item.sc-overlay-emoji'));
});

test('botão Música abre a modal com gêneros + lista (catálogo) e "Usar" guarda a trilha', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  service.definirMedia({ file: { type: 'video/mp4', size: 10 }, tipo: 'video', origem: 'upload' });
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(3)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  assert.equal(ov.querySelector('.sc-music-sheet'), null);
  ov.querySelectorAll('.sc-tool')[2]._fire('click'); // 3º = Música
  await tick();

  const sheet = ov.querySelector('.sc-music-sheet');
  assert.equal(ov.querySelector('.sc-music-title').textContent, 'Selecionar Música');
  assert.ok(sheet, 'modal de música aberta');
  assert.equal(sheet.parentNode, ov.querySelector('.sc-stage'), 'sheet interno fica dentro do palco sc-stage');
  assert.ok(sheet.querySelector('.sc-music-close'), 'tem botao proprio de fechar');
  assert.ok(ov.querySelector('.sc-music-search'), 'tem busca');
  assert.ok(ov.querySelectorAll('.sc-music-genre').length >= 3, 'tem chips de gênero (Todos + gêneros)');
  const items = ov.querySelectorAll('.sc-music-item');
  assert.equal(ov.querySelector('.sc-music-more'), null, 'sem botao manual de carregar mais');
  assert.equal(items.length, 3, 'lista renderizada a partir do catálogo');

  ov.querySelector('.sc-music-usar')._fire('click');
  assert.ok(service.estado.musica, 'trilha guardada no estado');
  assert.equal(service.estado.musica.music_id, 'id-0', 'só a referência (music_id)');
  assert.equal(service.estado.musica.url, undefined, 'NÃO persiste url/áudio');
  assert.ok(ov.querySelector('.sc-mix'), 'painel de mix aparece após Usar');
  assert.equal(ov.querySelector('.sc-mix').hidden, false);
  assert.equal(ov.querySelector('.sc-mix-title').textContent, 'Audio do Video');
});

test('botao fechar da musica esconde so a sheet interna e permite reabrir', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(2)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();

  const sheet = ov.querySelector('.sc-music-sheet');
  sheet.querySelector('.sc-music-close')._fire('click');

  assert.equal(sheet.hidden, true, 'botao fecha apenas a sheet de musica');
  assert.ok(getOverlay(document), 'modal principal continua aberta');

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  assert.equal(sheet.hidden, false, 'botao Musica reabre a mesma sheet');
  assert.equal(ov.querySelectorAll('.sc-music-item').length, 2, 'lista continua renderizada');
});

test('sheet de musica mostra generos e lista mesmo com catalogo sob demanda lento', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  let resolverPagina;
  const catalogo = {
    generos: () => ['Todos', 'Pop', 'Rock'],
    buscarPagina: () => new Promise((resolve) => {
      resolverPagina = resolve;
    }),
  };

  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');

  const sheet = ov.querySelector('.sc-music-sheet');
  assert.ok(sheet, 'sheet existe imediatamente');
  assert.ok(ov.querySelector('.sc-music-search'), 'input de busca existe');
  assert.equal(ov.querySelectorAll('.sc-music-genre').length, 3, 'generos aparecem antes da resposta');
  assert.ok(ov.querySelector('.sc-music-list'), 'container principal da lista existe');
  assert.equal(ov.querySelectorAll('.sc-music-item').length, 0, 'lista aguarda pagina');

  resolverPagina({ tracks: catalogoFixture(2).tracks, totalPages: 1, hasMore: false });
  await tick();

  assert.equal(ov.querySelectorAll('.sc-music-item').length, 2, 'musicas entram quando a pagina chega');
});

test('sheet de musica renderiza 20 itens e carrega a proxima pagina ao rolar', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(45)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();

  const sheet = ov.querySelector('.sc-music-sheet');
  assert.equal(ov.querySelectorAll('.sc-music-item').length, 20, 'primeira pagina limita 20 itens');
  assert.ok(ov.querySelector('.sc-music-sentinel'), 'tem sentinel de scroll infinito');
  assert.equal(ov.querySelector('.sc-music-more'), null, 'nao usa botao carregar mais');

  sheet.scrollTop = 600;
  sheet.clientHeight = 400;
  sheet.scrollHeight = 980;
  sheet._fire('scroll');
  await tick();
  await tick();

  assert.equal(ov.querySelectorAll('.sc-music-item').length, 40, 'scroll anexa a segunda pagina');
});

test('play da lista toca somente uma musica, atualiza pause/tempo e nao cria audios extras', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(3)) });
  const FakeAudio = FakeAudioFactory();
  sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();

  const plays = ov.querySelectorAll('.sc-music-play');
  assert.equal(ov.querySelector('.sc-music-time').textContent, '00:00 / 00:30');

  plays[0]._fire('click');
  assert.equal(FakeAudio.instances.length, 1, 'um unico Audio criado');
  assert.equal(FakeAudio.instances[0].src, 'https://r2/0.m4a');
  assert.equal(plays[0].classList.contains('is-playing'), true);

  FakeAudio.instances[0].currentTime = 7;
  FakeAudio.instances[0].duration = 35;
  FakeAudio.instances[0].emit('timeupdate');
  assert.equal(ov.querySelector('.sc-music-time').textContent, '00:07 / 00:30');

  plays[1]._fire('click');
  assert.equal(FakeAudio.instances.length, 1, 'trocar faixa reutiliza o mesmo Audio');
  assert.equal(FakeAudio.instances[0].src, 'https://r2/1.m4a');
  assert.equal(plays[0].classList.contains('is-playing'), false);
  assert.equal(plays[1].classList.contains('is-playing'), true);
});

for (const tipo of ['imagem', 'video']) {
  test(`Usar aplica musica no preview de ${tipo} e tocar inicia audio`, async () => {
    const { sandbox, document } = criarSandbox();
    const service = new sandbox.StoryEditorService();
    service.definirMedia({ file: { type: tipo === 'imagem' ? 'image/jpeg' : 'video/mp4', size: 10 }, tipo, origem: 'upload' });
    const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(1)) });
    const FakeAudio = FakeAudioFactory();
    sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
    const ov = getOverlay(document);

    ov.querySelectorAll('.sc-tool')[2]._fire('click');
    await tick();
    ov.querySelector('.sc-music-usar')._fire('click');

    assert.equal(service.estado.musica.music_id, 'id-0');
    assert.equal(service.estado.musica.music_name, 'Faixa 0');
    assert.equal(service.estado.musica.genre, 'Pop');
    assert.equal(service.estado.musica.url, undefined);
    assert.equal(ov.querySelector('.sc-mix')?.hidden ?? true, tipo === 'imagem');
    assert.equal(FakeAudio.instances.length, 1);
    assert.equal(FakeAudio.instances[0].src, 'https://r2/0.m4a');
    assert.equal(FakeAudio.instances[0].playCount, 1);
  });
}

test('painel Audio do Video ajusta volumes locais e sincroniza play/pause', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  service.definirMedia({ file: { type: 'video/mp4', size: 10 }, tipo: 'video', origem: 'upload' });
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(1)) });
  const FakeAudio = FakeAudioFactory();
  sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');

  const video = ov.querySelector('.sc-preview').querySelector('video');
  const keep = ov.querySelector('.sc-mix-keep');
  const volVideo = ov.querySelector('.sc-mix-video');
  const volMusic = ov.querySelector('.sc-mix-music');
  const play = ov.querySelector('.sc-mix-play');
  const time = ov.querySelector('.sc-mix-time');

  volVideo.value = '80';
  volVideo._fire('input');
  volMusic.value = '40';
  volMusic._fire('input');

  assert.equal(service.estado.keepOriginalAudio, true);
  assert.equal(service.estado.videoVolume, 0.8);
  assert.equal(service.estado.musicVolume, 0.4);
  assert.equal(video.volume, 0.8);
  assert.equal(FakeAudio.instances[0].volume, 0.4);
  assert.equal(time.textContent, '00:00 / 00:30');

  keep.checked = false;
  keep._fire('change');
  assert.equal(service.estado.keepOriginalAudio, false);
  assert.equal(video.muted, true);
  assert.equal(video.volume, 0);
  assert.equal(volVideo.disabled, true);

  video.currentTime = 8;
  video.duration = 30;
  if (!video.paused) play._fire('click');
  assert.equal(video.paused, true);
  play._fire('click');
  assert.equal(video.paused, false);
  assert.equal(FakeAudio.instances[0].currentTime, 8);
  assert.equal(play.getAttribute('aria-label'), 'Pausar preview');

  video._fire('timeupdate');
  assert.equal(time.textContent, '00:08 / 00:30');

  play._fire('click');
  assert.equal(video.paused, true);
  assert.equal(FakeAudio.instances[0].paused, true);
  assert.equal(play.getAttribute('aria-label'), 'Tocar preview');
});

test('fechar mantem selecao e cancelar remove musica selecionada', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(1)) });
  const FakeAudio = FakeAudioFactory();
  sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
  let ov = getOverlay(document);

  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  ov.querySelector('.sc-close')._fire('click');

  assert.equal(service.estado.musica.music_id, 'id-0', 'fechar modal preserva a selecao no service');

  sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
  ov = getOverlay(document);
  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();
  assert.equal(ov.querySelector('.sc-music-item.is-sel')?.dataset.musicId, 'id-0', 'reabrir restaura selecao visual');
  ov.querySelector('.sc-music-usar')._fire('click');
  ov.querySelector('.sc-mix-remover')._fire('click');

  assert.equal(service.estado.musica, null, 'cancelar/remove limpa a selecao');
  assert.equal(service.estado.selectedMusic, null, 'snapshot seguro limpo');
  assert.equal(service.estado.previewMusic, null, 'preview seguro limpo');
  assert.equal(service.estado.previewDuration, 0, 'duracao de preview limpa');
  assert.equal(service.estado.musicGenre, null, 'genero limpo');
  assert.equal(ov.querySelector('.sc-mix').hidden, true);
});

test('abrir e fechar a modal 100 vezes nao deixa overlays presos', () => {
  const { sandbox, document } = criarSandbox();
  const started = Date.now();
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < 100; i += 1) {
    sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
    assert.ok(getOverlay(document));
    getOverlay(document).querySelector('.sc-close')._fire('click');
    assert.equal(getOverlay(document), null);
  }

  const elapsedMs = Date.now() - started;
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
  assert.ok(elapsedMs < 2000, `render/close 100x demorou ${elapsedMs}ms`);
  assert.ok(heapDeltaMb < 20, `crescimento de heap alto: ${heapDeltaMb.toFixed(2)}MB`);
});

test('filtro por gênero na modal reduz a lista', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(4)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);
  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();

  assert.equal(ov.querySelectorAll('.sc-music-item').length, 4, 'Todos');
  const chipRock = [...ov.querySelectorAll('.sc-music-genre')].find(c => c.dataset.genero === 'Rock');
  chipRock._fire('click');
  await tick();
  assert.equal(ov.querySelectorAll('.sc-music-item').length, 2, 'só Rock (2 de 4)');
});

test('Cancelar (Remover música) limpa a seleção e esconde o mix', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(2)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);
  ov.querySelectorAll('.sc-tool')[2]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  assert.ok(service.estado.musica, 'tem trilha');

  ov.querySelector('.sc-mix-remover')._fire('click');
  assert.equal(service.estado.musica, null, 'trilha removida');
  assert.equal(ov.querySelector('.sc-mix').hidden, true, 'mix escondido');
});

test('abrir/fechar 100x não vaza overlay no body (lifecycle limpo)', () => {
  const { sandbox, document } = criarSandbox();
  for (let i = 0; i < 100; i++) {
    const modal = sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
    assert.ok(getOverlay(document), 'abriu');
    modal.fechar();
    assert.equal(getOverlay(document), null, 'fechou sem deixar overlay');
  }
  // após 100 ciclos, o body não acumulou overlays
  assert.equal(document.body.querySelectorAll('.sc-overlay').length, 0, 'sem leak de overlays no body');
});

test('arrastar (1 ponteiro) move o overlay via serviço', () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service });
  const ov = getOverlay(document);

  const input = ov.querySelector('.sc-text-input');
  input.value = 'X';
  ov.querySelector('.sc-text-send')._fire('click');

  const item = ov.querySelector('.sc-overlay-item');
  const id = item.dataset.overlayId;
  const baseX = service.obterOverlay(id).posicao.x;
  const baseY = service.obterOverlay(id).posicao.y;

  item._fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  item._fire('pointermove', { pointerId: 1, clientX: 130, clientY: 140 });

  assert.equal(service.obterOverlay(id).posicao.x, baseX + 30);
  assert.equal(service.obterOverlay(id).posicao.y, baseY + 40);
});

test('Finalizar chama o callback onFinalizar com o estado', () => {
  const { sandbox, document } = criarSandbox();
  const onFinalizar = fn();
  const service = new sandbox.StoryEditorService();
  sandbox.StoryCreationModal.abrir({ service, onFinalizar });
  const ov = getOverlay(document);

  ov.querySelector('.sc-btn--primario')._fire('click');

  assert.equal(onFinalizar.calls.length, 1);
  assert.ok(onFinalizar.calls[0][0], 'recebe o snapshot do estado');
  assert.ok('overlays' in onFinalizar.calls[0][0]);
  assert.ok('musica' in onFinalizar.calls[0][0]);
  assert.equal(getOverlay(document), null, 'modal fecha após finalizar');
});

test('VideoCompressor.comprimir devolve o arquivo original quando nao ha suporte (fallback)', async () => {
  const { sandbox } = criarSandbox();
  const file = { type: 'video/mp4', size: 9999 };
  const out = await sandbox.VideoCompressor.comprimir(file, { maxSeconds: 30, targetBytes: 1.5 * 1024 * 1024 });
  assert.equal(out, file, 'sem MediaRecorder/canvas no sandbox → retorna o original (nao quebra)');
});

test('OverlayPainter.mapear converte px do preview e fonte (escala overlay x canvas)', () => {
  const { sandbox } = criarSandbox();
  const m = sandbox.OverlayPainter.mapear({ tipo: 'texto', conteudo: 'Oi', x: 10, y: 20, escala: 2 }, 2, 16);
  assert.equal(m.x, 20);
  assert.equal(m.y, 40);
  assert.equal(m.fontPx, 1.4 * 16 * 2 * 2); // rem texto * root * escala overlay * escala canvas
  assert.equal(m.tipo, 'texto');
  assert.equal(m.texto, 'Oi');

  const e = sandbox.OverlayPainter.mapear({ tipo: 'emoji', conteudo: '🔥', x: 0, y: 0, escala: 1 }, 1, 16);
  assert.equal(e.fontPx, 2.2 * 16); // rem emoji
  assert.equal(e.tipo, 'emoji');
});

test('StoryComposer.dimsCanvas preserva aspecto, limita maior lado e gera dimensoes pares', () => {
  const { sandbox } = criarSandbox();
  const retrato = sandbox.StoryComposer.dimsCanvas(9 / 16, 1080);
  assert.equal(retrato.h, 1080, 'retrato: maior lado = altura');
  assert.ok(retrato.w < retrato.h, 'retrato: largura < altura');
  assert.equal(retrato.w % 2, 0, 'largura par');
  assert.equal(retrato.h % 2, 0, 'altura par');

  const paisagem = sandbox.StoryComposer.dimsCanvas(16 / 9, 1080);
  assert.equal(paisagem.w, 1080, 'paisagem: maior lado = largura');
  assert.ok(paisagem.h < paisagem.w);
});

test('StoryComposer.modoAudio decide a faixa conforme a musica', () => {
  const { sandbox } = criarSandbox();
  const SC = sandbox.StoryComposer;
  assert.equal(SC.modoAudio({}), 'original', 'sem musica → original');
  assert.equal(SC.modoAudio({ musica: null }), 'original');
  assert.equal(SC.modoAudio({ musica: { id: 'm1' }, musicaSrc: null }), 'silencio', 'musica sem src → silencio');
  assert.equal(SC.modoAudio({ musica: { id: 'm1' }, musicaSrc: 'x.mp3' }), 'musica', 'musica com src → mixa');
});

test('StoryComposer.compor devolve o arquivo original quando nao ha suporte (video e imagem)', async () => {
  const { sandbox } = criarSandbox();
  const video = { type: 'video/mp4', size: 9999 };
  const img   = { type: 'image/jpeg', size: 9999 };
  assert.equal(await sandbox.StoryComposer.compor({ file: video, tipo: 'video' }), video);
  assert.equal(await sandbox.StoryComposer.compor({ file: img, tipo: 'imagem' }), img);
});

test('StoryComposer.compor nao reencoda video sem overlay visual', async () => {
  const { sandbox } = criarSandbox();
  const video = { type: 'video/mp4', size: 9999 };
  sandbox.MediaRecorder = function MediaRecorder() {};
  sandbox.HTMLCanvasElement = function HTMLCanvasElement() {};
  sandbox.HTMLCanvasElement.prototype.captureStream = () => ({ getTracks: () => [] });
  sandbox.URL = {
    createObjectURL() { throw new Error('nao deve criar blob url para video sem overlay'); },
    revokeObjectURL() {},
  };

  const out = await sandbox.StoryComposer.compor({ file: video, tipo: 'video', overlays: [] });

  assert.equal(out, video, 'sem texto/emoji, finalizacao usa o arquivo original rapidamente');
});

test('Finalizar queima/comprime e entrega o arquivo em media.file (com overlays no estado)', async () => {
  const { sandbox, document } = criarSandbox();
  const onFinalizar = fn();
  const service = new sandbox.StoryEditorService();
  service.definirMedia({ file: { type: 'video/mp4', size: 1234 }, tipo: 'video', origem: 'upload' });
  service.adicionarTexto('Promoção', { x: 10, y: 10, escala: 1 });

  sandbox.StoryCreationModal.abrir({ service, onFinalizar });
  const ov = getOverlay(document);

  ov.querySelector('.sc-btn--primario')._fire('click');
  await new Promise((r) => setTimeout(r, 0)); // espera o compor (assíncrono) resolver

  assert.equal(onFinalizar.calls.length, 1);
  const estado = onFinalizar.calls[0][0];
  assert.ok(estado.media && estado.media.file, 'entrega media.file pronto para upload');
  assert.equal(estado.media.file.type, 'video/mp4', 'sandbox sem suporte → arquivo original (fallback)');
  assert.equal(estado.overlays.length, 1, 'overlays presentes no estado');
  assert.equal(getOverlay(document), null, 'modal fecha após finalizar');
});

test('fechar pelo × remove a modal do body', () => {
  const { sandbox, document } = criarSandbox();
  const modal = sandbox.StoryCreationModal.abrir({ service: new sandbox.StoryEditorService() });
  assert.ok(getOverlay(document));
  getOverlay(document).querySelector('.sc-close')._fire('click');
  assert.equal(getOverlay(document), null, 'modal removida');
});
