'use strict';

// =============================================================
// StoryCreationModal.js — View do editor de Story (fullscreen).
//
// SOMENTE UI + interação local. Toda regra/estado fica no
// StoryEditorService (injetado). A view só renderiza e dispara
// ações. O botão "Finalizar" apenas chama onFinalizar(estado) —
// o motor (junção/áudio/upload) vem em prompt separado.
//
// Depende de: StoryEditorService (shared/js/StoryEditorService.js)
// CSS: shared/css/story-creation.css (prefixo sc-)
// =============================================================

/** Helper de criação de elemento (amigável a mocks de teste). */
function scEl(tag, opts = {}) {
  const n = document.createElement(tag);
  if (opts.class)       n.className   = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.type)        n.type        = opts.type;
  if (opts.accept)      n.accept      = opts.accept;
  if (opts.placeholder) n.placeholder = opts.placeholder;
  if (opts.attrs)   for (const [k, v] of Object.entries(opts.attrs))   n.setAttribute(k, v);
  if (opts.dataset) Object.assign(n.dataset, opts.dataset);
  if (opts.on)      for (const [ev, fn] of Object.entries(opts.on))    n.addEventListener(ev, fn);
  if (opts.children) for (const c of opts.children) if (c) n.appendChild(c);
  return n;
}

// ─────────────────────────────────────────────────────────────
// Fontes de mídia plugáveis (IMediaSource → obter())
// ─────────────────────────────────────────────────────────────

class MediaSourceArquivo {
  constructor({ accept, capture = null, origem }) {
    this._accept  = accept;
    this._capture = capture;
    this._origem  = origem;
  }
  /** @returns {Promise<{file, tipo:'video'|'imagem', origem}|null>} */
  obter() {
    return new Promise((resolve) => {
      const input = scEl('input', { type: 'file', accept: this._accept });
      if (this._capture) input.setAttribute('capture', this._capture);
      input.style.display = 'none';
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        try { input.remove(); } catch (_) { /* mock */ }
        if (!file) { resolve(null); return; }
        const tipo = String(file.type || '').startsWith('video') ? 'video' : 'imagem';
        resolve({ file, tipo, origem: this._origem });
      }, { once: true });
      (document.body || document.documentElement).appendChild(input);
      input.click();
    });
  }
}

class UploadMediaSource extends MediaSourceArquivo {
  constructor() { super({ accept: 'video/*,image/*', origem: 'upload' }); }
}

class CameraMediaSource extends MediaSourceArquivo {
  constructor() { super({ accept: 'video/*', capture: 'environment', origem: 'camera' }); }
}

// ─────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────

class StoryCreationModal {

  static #instancia = null;

  static EMOJIS = [
    '😀','😂','🥹','😍','😎','🤩','😉','😅','🙃','🤔',
    '🤙','👍','👏','🙌','💪','🙏','💈','✂️','🔥','✨',
    '💯','🎉','❤️','🧡','💛','💚','💙','💜','⭐','🌟',
    '💥','😱','😮','😢','🥰','😘','💕','👀','💇','🪒',
  ];

  #service;
  #onFinalizar;
  #overlayEl = null;
  #preview   = null;
  #vazio     = null;
  #caret     = null;
  #input     = null;
  #sendBtn   = null;
  #emojiSheet = null;
  #onKeydown = null;

  constructor(service, { onFinalizar } = {}) {
    this.#service     = service;
    this.#onFinalizar = typeof onFinalizar === 'function' ? onFinalizar : () => {};
  }

  /**
   * Abre a modal de criação de story.
   * @param {object} [opts]
   * @param {Function} [opts.onFinalizar] — recebe o estado do editor
   * @param {StoryEditorService} [opts.service] — injeção para teste
   * @returns {StoryCreationModal}
   */
  static abrir(opts = {}) {
    StoryCreationModal.#instancia?.fechar();
    const service = opts.service
      ?? (typeof StoryEditorService !== 'undefined' ? new StoryEditorService() : null);
    const modal = new StoryCreationModal(service, opts);
    modal.#montar();
    StoryCreationModal.#instancia = modal;
    return modal;
  }

  // ── Construção do DOM ──────────────────────────────────────

