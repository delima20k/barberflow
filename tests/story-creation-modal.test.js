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
    _children: [], parentNode: null, dataset: {}, style: { setProperty(k, v) { this[k] = v; } }, attributes: {},
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
  const sandbox = vm.createContext({ document, window: {}, console, setTimeout, clearTimeout });
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
  carregar(sandbox, 'shared/js/MusicCreditsService.js');
  carregar(sandbox, 'shared/js/MusicCopyrightOverlay.js');
  carregar(sandbox, 'shared/js/PreviewMusicController.js');
  carregar(sandbox, 'shared/js/StoryCreationModal.js');
  return { sandbox, document };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const waitCredits = () => new Promise((r) => setTimeout(r, 70));

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
  assert.ok(ov.querySelector('.sc-preview-top-tools'), 'tem ferramentas do preview');
  assert.ok(ov.querySelector('.sc-media-btns'), 'tem botoes de midia');
  assert.ok(ov.querySelector('.sc-text-bar'), 'tem a barra de texto abaixo do preview');
  assert.equal(ov.querySelectorAll('.sc-preview-ptool').length, 3, 'ferramentas: musica, emoji, frases');
  assert.equal(ov.querySelectorAll('.sc-media-btn').length, 2, 'midia: upload e camera');
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
  ov.querySelectorAll('.sc-preview-ptool')[1]._fire('click'); // Emoji
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

test('sc-stage: abrir um modal fecha o outro automaticamente (emoji ↔ música)', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  service.definirMedia({ file: { type: 'video/mp4', size: 10 }, tipo: 'video', origem: 'upload' });
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(3)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  // Abre emoji
  ov.querySelectorAll('.sc-preview-ptool')[1]._fire('click'); // Emoji
  const emoji = ov.querySelector('.sc-emoji-sheet');
  assert.equal(emoji.hidden, false, 'emoji aberto');

  // Abre música → o emoji aberto deve fechar sozinho
  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click'); // Musica
  await tick();
  const music = ov.querySelector('.sc-music-sheet');
  assert.equal(music.hidden, false, 'música aberta');
  assert.equal(emoji.hidden, true, 'emoji fechou automaticamente ao abrir música');

  // Reabre emoji → a música aberta deve fechar sozinha
  ov.querySelectorAll('.sc-preview-ptool')[1]._fire('click'); // Emoji
  assert.equal(emoji.hidden, false, 'emoji reaberto');
  assert.equal(music.hidden, true, 'música fechou automaticamente ao reabrir emoji');
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

  ov.querySelectorAll('.sc-preview-ptool')[1]._fire('click');
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
  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click'); // Musica
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

test('clicar + renderiza creditos de musica no palco sem duplicar overlay', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(2)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  await waitCredits();

  const creditos = ov.querySelector('.sc-music-copyright-overlay');
  assert.ok(creditos, 'creditos aparecem ao usar musica');
  assert.equal(creditos.parentNode.className, 'sc-preview', 'overlay fica sobre a midia, no rodape do preview');
  assert.match(creditos.textContent, /Faixa 0/);
  assert.match(creditos.textContent, /Autor\/Artista:\nArtista/);

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();
  ov.querySelectorAll('.sc-music-usar')[1]._fire('click');
  await waitCredits();

  assert.equal(ov.querySelectorAll('.sc-music-copyright-overlay').length, 1, 'nao duplica overlay');
  assert.match(ov.querySelector('.sc-music-copyright-overlay').textContent, /Faixa 1/);
});

test('trocar midia mantem creditos e cancelar musica remove overlay', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(1)) });
  sandbox.URL = { createObjectURL: () => 'blob:image', revokeObjectURL: () => {} };
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  await waitCredits();
  const node = ov.querySelector('.sc-music-copyright-overlay');

  ov.querySelectorAll('.sc-media-btn')[0]._fire('click');
  const input = [...document.body.querySelectorAll('input')].find(el => el.type === 'file');
  input.files = [{ type: 'image/jpeg', size: 1024 }];
  input._fire('change');
  await tick();

  assert.equal(ov.querySelector('.sc-music-copyright-overlay'), node, 'trocar midia preserva o mesmo overlay');
  assert.equal(node.parentNode.className, 'sc-preview', 'trocar midia mantem creditos sobre a midia');

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  ov.querySelector('.sc-mix-remover')._fire('click');

  assert.equal(ov.querySelector('.sc-music-copyright-overlay'), null, 'cancelar/remove limpa creditos');
});

