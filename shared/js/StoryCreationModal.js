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

// Câmera in-app: grava via getUserMedia + MediaRecorder e PARA SOZINHA aos 35s.
// Sem suporte (ou sem permissão) → cai no input nativo com capture.
class CameraMediaSource {
  static MAX_SECONDS = 30;
  obter() {
    const semSuporte = typeof navigator === 'undefined'
      || !navigator.mediaDevices
      || typeof navigator.mediaDevices.getUserMedia !== 'function'
      || typeof MediaRecorder === 'undefined';
    if (semSuporte) {
      return new MediaSourceArquivo({ accept: 'video/*', capture: 'environment', origem: 'camera' }).obter();
    }
    return CameraRecorder.gravar(CameraMediaSource.MAX_SECONDS);
  }
}

// Gravador de vídeo na própria modal, com limite de tempo (auto-stop).
class CameraRecorder {
  static async gravar(maxSeconds = 35) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
    } catch (_) {
      return null; // permissão negada / sem câmera
    }

    return new Promise((resolve) => {
      const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
        .find(t => { try { return MediaRecorder.isTypeSupported?.(t); } catch (_) { return false; } }) || '';

      let recorder = null;
      let chunks = [];
      let gravando = false;
      let timerInt = null;
      let autoStop = null;

      const live = scEl('video', { class: 'sc-camera-live', attrs: { playsinline: '', autoplay: '' } });
      live.muted = true;
      try { live.srcObject = stream; } catch (_) {}
      try { live.play?.(); } catch (_) {}

      const timer  = scEl('div', { class: 'sc-camera-timer', text: `0s / ${maxSeconds}s` });
      const recBtn = scEl('button', { class: 'sc-camera-rec', type: 'button', attrs: { 'aria-label': 'Gravar' } });
      const close  = scEl('button', { class: 'sc-camera-close', type: 'button', text: '×', attrs: { 'aria-label': 'Fechar' } });
      const overlay = scEl('div', { class: 'sc-camera', attrs: { role: 'dialog', 'aria-label': 'Gravar vídeo' },
        children: [live, timer, recBtn, close] });

      const limpar = () => {
        try { clearInterval(timerInt); } catch (_) {}
        try { clearTimeout(autoStop); } catch (_) {}
        try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
        try { overlay.remove(); } catch (_) {}
      };

      const finalizar = (blob) => {
        limpar();
        if (!blob || !blob.size) { resolve(null); return; }
        const ext  = mime.includes('mp4') ? 'mp4' : 'webm';
        const tipo = mime || (ext === 'mp4' ? 'video/mp4' : 'video/webm');
        const file = new File([blob], `camera-${Date.now()}.${ext}`, { type: tipo });
        resolve({ file, tipo: 'video', origem: 'camera' });
      };

      const parar = () => {
        try { clearInterval(timerInt); } catch (_) {}
        try { clearTimeout(autoStop); } catch (_) {}
        if (recorder && recorder.state === 'recording') recorder.stop(); // → onstop → finalizar
      };

      const iniciar = () => {
        chunks = [];
        try {
          recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        } catch (_) {
          recorder = new MediaRecorder(stream);
        }
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = () => finalizar(new Blob(chunks, { type: mime || 'video/webm' }));
        recorder.start();
        gravando = true;
        recBtn.classList.add('is-rec');
        let s = 0;
        timer.textContent = `0s / ${maxSeconds}s`;
        timerInt = setInterval(() => {
          s += 1;
          timer.textContent = `${s}s / ${maxSeconds}s`;
        }, 1000);
        // Para sozinha ao atingir o limite (35s).
        autoStop = setTimeout(() => parar(), maxSeconds * 1000);
      };

      recBtn.addEventListener('click', () => { gravando ? parar() : iniciar(); });
      close.addEventListener('click', () => { limpar(); resolve(null); });

      (document.body || document.documentElement).appendChild(overlay);
    });
  }
}