  #montar() {
    const overlay = scEl('div', { class: 'sc-overlay', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Criar story' } });

    const close = scEl('button', { class: 'sc-close', type: 'button', text: '×', attrs: { 'aria-label': 'Fechar' }, on: { click: () => this.fechar() } });

    // Menu lateral
    const sideMenu = scEl('div', { class: 'sc-side-menu', children: [
      this.#tool('⬆️', 'Upload', () => this.#escolherMidia(new UploadMediaSource())),
      this.#tool('📷', 'Câmera', () => this.#escolherMidia(new CameraMediaSource())),
      this.#tool('😊', 'Emoji',  () => this.#abrirEmojis()),
    ] });

    // Preview
    this.#vazio = scEl('div', { class: 'sc-preview-vazio', text: 'Escolha um vídeo ou foto para começar' });
    this.#caret = scEl('div', { class: 'sc-text-caret' });
    this.#caret.hidden = true;
    this.#preview = scEl('div', { class: 'sc-preview', children: [this.#vazio, this.#caret] });

    const stage = scEl('div', { class: 'sc-stage', children: [sideMenu, this.#preview] });

    // Barra de texto (abaixo do preview)
    this.#input = scEl('input', {
      class: 'sc-text-input', type: 'text',
      placeholder: 'Escreva algo…', attrs: { 'aria-label': 'Texto do story', maxlength: '60' },
      on: {
        focus: () => this.#mostrarCaret(true),
        blur:  () => this.#mostrarCaret(false),
        keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.#enviarTexto(); } },
        input: () => this.#atualizarSend(),
      },
    });
    this.#sendBtn = scEl('button', { class: 'sc-text-send', type: 'button', text: '➤', attrs: { 'aria-label': 'Adicionar texto' }, on: { click: () => this.#enviarTexto() } });
    this.#sendBtn.disabled = true;
    const textBar = scEl('div', { class: 'sc-text-bar', children: [
      scEl('div', { class: 'sc-text-wrap', children: [this.#input, this.#sendBtn] }),
    ] });

    // Ações inferiores
    const btnTexto = scEl('button', { class: 'sc-btn', type: 'button', text: 'Enviar texto', on: { click: () => this.#enviarTexto() } });
    const btnFinal = scEl('button', { class: 'sc-btn sc-btn--primario', type: 'button', text: 'Finalizar', on: { click: () => this.#finalizar() } });
    const bottom = scEl('div', { class: 'sc-bottom-actions', children: [btnTexto, btnFinal] });

    overlay.appendChild(close);
    overlay.appendChild(stage);
    overlay.appendChild(textBar);
    overlay.appendChild(bottom);

    // Fecha clicando no fundo escuro (fora do palco/barras)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.fechar(); });

    this.#onKeydown = (e) => { if (e.key === 'Escape') this.fechar(); };
    document.addEventListener('keydown', this.#onKeydown);

    (document.body || document.documentElement).appendChild(overlay);
    this.#overlayEl = overlay;
  }

  #tool(icone, label, onClick) {
    return scEl('button', { class: 'sc-tool', type: 'button', attrs: { 'aria-label': label }, on: { click: onClick }, children: [
      scEl('span', { text: icone }),
      scEl('span', { class: 'sc-tool-label', text: label }),
    ] });
  }

  // ── Mídia ──────────────────────────────────────────────────

  async #escolherMidia(source) {
    const midia = await source.obter();
    if (!midia) return;
    try {
      this.#service.definirMedia(midia);
    } catch (_) {
      return; // tipo inválido — ignorado silenciosamente nesta etapa de UI
    }
    this.#renderMidia();
  }

  #renderMidia() {
    const media = this.#service.media;
    if (!this.#preview) return;
    // Remove mídia e overlays anteriores (troca de mídia reseta overlays)
    [...(this.#preview.querySelectorAll?.('video, img, .sc-overlay-item') ?? [])].forEach(el => el.remove());
    if (this.#vazio) this.#vazio.hidden = true;
    if (!media) { if (this.#vazio) this.#vazio.hidden = false; return; }

    const url = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(media.file) : '';
    let el;
    if (media.tipo === 'video') {
      el = scEl('video', { attrs: { playsinline: '', preload: 'metadata', loop: '' } });
      el.muted = true;
      el.src = url;
      try { el.play?.(); } catch (_) { /* autoplay pode bloquear */ }
    } else {
      el = scEl('img', { attrs: { alt: '' } });
      el.src = url;
    }
    // Insere a mídia como primeiro filho (atrás dos overlays/caret)
    if (this.#preview.firstChild) this.#preview.insertBefore(el, this.#preview.firstChild);
    else this.#preview.appendChild(el);
  }

  // ── Texto ──────────────────────────────────────────────────

  #mostrarCaret(visivel) {
    if (this.#caret) this.#caret.hidden = !visivel;
  }

  #atualizarSend() {
    if (this.#sendBtn) this.#sendBtn.disabled = !String(this.#input?.value ?? '').trim();
  }

  #enviarTexto() {
    const valor = String(this.#input?.value ?? '').trim();
    if (!valor) return;
    const overlay = this.#service.adicionarTexto(valor, this.#posicaoInicial());
    this.#renderOverlay(overlay);
    if (this.#input) this.#input.value = '';
    this.#atualizarSend();
    this.#mostrarCaret(false);
  }

  // ── Emoji ──────────────────────────────────────────────────

  #abrirEmojis() {
    if (this.#emojiSheet) { this.#emojiSheet.hidden = false; return; }
    const sheet = scEl('div', { class: 'sc-emoji-sheet', attrs: { role: 'menu' } });
    StoryCreationModal.EMOJIS.forEach((emoji) => {
      sheet.appendChild(scEl('button', {
        class: 'sc-emoji-btn', type: 'button', text: emoji,
        dataset: { emoji }, on: { click: () => this.#escolherEmoji(emoji) },
      }));
    });
    this.#emojiSheet = sheet;
    this.#overlayEl.appendChild(sheet);
  }

  #escolherEmoji(emoji) {
    const overlay = this.#service.adicionarEmoji(emoji, this.#posicaoInicial());
    this.#renderOverlay(overlay);
    if (this.#emojiSheet) this.#emojiSheet.hidden = true;
  }

  // ── Render + gestos dos overlays ───────────────────────────

  #posicaoInicial() {
    const w = this.#preview?.clientWidth || 0;
    const h = this.#preview?.clientHeight || 0;
    return { x: Math.round(w * 0.5) - 20, y: Math.round(h * 0.5) - 20, escala: 1 };
  }

  #renderOverlay(overlay) {
    if (!overlay || !this.#preview) return;
    const el = overlay.render(document);
    if (!el) return;
    this.#preview.appendChild(el);
    this.#ativarGestos(el, overlay);
  }

  /** Arrastar (1 dedo) + pinça (2 dedos), Pointer Events nativos. */
  #ativarGestos(el, overlay) {
    const pts = new Map(); // pointerId -> { x, y }
    let drag = null;       // { x, y, baseX, baseY }
    let pinch = null;      // { dist, baseEscala }
    const svc = this.#service;

    const onDown = (e) => {
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, baseEscala: overlay.escala };
        drag = null;
      } else {
        drag = { x: e.clientX, y: e.clientY, baseX: overlay.posicao.x, baseY: overlay.posicao.y };
        pinch = null;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const escala = StoryEditorService.escalaPinca(pinch.dist, d, pinch.baseEscala);
        svc.redimensionarOverlay(overlay.id, escala);
      } else if (drag) {
        const p = pts.get(e.pointerId);
        const nx = drag.baseX + (p.x - drag.x);
        const ny = drag.baseY + (p.y - drag.y);
        svc.moverOverlay(overlay.id, this.#clamp(nx, 'w'), this.#clamp(ny, 'h'));
      }
      overlay.aplicarTransform(el);
    };

    const onUp = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) {
        const [p] = [...pts.values()];
        drag = { x: p.x, y: p.y, baseX: overlay.posicao.x, baseY: overlay.posicao.y };
      } else if (pts.size === 0) {
        drag = null;
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
  }

  #clamp(v, eixo) {
    const max = eixo === 'w' ? (this.#preview?.clientWidth || 0) : (this.#preview?.clientHeight || 0);
    if (!max) return v;
    return Math.min(max, Math.max(0, v));
  }

  // ── Finalizar / fechar ─────────────────────────────────────

  #finalizar() {
    this.#onFinalizar(this.#service.estado);
  }

  fechar() {
    if (this.#onKeydown) {
      document.removeEventListener('keydown', this.#onKeydown);
      this.#onKeydown = null;
    }
    try { this.#overlayEl?.remove(); } catch (_) { /* mock */ }
    this.#overlayEl = null;
    if (StoryCreationModal.#instancia === this) StoryCreationModal.#instancia = null;
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StoryCreationModal, UploadMediaSource, CameraMediaSource, MediaSourceArquivo };
}