test('Finalizar passa os créditos de direitos autorais (faixa com artista) para o compor', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  service.definirMedia({ file: { type: 'image/jpeg', size: 1234 }, tipo: 'imagem', origem: 'upload' });
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(2)) });

  // Captura os opts passados ao compor (sem realmente compor).
  let capturado = null;
  const origCompor = sandbox.StoryComposer.compor;
  sandbox.StoryComposer.compor = async (opts) => { capturado = opts; return opts.file; };

  try {
    sandbox.StoryCreationModal.abrir({ service, catalogo, onFinalizar: () => {} });
    const ov = getOverlay(document);

    // Seleciona a música (faixa crua tem artist/url).
    ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
    await tick();
    ov.querySelector('.sc-music-usar')._fire('click');
    await waitCredits();

    // Finaliza.
    ov.querySelector('.sc-btn--primario')._fire('click');
    await new Promise((r) => setTimeout(r, 0));

    assert.ok(capturado, 'compor foi chamado no finalizar');
    assert.equal(typeof capturado.creditos, 'string', 'créditos gerados a partir da faixa');
    assert.match(capturado.creditos, /Faixa 0/, 'crédito contém o título da faixa');
    assert.match(capturado.creditos, /Artista/, 'crédito contém o artista');
  } finally {
    sandbox.StoryComposer.compor = origCompor;
  }
});