// Compressão de vídeo no NAVEGADOR (antes de subir): corta para no máximo
// `maxSeconds` e mira em ~`targetBytes` reduzindo resolução + bitrate.
// É a única forma confiável no Vercel (a função tem limite de corpo ~4.5MB).
// Qualquer falha/sem suporte → devolve o arquivo original (não quebra o upload).
class VideoCompressor {
  static async comprimir(file, { maxSeconds = 30, targetBytes = 1.5 * 1024 * 1024, maxLado = 540 } = {}) {
    const semSuporte = typeof document === 'undefined'
      || typeof MediaRecorder === 'undefined'
      || typeof HTMLCanvasElement === 'undefined'
      || !HTMLCanvasElement.prototype.captureStream
      || typeof URL === 'undefined' || !URL.createObjectURL;
    if (semSuporte || !file || !String(file.type || '').startsWith('video')) return file;

    let url = null;
    let audioCtx = null;
    let stream = null;
    let video = null;
    try {
      url = URL.createObjectURL(file);
      video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      await new Promise((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error('metadata'));
      });

      const dur  = Number(video.duration) || 0;
      const segs = Math.min(dur > 0 ? dur : maxSeconds, maxSeconds);

      // Já curto e pequeno → não recomprime.
      if (file.size <= targetBytes && dur > 0 && dur <= maxSeconds) {
        URL.revokeObjectURL(url);
        return file;
      }

      const vw = video.videoWidth || maxLado;
      const vh = video.videoHeight || maxLado;
      const escala = Math.min(1, maxLado / Math.max(vw, vh));
      const cw = Math.max(2, Math.round((vw * escala) / 2) * 2);
      const ch = Math.max(2, Math.round((vh * escala) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');

      stream = canvas.captureStream(30);

      // Áudio capturado SEM tocar no alto-falante (Web Audio → destino de stream).
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          audioCtx = new AC();
          const srcNode = audioCtx.createMediaElementSource(video);
          const dest = audioCtx.createMediaStreamDestination();
          srcNode.connect(dest);
          const at = dest.stream.getAudioTracks()[0];
          if (at) stream.addTrack(at);
        }
      } catch (_) { /* sem áudio se não der */ }

      const audioBps = 64000;
      const videoBps = Math.max(180000, Math.floor((targetBytes * 8 / Math.max(1, segs)) * 0.85) - audioBps);
      const mime = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
        .find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; } }) || '';

      const chunks = [];
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: videoBps,
        audioBitsPerSecond: audioBps,
      });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const fim = new Promise((resolve) => { rec.onstop = resolve; });

      let parou = false;
      const desenhar = () => {
        if (parou) return;
        try { ctx.drawImage(video, 0, 0, cw, ch); } catch (_) {}
        requestAnimationFrame(desenhar);
      };
      const parar = () => {
        if (parou) return;
        parou = true;
        try { if (rec.state === 'recording') rec.stop(); } catch (_) {}
      };

      rec.start();
      try { await audioCtx?.resume?.(); } catch (_) {}
      await video.play();
      desenhar();
      video.onended = parar;
      const timer = setTimeout(parar, segs * 1000 + 200);

      await fim;
      clearTimeout(timer);
      try { video.pause(); } catch (_) {}
      try { stream.getTracks().forEach(t => t.stop()); } catch (_) {}
      try { await audioCtx?.close?.(); } catch (_) {}
      URL.revokeObjectURL(url);

      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      if (!blob.size) return file; // não gerou nada → original
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      return new File([blob], `story-${Date.now()}.${ext}`, { type: blob.type });
    } catch (_) {
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
      try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
      try { await audioCtx?.close?.(); } catch (_) {}
      return file; // qualquer erro → original (não quebra o upload)
    }
  }
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

  // Catálogo placeholder — o catálogo real / mix de áudio vem no "motor".
  static MUSICAS = [
    { id: 'm1', titulo: 'Batida Urban',  artista: 'BarberFlow' },
    { id: 'm2', titulo: 'Lo-fi Chill',   artista: 'BarberFlow' },
    { id: 'm3', titulo: 'Trap Fade',     artista: 'BarberFlow' },
    { id: 'm4', titulo: 'Samba Groove',  artista: 'BarberFlow' },
    { id: 'm5', titulo: 'Funk do Corte', artista: 'BarberFlow' },
    { id: 'm6', titulo: 'Reggae Roots',  artista: 'BarberFlow' },
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
  #musicSheet = null;
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
      this.#tool('🎵', 'Música', () => this.#abrirMusicas()),
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

    let file = midia.file;
    // Vídeo: comprime no navegador ANTES de subir — corta para 30s e mira ~1.5MB.
    if (midia.tipo === 'video') {
      this.#mostrarProcessando(true);
      try {
        file = await VideoCompressor.comprimir(midia.file, { maxSeconds: 30, targetBytes: 1.5 * 1024 * 1024 });
      } catch (_) {
        file = midia.file; // falhou → original
      } finally {
        this.#mostrarProcessando(false);
      }
    }

    try {
      this.#service.definirMedia({ ...midia, file });
    } catch (_) {
      return; // tipo inválido — ignorado silenciosamente nesta etapa de UI
    }
    this.#renderMidia();
  }

  #mostrarProcessando(ativo) {
    if (!this.#vazio) return;
    if (ativo) {
      this.#vazio.textContent = 'Comprimindo vídeo…';
      this.#vazio.hidden = false;
    } else {
      this.#vazio.textContent = 'Escolha um vídeo ou foto para começar';
    }
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
      el = scEl('video', { attrs: { playsinline: '', preload: 'auto', loop: '' } });
      // Com áudio: a seleção do arquivo é um gesto do usuário, então o play
      // com som é permitido. Se o navegador bloquear, o catch ignora.
      el.muted = false;
      el.src = url;
      try { const p = el.play?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
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

  // ── Música ─────────────────────────────────────────────────

  #abrirMusicas() {
    if (this.#musicSheet) { this.#musicSheet.hidden = false; return; }
    const sheet = scEl('div', { class: 'sc-music-sheet', attrs: { role: 'menu' } });
    sheet.appendChild(scEl('div', { class: 'sc-music-title', text: 'Adicionar música' }));
    StoryCreationModal.MUSICAS.forEach((m) => {
      sheet.appendChild(scEl('button', {
        class: 'sc-music-item', type: 'button', dataset: { musicId: m.id },
        on: { click: () => this.#escolherMusica(m) },
        children: [
          scEl('span', { class: 'sc-music-nome', text: m.titulo }),
          scEl('span', { class: 'sc-music-artista', text: m.artista }),
        ],
      }));
    });
    this.#musicSheet = sheet;
    this.#overlayEl.appendChild(sheet);
  }

  #escolherMusica(m) {
    this.#service.definirMusica(m);
    if (this.#musicSheet) {
      [...(this.#musicSheet.querySelectorAll?.('.sc-music-item') ?? [])].forEach(b =>
        b.classList.toggle('is-sel', b.dataset.musicId === m.id));
      this.#musicSheet.hidden = true;
    }
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

  async #finalizar() {
    const r = this.#onFinalizar(this.#service.estado);
    if (r && typeof r.then === 'function') { try { await r; } catch (_) { /* erro tratado pelo caller */ } }
    this.fechar();
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
  module.exports = { StoryCreationModal, UploadMediaSource, CameraMediaSource, CameraRecorder, VideoCompressor, MediaSourceArquivo };
}
