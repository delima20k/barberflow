'use strict';

// =============================================================
// StoryEditorService.js — Lógica e estado do editor de Story.
//
// SOMENTE estado em memória + regras. Não toca em upload, BFF,
// banco nem áudio (o "motor" vem em prompt separado). A view
// (StoryCreationModal) só renderiza e delega ações para cá.
//
// Arquitetura:
//   - IOverlay (contrato): tipo, posicao{x,y}, escala, conteudo,
//     mover(x,y), redimensionar(escala), render(docRef).
//   - OverlayBase implementa o contrato; TextoOverlay e EmojiOverlay
//     só especializam `tipo` e o `render()`. Adicionar um overlay novo
//     (figurinha, GIF) = nova subclasse, sem mexer no resto (Open/Closed).
//   - StoryEditorService guarda a mídia atual + a lista de overlays e
//     expõe métodos testáveis sem DOM.
//
// Carregado via <script> no browser; exporta via UMD para os testes.
// =============================================================

/**
 * Gera um id único para overlay. Usa crypto.randomUUID quando disponível.
 * @returns {string}
 */
function gerarIdOverlay() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* ambiente sem crypto */ }
  return `ov-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─────────────────────────────────────────────────────────────
// Contrato comum dos overlays (IOverlay) + base reutilizável
// ─────────────────────────────────────────────────────────────

class OverlayBase {

  /** @type {'texto'|'emoji'} — definido pela subclasse */
  static TIPO = 'base';

  /**
   * @param {string} conteudo
   * @param {object} [pos]
   * @param {number} [pos.x=0]
   * @param {number} [pos.y=0]
   * @param {number} [pos.escala=1]
   */
  constructor(conteudo, { x = 0, y = 0, escala = 1 } = {}) {
    this.id       = gerarIdOverlay();
    this.tipo     = this.constructor.TIPO;
    this.conteudo = String(conteudo ?? '');
    this.posicao  = { x: Number(x) || 0, y: Number(y) || 0 };
    this.escala   = OverlayBase.#normalizarEscala(escala);
  }

  /** Move o overlay para uma posição absoluta (px) dentro do preview. */
  mover(x, y) {
    this.posicao = { x: Number(x) || 0, y: Number(y) || 0 };
    return this;
  }

  /** Redimensiona (fator de escala da fonte/emoji). */
  redimensionar(escala) {
    this.escala = OverlayBase.#normalizarEscala(escala);
    return this;
  }

  /** Snapshot serializável (sem métodos). */
  paraJSON() {
    return {
      id: this.id,
      tipo: this.tipo,
      conteudo: this.conteudo,
      x: this.posicao.x,
      y: this.posicao.y,
      escala: this.escala,
    };
  }

  /**
   * Cria o nó DOM do overlay. `docRef` permite injetar um document
   * (browser real ou stub de teste). A subclasse define a aparência.
   * @param {Document} [docRef]
   * @returns {HTMLElement}
   */
  render(docRef = (typeof document !== 'undefined' ? document : null)) {
    if (!docRef) return null;
    const el = docRef.createElement('div');
    el.className = `sc-overlay-item sc-overlay-${this.tipo}`;
    el.dataset.overlayId = this.id;
    el.textContent = this.conteudo;
    this.aplicarTransform(el);
    return el;
  }

  /** Aplica posição + escala num nó já existente (reuso pela view). */
  aplicarTransform(el) {
    if (!el || !el.style) return;
    el.style.transform = `translate(${this.posicao.x}px, ${this.posicao.y}px) scale(${this.escala})`;
  }

  static #normalizarEscala(escala) {
    const n = Number(escala);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n;
  }
}

class TextoOverlay extends OverlayBase {
  static TIPO = 'texto';
}

class EmojiOverlay extends OverlayBase {
  static TIPO = 'emoji';
}

// ─────────────────────────────────────────────────────────────
// Serviço — estado do editor
// ─────────────────────────────────────────────────────────────

class StoryEditorService {

  static TIPOS_ACEITOS = ['video', 'image'];
  static ESCALA_MIN = 0.3;
  static ESCALA_MAX = 6;

  #media       = null;   // { file, tipo:'video'|'imagem', origem:'upload'|'camera' }
  #overlays    = [];     // OverlayBase[]
  #musica      = null;   // { id, titulo, artista } | null — trilha escolhida
  #musicaEstado = StoryEditorService.#estadoMusicaPadrao();
  #audioMix    = StoryEditorService.#mixPadrao(); // mix de áudio do story final
  #maxOverlays = 20;

  static #mixPadrao() {
    return { manterOriginal: true, volumeVideo: 1, volumeMusica: 0.7 };
  }

  static #estadoMusicaPadrao() {
    return { selectedMusic: null, previewMusic: null, previewDuration: 0, musicGenre: null };
  }

  static #clampVol(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxOverlays=20]
   */
  constructor({ maxOverlays = 20 } = {}) {
    this.#maxOverlays = Number(maxOverlays) > 0 ? Number(maxOverlays) : 20;
  }

  // ── Mídia ──────────────────────────────────────────────────

  /**
   * Define a mídia atual. Trocar de mídia RESETA os overlays.
   * @param {{ file: File, tipo: 'video'|'imagem', origem: 'upload'|'camera' }} media
   * @returns {{ file, tipo, origem }}
   */
  definirMedia(media) {
    if (!media || !media.file) throw new Error('Mídia inválida: file ausente.');
    StoryEditorService.validarArquivo(media.file);
    const tipo = media.tipo
      || (String(media.file.type || '').startsWith('video') ? 'video' : 'imagem');
    const origem = media.origem === 'camera' ? 'camera' : 'upload';
    this.#media = { file: media.file, tipo, origem };
    this.#overlays = []; // troca de mídia limpa os overlays
    return this.#media;
  }

  get media() {
    return this.#media ? { ...this.#media } : null;
  }

  // ── Overlays ───────────────────────────────────────────────

  /** @returns {TextoOverlay} */
  adicionarTexto(conteudo, pos) {
    return this.#adicionar(new TextoOverlay(conteudo, pos));
  }

  /** @returns {EmojiOverlay} */
  adicionarEmoji(conteudo, pos) {
    return this.#adicionar(new EmojiOverlay(conteudo, pos));
  }

  #adicionar(overlay) {
    if (this.#overlays.length >= this.#maxOverlays) {
      throw new Error(`Limite de ${this.#maxOverlays} overlays atingido.`);
    }
    this.#overlays.push(overlay);
    return overlay;
  }

  /** @returns {OverlayBase|null} */
  obterOverlay(id) {
    return this.#overlays.find(o => o.id === id) ?? null;
  }

  moverOverlay(id, x, y) {
    const o = this.obterOverlay(id);
    if (o) o.mover(x, y);
    return o;
  }

  redimensionarOverlay(id, escala) {
    const o = this.obterOverlay(id);
    if (!o) return null;
    const limitada = Math.min(
      StoryEditorService.ESCALA_MAX,
      Math.max(StoryEditorService.ESCALA_MIN, Number(escala) || o.escala),
    );
    o.redimensionar(limitada);
    return o;
  }

  removerOverlay(id) {
    const antes = this.#overlays.length;
    this.#overlays = this.#overlays.filter(o => o.id !== id);
    return this.#overlays.length < antes;
  }

  get overlays() {
    return [...this.#overlays];
  }

  // ── Música (trilha do vídeo) ───────────────────────────────

  /**
   * Define a trilha escolhida. Guarda APENAS a referência (4 campos) —
   * nunca áudio/URL. A validação/sanitização fica no MusicRepository.
   * Aceita a forma de referência ou a forma antiga {id,titulo} (compat).
   * @param {{ music_id, music_name, music_duration, genre }|null} musica
   */
  definirMusica(musica) {
    if (!musica) { this.removerMusica(); return null; }
    this.#musica = {
      music_id: String(musica.music_id ?? musica.id ?? ''),
      music_name: String(musica.music_name ?? musica.titulo ?? ''),
      music_duration: Number(musica.music_duration ?? musica.duration) || 0,
      genre: String(musica.genre ?? ''),
    };
    this.#musicaEstado = StoryEditorService.#snapshotMusica(this.#musica);
    return this.#musica;
  }

  removerMusica() {
    this.#musica = null;
    this.#musicaEstado = StoryEditorService.#estadoMusicaPadrao();
  }

  get musica() {
    return this.#musica ? { ...this.#musica } : null;
  }

  get musicaEstado() {
    return StoryEditorService.#cloneEstadoMusica(this.#musicaEstado);
  }

  // ── Mix de áudio (preview/queima final) ────────────────────

  /**
   * Define o mix de áudio do story final.
   *  - manterOriginal=false → remove o áudio original do vídeo.
   *  - volumeVideo / volumeMusica em 0..1.
   * @param {{ manterOriginal?: boolean, volumeVideo?: number, volumeMusica?: number }} parcial
   */
  definirMixAudio(parcial = {}) {
    const atual = this.#audioMix;
    const manterOriginal = parcial.manterOriginal !== undefined
      ? parcial.manterOriginal
      : parcial.keepOriginalAudio;
    const volumeVideo = parcial.volumeVideo !== undefined ? parcial.volumeVideo : parcial.videoVolume;
    const volumeMusica = parcial.volumeMusica !== undefined ? parcial.volumeMusica : parcial.musicVolume;
    this.#audioMix = {
      manterOriginal: manterOriginal === undefined ? atual.manterOriginal : !!manterOriginal,
      volumeVideo: StoryEditorService.#clampVol(volumeVideo, atual.volumeVideo),
      volumeMusica: StoryEditorService.#clampVol(volumeMusica, atual.volumeMusica),
    };
    return { ...this.#audioMix };
  }

  get audioMix() {
    return { ...this.#audioMix };
  }

  // ── Estado / reset ─────────────────────────────────────────

  /** Limpa mídia, overlays, música e mix. */
  resetar() {
    this.#media = null;
    this.#overlays = [];
    this.removerMusica();
    this.#audioMix = StoryEditorService.#mixPadrao();
  }

  /** Snapshot imutável do estado (mídia + overlays + música + mix). */
  get estado() {
    return {
      media: this.media,
      overlays: this.#overlays.map(o => o.paraJSON()),
      musica: this.musica,
      ...this.musicaEstado,
      audioMix: this.audioMix,
      keepOriginalAudio: this.#audioMix.manterOriginal,
      videoVolume: this.#audioMix.volumeVideo,
      musicVolume: this.#audioMix.volumeMusica,
    };
  }

  static #snapshotMusica(ref) {
    const segura = ref ? {
      music_id: String(ref.music_id ?? ''),
      music_name: String(ref.music_name ?? ''),
      music_duration: Number(ref.music_duration) || 0,
      genre: String(ref.genre ?? ''),
    } : null;
    const previewDuration = segura
      ? Math.min(30, Math.max(0, Number(segura.music_duration) || 0))
      : 0;
    return {
      selectedMusic: segura ? { ...segura } : null,
      previewMusic: segura ? { ...segura } : null,
      previewDuration,
      musicGenre: segura?.genre ?? null,
    };
  }

  static #cloneEstadoMusica(estado) {
    return {
      selectedMusic: estado.selectedMusic ? { ...estado.selectedMusic } : null,
      previewMusic: estado.previewMusic ? { ...estado.previewMusic } : null,
      previewDuration: estado.previewDuration,
      musicGenre: estado.musicGenre ?? null,
    };
  }

  // ── Regras puras (testáveis sem DOM) ───────────────────────

  /**
   * Valida o tipo do arquivo (vídeo ou imagem). Lança em caso inválido.
   * @param {{ type?: string }} file
   */
  static validarArquivo(file) {
    const mime = String(file?.type || '');
    const base = mime.split('/')[0];
    if (!StoryEditorService.TIPOS_ACEITOS.includes(base)) {
      throw new Error(`Tipo de arquivo não suportado: "${mime || 'desconhecido'}".`);
    }
    return true;
  }

  /**
   * Calcula a escala da pinça a partir da razão de distâncias entre os dedos.
   * Puro — isolado da view para ser testável.
   * @param {number} distInicial
   * @param {number} distAtual
   * @param {number} escalaBase
   * @param {{ min?: number, max?: number }} [limites]
   * @returns {number}
   */
  static escalaPinca(distInicial, distAtual, escalaBase, { min = StoryEditorService.ESCALA_MIN, max = StoryEditorService.ESCALA_MAX } = {}) {
    const base = Number(escalaBase) > 0 ? Number(escalaBase) : 1;
    const di = Number(distInicial);
    const da = Number(distAtual);
    if (!Number.isFinite(di) || di <= 0 || !Number.isFinite(da) || da <= 0) return base;
    const escala = base * (da / di);
    return Math.min(max, Math.max(min, escala));
  }
}

// UMD — testes via require(); ignorado no browser (module indefinido)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StoryEditorService, OverlayBase, TextoOverlay, EmojiOverlay, gerarIdOverlay };
}