test('botao fechar da musica esconde so a sheet interna e permite reabrir', async () => {
  const { sandbox, document } = criarSandbox();
  const service = new sandbox.StoryEditorService();
  const catalogo = new sandbox.MusicCatalogService({ api: stubApi(catalogoFixture(2)) });
  sandbox.StoryCreationModal.abrir({ service, catalogo });
  const ov = getOverlay(document);

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();

  const sheet = ov.querySelector('.sc-music-sheet');
  sheet.querySelector('.sc-music-close')._fire('click');

  assert.equal(sheet.hidden, true, 'botao fecha apenas a sheet de musica');
  assert.ok(getOverlay(document), 'modal principal continua aberta');

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');

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

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();

  const sheet = ov.querySelector('.sc-music-sheet');
  assert.equal(ov.querySelectorAll('.sc-music-item').length, 20, 'primeira pagina limita 20 itens');
  assert.ok(ov.querySelector('.sc-music-sentinel'), 'tem sentinel de scroll infinito');
  assert.equal(ov.querySelector('.sc-music-more'), null, 'nao usa botao carregar mais');

  sheet.scrollTop = 600;
  sheet.clientHeight = 400;
  sheet.scrollHeight = 980;
  ov.querySelector('.sc-music-list')._fire('scroll');
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

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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

    ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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

  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
  await tick();
  ov.querySelector('.sc-music-usar')._fire('click');
  ov.querySelector('.sc-close')._fire('click');

  assert.equal(service.estado.musica.music_id, 'id-0', 'fechar modal preserva a selecao no service');

  sandbox.StoryCreationModal.abrir({ service, catalogo, AudioCtor: FakeAudio });
  ov = getOverlay(document);
  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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
  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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
  ov.querySelectorAll('.sc-preview-ptool')[0]._fire('click');
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

test('OverlayPainter.desenhar quebra texto largo em várias linhas dentro do canvas (não vaza à direita)', () => {
  const { sandbox } = criarSandbox();
  const calls = [];
  const ctx = {
    canvas: { width: 360, height: 640 },
    save() {}, restore() {},
    measureText(t) { return { width: String(t).length * 10 }; }, // 10px por caractere
    fillText(t, x, y) { calls.push({ t, x, y }); },
    set font(_v) {}, get font() { return ''; },
    set fillStyle(_v) {}, set textBaseline(_v) {}, set textAlign(_v) {},
    set shadowColor(_v) {}, set shadowBlur(_v) {}, set shadowOffsetY(_v) {},
  };

  const textoLargo = Array(20).fill('palavra').join(' '); // muito maior que a largura
  sandbox.OverlayPainter.desenhar(ctx, [{ tipo: 'texto', conteudo: textoLargo, x: 0, y: 0, escala: 1 }], 1, 16);

  assert.ok(calls.length > 1, 'texto largo deve quebrar em múltiplas linhas');

  // contentMax = canvasW - (MARGIN + 2*PAD_X)*k = 360 - 22 = 338
  const contentMax = 360 - (10 + 2 * 6);
  for (const c of calls) {
    const larguraLinha = String(c.t).length * 10;
    assert.ok(larguraLinha <= contentMax + 1e-6, `linha não pode exceder a largura útil: "${c.t}"`);
    // x da linha começa no padding (6px) e o fim cabe dentro do canvas
    assert.ok(c.x + larguraLinha <= 360 + 1e-6, 'linha deve caber dentro do canvas (não vaza à direita)');
  }
});

test('OverlayPainter.desenhar respeita quebras explícitas (\\n) do preview', () => {
  const { sandbox } = criarSandbox();
  const calls = [];
  const ctx = {
    canvas: { width: 1000, height: 1778 }, // largo o suficiente p/ não quebrar por largura
    save() {}, restore() {},
    measureText(t) { return { width: String(t).length * 10 }; },
    fillText(t, x, y) { calls.push({ t, x, y }); },
    set font(_v) {}, get font() { return ''; },
    set fillStyle(_v) {}, set textBaseline(_v) {}, set textAlign(_v) {},
    set shadowColor(_v) {}, set shadowBlur(_v) {}, set shadowOffsetY(_v) {},
  };

  sandbox.OverlayPainter.desenhar(ctx, [{ tipo: 'texto', conteudo: 'linha1\nlinha2', x: 0, y: 0, escala: 1 }], 1, 16);

  assert.equal(calls.length, 2, 'duas linhas explícitas');
  assert.equal(calls[0].t, 'linha1');
  assert.equal(calls[1].t, 'linha2');
  assert.ok(calls[1].y > calls[0].y, 'segunda linha abaixo da primeira');
});

test('OverlayPainter.desenhar texto ampliado (escala>1) não vaza dos lados do vídeo', () => {
  const { sandbox } = criarSandbox();
  const calls = [];
  const ctx = {
    canvas: { width: 360, height: 640 },
    save() {}, restore() {},
    measureText(t) { return { width: String(t).length * 10 }; },
    fillText(t, x, y) { calls.push({ t, x, y }); },
    set font(_v) {}, get font() { return ''; },
    set fillStyle(_v) {}, set textBaseline(_v) {}, set textAlign(_v) {},
    set shadowColor(_v) {}, set shadowBlur(_v) {}, set shadowOffsetY(_v) {},
  };

  // Texto largo posicionado à direita do centro e ampliado (escala 3).
  const textoLargo = Array(40).fill('aa').join(' ');
  sandbox.OverlayPainter.desenhar(ctx, [{ tipo: 'texto', conteudo: textoLargo, x: 150, y: 50, escala: 3 }], 1, 16);

  assert.ok(calls.length > 1, 'texto ampliado deve quebrar para caber');
  const frameMax = 360 - (10 + 2 * 6); // 338
  for (const c of calls) {
    const w = String(c.t).length * 10;
    assert.ok(w <= frameMax + 1e-6, 'cada linha cabe na largura útil do quadro');
    assert.ok(c.x >= -1e-6, 'não vaza à esquerda');
    assert.ok(c.x + w <= 360 + 1e-6, 'não vaza à direita');
  }
});

test('OverlayPainter.desenharCreditos queima os direitos no rodapé (pequeno, fundo transparente, máx 2 linhas)', () => {
  const { sandbox } = criarSandbox();
  const calls = [];
  let bgFills = 0;
  const ctx = {
    canvas: { width: 360, height: 640 },
    save() {}, restore() {},
    measureText(t) { return { width: String(t).length * 10 }; },
    fillText(t, x, y) { calls.push({ t, x, y }); },
    // fundo transparente: nenhum retângulo deve ser desenhado
    beginPath() { bgFills++; }, moveTo() {}, arcTo() {}, closePath() {}, fill() { bgFills++; },
    set font(_v) {}, get font() { return ''; },
    set fillStyle(_v) {}, set textBaseline(_v) {}, set textAlign(_v) {},
    set shadowColor(_v) {}, set shadowBlur(_v) {}, set shadowOffsetY(_v) {},
  };

  const texto = '🎵 Música utilizada neste conteúdo: ' + Array(40).fill('direitos').join(' ');
  sandbox.OverlayPainter.desenharCreditos(ctx, texto, 1, 16);

  assert.ok(calls.length >= 1 && calls.length <= 2, 'créditos em no máximo 2 linhas');
  assert.equal(bgFills, 0, 'fundo transparente: não desenha caixa');
  for (const c of calls) assert.ok(c.y > 320, 'créditos ficam no rodapé do conteúdo');

  // Sem texto → não desenha nada.
  const antes = calls.length;
  sandbox.OverlayPainter.desenharCreditos(ctx, '', 1, 16);
  assert.equal(calls.length, antes, 'sem créditos não desenha');
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

test('StoryComposer.deveComporVideo reencoda quando ha musica mesmo sem overlay visual', () => {
  const { sandbox } = criarSandbox();
  const SC = sandbox.StoryComposer;

  assert.equal(SC.deveComporVideo({ overlays: [] }), false);
  assert.equal(SC.deveComporVideo({
    overlays: [],
    musica: { music_id: 'm1' },
    musicaSrc: 'https://r2/audio.m4a',
    audioMix: { manterOriginal: true, volumeVideo: 0.8, volumeMusica: 0.7 },
  }), true, 'musica escolhida precisa entrar no arquivo final');
  assert.equal(SC.deveComporVideo({
    overlays: [],
    musica: null,
    musicaSrc: null,
    audioMix: { manterOriginal: false },
  }), true, 'remover audio original tambem exige recomposicao');
});

test('StoryComposer.deveComporVideo comprime video cru grande (acima do alvo) mesmo sem edicao', () => {
  const { sandbox } = criarSandbox();
  const SC = sandbox.StoryComposer;
  const alvo = 1.6 * 1024 * 1024;

  // Vídeo cru do celular bem acima do alvo → deve comprimir.
  assert.equal(SC.deveComporVideo({
    overlays: [],
    file: { type: 'video/mp4', size: 25 * 1024 * 1024 },
    targetBytes: alvo,
  }), true, 'video cru grande precisa ser comprimido antes de subir');

  // Vídeo cru já pequeno (abaixo do alvo) → não vale o reencode em tempo real.
  assert.equal(SC.deveComporVideo({
    overlays: [],
    file: { type: 'video/mp4', size: 800 * 1024 },
    targetBytes: alvo,
  }), false, 'video pequeno nao precisa recomprimir');

  // Sem info de tamanho → mantém comportamento antigo (nao recomprime).
  assert.equal(SC.deveComporVideo({ overlays: [] }), false, 'sem file/size nao recomprime');
});

test('StoryComposer.deveComporImagemComMusica: imagem com música deve virar vídeo p/ tocar no viewer', () => {
  const { sandbox } = criarSandbox();
  const SC = sandbox.StoryComposer;

  // Imagem com música escolhida (com src) → compõe vídeo (música toca ao visualizar).
  assert.equal(SC.deveComporImagemComMusica({
    musica: { music_id: 'm1' },
    musicaSrc: 'https://r2/audio.m4a',
    audioMix: { manterOriginal: true, volumeMusica: 0.7 },
  }), true, 'imagem com música → vídeo');

  // Sem música → mantém imagem normal.
  assert.equal(SC.deveComporImagemComMusica({ musica: null, musicaSrc: null }), false);

  // Música escolhida mas SEM src ainda → não há áudio para tocar.
  assert.equal(SC.deveComporImagemComMusica({ musica: { music_id: 'm1' }, musicaSrc: null }), false);
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
