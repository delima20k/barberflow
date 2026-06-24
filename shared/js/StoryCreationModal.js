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

// ─────────────────────────────────────────────────────────────
// OverlayPainter — desenha os overlays (texto/emoji) num 2D context.
// Puro o suficiente para testar o mapeamento de coordenadas/fonte
// (preview px → canvas px) sem DOM. Reutilizado pelos caminhos de
// vídeo E imagem (DRY).
// ─────────────────────────────────────────────────────────────
class OverlayPainter {
  // rem das classes .sc-overlay-texto (1.4rem/800) e .sc-overlay-emoji (2.2rem)
  static REM_TEXTO = 1.4;
  static REM_EMOJI = 2.2;
  // Espelham o CSS de .sc-overlay-texto (px no preview, box-sizing: border-box):
  //   padding: 2px 6px; max-width: calc(100% - 10px); line-height ~1.2
  static PAD_X = 6;
  static PAD_Y = 2;
  static MARGIN = 10;
  static LINE_HEIGHT = 1.2;

  /**
   * Converte um overlay do estado (px do preview) para canvas.
   * @param {{tipo:string,conteudo:string,x:number,y:number,escala:number}} ov
   * @param {number} escalaCanvas  fator canvas.w / preview.w
   * @param {number} [rootFontPx=16]
   * @returns {{x:number,y:number,fontPx:number,esc:number,k:number,tipo:'texto'|'emoji',texto:string}}
   */
  static mapear(ov, escalaCanvas, rootFontPx = 16) {
    const k   = Number(escalaCanvas) > 0 ? Number(escalaCanvas) : 1;
    const esc = Number(ov?.escala)   > 0 ? Number(ov.escala)    : 1;
    const tipo = ov?.tipo === 'emoji' ? 'emoji' : 'texto';
    const rem  = tipo === 'emoji' ? OverlayPainter.REM_EMOJI : OverlayPainter.REM_TEXTO;
    return {
      x: (Number(ov?.x) || 0) * k,
      y: (Number(ov?.y) || 0) * k,
      fontPx: rem * rootFontPx * esc * k,
      esc,
      k,
      tipo,
      texto: String(ov?.conteudo ?? ''),
    };
  }

  /** Desenha todos os overlays no contexto 2D (texto branco c/ sombra; emoji grande). */
  static desenhar(ctx, overlays, escalaCanvas, rootFontPx = 16) {
    if (!ctx || !Array.isArray(overlays)) return;
    const canvasW = Number(ctx.canvas?.width) || 0;
    for (const ov of overlays) {
      const m = OverlayPainter.mapear(ov, escalaCanvas, rootFontPx);
      if (!m.texto || !(m.fontPx > 0)) continue;
      ctx.save();
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      if (m.tipo === 'emoji') {
        ctx.font = `${m.fontPx}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = m.fontPx * 0.08;
        OverlayPainter.#desenharEmoji(ctx, m);
      } else {
        ctx.font = `800 ${m.fontPx}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,.9)';
        ctx.shadowBlur = Math.max(2, m.fontPx * 0.12);
        ctx.shadowOffsetY = Math.max(1, m.fontPx * 0.03);
        OverlayPainter.#desenharTexto(ctx, m, canvasW);
      }
      ctx.restore();
    }
  }

  // Créditos/direitos autorais da música — queimados no RODAPÉ do conteúdo,
  // espelhando o preview (.sc-music-copyright-overlay): fundo escuro arredondado,
  // centralizado, fonte ~0.66rem, no máximo 2 linhas.
  static desenharCreditos(ctx, texto, escalaCanvas, rootFontPx = 16) {
    if (!ctx || !ctx.canvas) return;
    const txt = String(texto ?? '').replace(/\s+/g, ' ').trim();
    if (!txt) return;
    const k = Number(escalaCanvas) > 0 ? Number(escalaCanvas) : 1;
    const canvasW = Number(ctx.canvas.width) || 0;
    const canvasH = Number(ctx.canvas.height) || 0;
    if (!canvasW || !canvasH) return;

    const fontPx = 0.66 * rootFontPx * k;
    const padX = 8 * k, padY = 6 * k, bottom = 12 * k, radius = 8 * k;
    const lineH = fontPx * 1.25;
    const maxBoxW = canvasW * 0.9;
    const maxTextW = Math.max(1, maxBoxW - 2 * padX);

    ctx.save();
    ctx.font = `${fontPx}px sans-serif`;
    ctx.textBaseline = 'top';

    let linhas = OverlayPainter.#quebrarLinhas(ctx, txt, maxTextW);
    if (linhas.length > 2) {
      let l2 = linhas[1];
      while (l2 && ctx.measureText(l2 + '…').width > maxTextW) l2 = l2.slice(0, -1);
      linhas = [linhas[0], (l2 || '') + '…'];
    }

    let maxLineW = 0;
    for (const ln of linhas) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    const boxW = Math.min(maxBoxW, maxLineW + 2 * padX);
    const boxH = linhas.length * lineH + 2 * padY;
    const boxX = (canvasW - boxW) / 2;
    const boxY = canvasH - bottom - boxH;

    ctx.fillStyle = 'rgba(0,0,0,.54)';
    OverlayPainter.#roundRect(ctx, boxX, boxY, boxW, boxH, radius);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = Math.max(1, fontPx * 0.06);
    let y = boxY + padY;
    for (const ln of linhas) { try { ctx.fillText(ln, canvasW / 2, y); } catch (_) {} y += lineH; }
    ctx.restore();
  }

  static #roundRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Texto: quebra em múltiplas linhas (word-break) e SEMPRE cabe no quadro do
  // vídeo. O preview recorta o excesso (overflow:hidden); a composição não, então
  // limitamos a quebra à largura do quadro e reduzimos a fonte se uma palavra não
  // couber — assim o texto aparece inteiro no vídeo em produção.
  static #desenharTexto(ctx, m, canvasW) {
    const reservado = (OverlayPainter.MARGIN + 2 * OverlayPainter.PAD_X) * m.k;
    // Largura útil do QUADRO (limite físico do vídeo) — teto absoluto da quebra.
    const frameMax = Math.max(1, canvasW - reservado);
    // Até esc=1 respeita o preview; acima disso, mantém dentro do quadro.
    const contentMax = Math.min(frameMax, Math.max(1, (canvasW - reservado) * m.esc));

    // Reduz a fonte se a maior palavra não couber no quadro (texto muito grande).
    let fontPx = m.fontPx;
    ctx.font = `800 ${fontPx}px sans-serif`;
    let maiorPalavra = 0;
    for (const p of String(m.texto).split(/\s+/)) {
      const w = ctx.measureText(p).width;
      if (w > maiorPalavra) maiorPalavra = w;
    }
    if (maiorPalavra > frameMax) {
      fontPx = Math.max(1, fontPx * (frameMax / maiorPalavra));
      ctx.font = `800 ${fontPx}px sans-serif`;
    }

    // Escala efetiva (após eventual redução) p/ padding/offset coerentes.
    const escEf = m.esc * (fontPx / m.fontPx);
    const padX = OverlayPainter.PAD_X * escEf * m.k;
    const padY = OverlayPainter.PAD_Y * escEf * m.k;
    const lineHeight = fontPx * OverlayPainter.LINE_HEIGHT;

    const linhas = OverlayPainter.#quebrarLinhas(ctx, m.texto, contentMax);
    if (!linhas.length) return;

    let maxLineW = 0;
    for (const ln of linhas) maxLineW = Math.max(maxLineW, ctx.measureText(ln).width);
    const boxW = maxLineW + 2 * padX;
    const boxH = linhas.length * lineHeight + 2 * padY;

    // transform-origin: center → desloca o topo-esquerdo quando escEf ≠ 1.
    const offX = boxW * (1 - escEf) / (2 * escEf);
    const offY = boxH * (1 - escEf) / (2 * escEf);
    let left = m.x + offX + padX;
    let y = m.y + offY + padY;
    // Garante que o bloco não comece fora do quadro à esquerda nem vaze à direita.
    if (left < 0) left = padX;
    if (left + maxLineW > canvasW) left = Math.max(padX, canvasW - maxLineW - padX);
    for (const ln of linhas) {
      if (ln) { try { ctx.fillText(ln, left, y); } catch (_) {} }
      y += lineHeight;
    }
  }

  // Emoji: linha única (white-space: nowrap, sem padding), origem no centro.
  static #desenharEmoji(ctx, m) {
    const boxW = ctx.measureText(m.texto).width;
    const boxH = m.fontPx; // line-height: 1
    const offX = boxW * (1 - m.esc) / (2 * m.esc);
    const offY = boxH * (1 - m.esc) / (2 * m.esc);
    try { ctx.fillText(m.texto, m.x + offX, m.y + offY); } catch (_) {}
  }

  // Quebra preservando \n (white-space: pre-wrap) e quebrando palavras longas
  // (word-break: break-word) — igual ao preview.
  static #quebrarLinhas(ctx, texto, maxWidth) {
    const linhas = [];
    for (const paragrafo of String(texto).split('\n')) {
      if (paragrafo === '') { linhas.push(''); continue; }
      let linha = '';
      for (const palavra of paragrafo.split(' ')) {
        const tentativa = linha ? `${linha} ${palavra}` : palavra;
        if (ctx.measureText(tentativa).width <= maxWidth) {
          linha = tentativa;
          continue;
        }
        if (linha) { linhas.push(linha); linha = ''; }
        if (ctx.measureText(palavra).width > maxWidth) {
          const pedacos = OverlayPainter.#quebrarPalavra(ctx, palavra, maxWidth);
          for (let i = 0; i < pedacos.length - 1; i++) linhas.push(pedacos[i]);
          linha = pedacos[pedacos.length - 1] ?? '';
        } else {
          linha = palavra;
        }
      }
      linhas.push(linha);
    }
    return linhas;
  }

  static #quebrarPalavra(ctx, palavra, maxWidth) {
    const out = [];
    let atual = '';
    for (const ch of palavra) {
      const tentativa = atual + ch;
      if (atual && ctx.measureText(tentativa).width > maxWidth) {
        out.push(atual);
        atual = ch;
      } else {
        atual = tentativa;
      }
    }
    if (atual) out.push(atual);
    return out;
  }
}

// ─────────────────────────────────────────────────────────────
// StoryComposer — "queima" mídia + overlays num único arquivo no
// NAVEGADOR (antes de subir), comprimido a no máximo `targetBytes`.
//   • vídeo → canvas + MediaRecorder (corta em maxSeconds);
//   • imagem → canvas + toBlob (loop de qualidade);
//   • áudio condicional à música (ver modoAudio).
// Qualquer falha / sem suporte → devolve o arquivo original (não
// quebra o upload). Compressão única no Finalizar (sem encode duplo).
// ─────────────────────────────────────────────────────────────
class StoryComposer {
  static MAX_LADO_VIDEO = 1080;            // teto do maior lado do vídeo (mantém o máx. de resolução)
  static MAX_LADO_IMG   = 1080;            // teto inicial da imagem (cai em degraus p/ caber no alvo)
  static ORCAMENTO_VIDEO = 1.55 * 1024 * 1024; // folga sob o alvo de 1.6MB
  static ALVO_IMG = 500 * 1024;            // imagem: no máximo 500KB (melhor qualidade dentro disso)
  static AUDIO_BPS = 64000;
  static VIDEO_METADATA_TIMEOUT_MS = 8000;

  /**
   * Decide a faixa de áudio do story final.
   *  - sem música            → 'original' (preserva o áudio do vídeo)
   *  - música COM src        → 'musica'   (corta o original, mixa a música)
   *  - música SEM src ainda  → 'silencio' (corta o original; mixa quando houver src)
   * @returns {'original'|'musica'|'silencio'}
   */
  static modoAudio({ musica = null, musicaSrc = null } = {}) {
    if (!musica) return 'original';
    return musicaSrc ? 'musica' : 'silencio';
  }

  /**
   * Plano de mix do áudio final a partir do mix do editor.
   *  - usarOriginal/volVideo: faixa do vídeo (0..1); 0 se "remover áudio original".
   *  - usarMusica/volMusica: música escolhida (só se houver src).
   * Puro/testável.
   * @returns {{ usarOriginal: boolean, volVideo: number, usarMusica: boolean, volMusica: number }}
   */
  static planoAudio({ musica = null, musicaSrc = null, audioMix = null } = {}) {
    const mix = audioMix || {};
    const manter = mix.manterOriginal === undefined ? true : !!mix.manterOriginal;
    const clamp = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };
    const temMusica = !!musica && !!musicaSrc;
    return {
      usarOriginal: manter,
      volVideo: manter ? clamp(mix.volumeVideo, 1) : 0,
      usarMusica: temMusica,
      volMusica: temMusica ? clamp(mix.volumeMusica, 0.7) : 0,
    };
  }

  /**
   * Dimensões pares do canvas a partir do aspecto (w/h) e do maior lado
   * desejado. Guia o canvas pela RESOLUÇÃO da mídia (não pelos px do
   * preview), preservando o aspecto exibido — assim mantemos o máximo de
   * resolução possível.
   * @param {number} aspect     largura/altura
   * @param {number} ladoLongo  maior dimensão desejada (px)
   * @returns {{w:number,h:number}}
   */
  static dimsCanvas(aspect, ladoLongo) {
    const a = Number(aspect) > 0 ? Number(aspect) : (9 / 16);
    const L = Number(ladoLongo) > 0 ? Number(ladoLongo) : StoryComposer.MAX_LADO_VIDEO;
    let w, h;
    if (a <= 1) { h = L; w = L * a; }   // retrato → maior lado é a altura
    else        { w = L; h = L / a; }   // paisagem → maior lado é a largura
    const par = (n) => Math.max(2, Math.round(n / 2) * 2);
    return { w: par(w), h: par(h) };
  }

  static #suporta() {
    return typeof document !== 'undefined'
      && typeof MediaRecorder !== 'undefined'
      && typeof HTMLCanvasElement !== 'undefined'
      && !!HTMLCanvasElement.prototype.captureStream
      && typeof URL !== 'undefined' && !!URL.createObjectURL;
  }

  // Converte URL direta do R2 para o proxy BFF (que serve com CORS correto).
  // Garante que mesmo se o catálogo retornar URL R2, a composição usa BFF.
  static #toAudioProxyUrl(url) {
    if (!url) return url;
    try {
      const p = new URL(url);
      if (!/\.r2\.dev$/.test(p.hostname)) return url; // já é BFF ou outro — usa direto
      const key = p.pathname.replace(/^\/+/, '');
      if (!key.startsWith('stories/audio/')) return url;
      return `${BffApiService.baseUrl}/api/v1/media/stories/audio/source?key=${encodeURIComponent(key)}`;
    } catch (_) { return url; }
  }

  static #mime() {
    return ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      .find(t => { try { return MediaRecorder.isTypeSupported?.(t); } catch (_) { return false; } }) || '';
  }

  /**
   * Compõe o arquivo final (mídia + overlays) comprimido a ≤ targetBytes.
   * @param {object} opts
   * @returns {Promise<File>}
   */
  static async compor(opts = {}) {
    const { file } = opts;
    if (!file) return file;
    const tipo = opts.tipo
      || (String(file.type || '').startsWith('video') ? 'video' : 'imagem');
    if (!StoryComposer.#suporta()) return file; // fallback (ex.: sandbox de teste)

    if (tipo === 'imagem') {
      // Imagem COM música → compõe um vídeo curto (imagem estática + música) para
      // a música TOCAR ao visualizar o story (imagem pura não carrega faixa de áudio).
      if (StoryComposer.deveComporImagemComMusica(opts)) {
        try {
          const video = await StoryComposer.#comporImagemComMusica(opts);
          if (video) return video;
        } catch (_) { /* falhou → cai no caminho de imagem normal */ }
      }
      try { return await StoryComposer.#comporImagem(opts); } catch (_) { return file; }
    }

    if (!StoryComposer.deveComporVideo(opts)) return file;
    try { return await StoryComposer.#comporVideo(opts); } catch (_) { return file; }
  }

  /** true quando é imagem com música escolhida → deve virar vídeo p/ a música tocar. */
  static deveComporImagemComMusica(opts = {}) {
    const plano = StoryComposer.planoAudio({
      musica: opts.musica,
      musicaSrc: opts.musicaSrc,
      audioMix: opts.audioMix,
    });
    return !!(plano.usarMusica && opts.musicaSrc);
  }

  // ── Vídeo ───────────────────────────────────────────────────

  static #temOverlayVisual(overlays) {
    return Array.isArray(overlays) && overlays.some((ov) => {
      const tipo = String(ov?.tipo ?? '');
      return (tipo === 'texto' || tipo === 'emoji') && String(ov?.conteudo ?? '').trim();
    });
  }

  static deveComporVideo(opts = {}) {
    if (StoryComposer.#temOverlayVisual(opts.overlays)) return true;
    const plano = StoryComposer.planoAudio({
      musica: opts.musica,
      musicaSrc: opts.musicaSrc,
      audioMix: opts.audioMix,
    });
    if (plano.usarMusica || !plano.usarOriginal || plano.volVideo < 0.999) return true;
    // Sem edição: ainda comprime se o vídeo cru estourar o alvo. Evita subir o
    // original (dezenas de MB do celular) — o backend não recomprime no
    // serverless (worker BullMQ não roda na função Vercel).
    const alvo = Number(opts.targetBytes) || (1.6 * 1024 * 1024);
    const tamanho = Number(opts.file?.size) || 0;
    return tamanho > alvo;
  }

  static async #comporVideo(opts) {
    const targetBytes = Number(opts.targetBytes) || (1.6 * 1024 * 1024);
    const plano = StoryComposer.planoAudio({ musica: opts.musica, musicaSrc: opts.musicaSrc, audioMix: opts.audioMix });
    const base = {
      file:      opts.file,
      overlays:  Array.isArray(opts.overlays) ? opts.overlays : [],
      previewW:  Number(opts.previewW) || 0,
      previewH:  Number(opts.previewH) || 0,
      targetBytes,
      maxSeconds: Number(opts.maxSeconds) || 30,
      plano,
      musicaSrc: opts.musicaSrc || null,
      creditos: opts.creditos || null,
    };

    let blob = await StoryComposer.#gravarVideo({ ...base, fatorBitrate: 1 });
    // Re-encode de segurança (uma vez) só se estourar o alvo com folga.
    // O bitrate do MediaRecorder é só uma dica e estoura um pouco em vídeo com
    // movimento; regravar em tempo real por uma folga pequena dobraria o tempo à toa.
    if (blob && blob.size > targetBytes * 1.3) {
      const menor = await StoryComposer.#gravarVideo({ ...base, fatorBitrate: 0.6 });
      if (menor && menor.size) blob = menor;
    }
    if (!blob || !blob.size) return opts.file;
    const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], `story-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
  }

  static async #gravarVideo({ file, overlays, previewW, previewH, targetBytes, maxSeconds, plano, musicaSrc, creditos = null, fatorBitrate = 1 }) {
    let url = null, audioCtx = null, stream = null, video = null, musicaEl = null, raf = null, timer = null;
    const limpar = () => {
      try { if (raf) cancelAnimationFrame(raf); } catch (_) {}
      try { clearTimeout(timer); } catch (_) {}
      try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
      try { video?.pause(); } catch (_) {}
      try { musicaEl?.stop?.(); } catch (_) {}
      try { audioCtx?.close?.(); } catch (_) {}
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
    };

    try {
      const p = plano || { usarOriginal: true, volVideo: 1, usarMusica: false, volMusica: 0 };
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      const precisaMix = (p.usarMusica && musicaSrc) || (p.usarOriginal && p.volVideo < 0.999);
      // Dispara o download do áudio imediatamente, em paralelo com setup do vídeo/canvas.
      // Quando o áudio for necessário mais abaixo, provavelmente já estará pronto.
      const promessaArrayBuffer = (precisaMix && p.usarMusica && musicaSrc && AC)
        ? fetch(StoryComposer.#toAudioProxyUrl(musicaSrc), { mode: 'cors', credentials: 'omit' })
            .then(r => r.ok ? r.arrayBuffer() : null)
            .catch(() => null)
        : null;

      url = URL.createObjectURL(file);
      video = document.createElement('video');
      video.src = url; video.muted = true; video.playsInline = true; video.preload = 'auto';
      await StoryComposer.#aguardarVideoMetadata(video);

      const dur  = Number(video.duration) || 0;
      const segs = Math.min(dur > 0 ? dur : maxSeconds, maxSeconds);
      const vw = video.videoWidth  || previewW || 9;
      const vh = video.videoHeight || previewH || 16;

      // Canvas no aspecto do preview, mas na RESOLUÇÃO da mídia (até o teto) —
      // preserva o máximo de resolução possível.
      const aspect    = (previewW > 0 && previewH > 0) ? previewW / previewH : (vw / vh || 9 / 16);
      const ladoLongo = Math.min(Math.max(vw, vh) || StoryComposer.MAX_LADO_VIDEO, StoryComposer.MAX_LADO_VIDEO);
      const cv = StoryComposer.dimsCanvas(aspect, ladoLongo);
      const escalaCanvas = previewW > 0 ? cv.w / previewW : 1;

      const canvas = document.createElement('canvas');
      canvas.width = cv.w; canvas.height = cv.h;
      const ctx = canvas.getContext('2d');
      stream = canvas.captureStream(30);

      // ── Áudio: mix de vídeo (volVideo) + música (volMusica) por ganhos ──
      let temAudio = false;

      if (p.usarOriginal && !precisaMix) {
        // Caminho simples (volume cheio, sem música): faixa do vídeo via captureStream.
        try { const vc = video.captureStream?.() || video.mozCaptureStream?.(); const at = vc?.getAudioTracks?.()[0]; if (at) { stream.addTrack(at); temAudio = true; } } catch (_) {}
        if (!temAudio && AC) {
          try {
            audioCtx = new AC();
            const d = audioCtx.createMediaStreamDestination();
            const s = audioCtx.createMediaElementSource(video);
            const g = audioCtx.createGain(); g.gain.value = p.volVideo;
            s.connect(g); g.connect(d);
            const t = d.stream.getAudioTracks()[0]; if (t) { stream.addTrack(t); temAudio = true; }
          } catch (_) {}
        }
      } else if (precisaMix && AC) {
        try {
          audioCtx = new AC();
          const d = audioCtx.createMediaStreamDestination();
          let temFonteConectada = false; // só adiciona track ao stream se pelo menos uma fonte conetou
          if (p.usarOriginal) {
            try {
              video.muted = false; // roteado p/ WebAudio (sem alto-falante); feed confiável
              const sv = audioCtx.createMediaElementSource(video);
              const gv = audioCtx.createGain(); gv.gain.value = p.volVideo;
              sv.connect(gv); gv.connect(d);
              temFonteConectada = true;
            } catch (_) {}
          }
          if (p.usarMusica && musicaSrc) {
            try {
              const arrayBuf = await promessaArrayBuffer;
              if (arrayBuf) {
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
                const bufSrc = audioCtx.createBufferSource();
                bufSrc.buffer = audioBuffer; bufSrc.loop = true;
                const gm = audioCtx.createGain(); gm.gain.value = p.volMusica;
                bufSrc.connect(gm); gm.connect(d);
                musicaEl = bufSrc; // limpar() chama .stop()
                temFonteConectada = true;
              }
            } catch (_) { /* música indisponível (CORS/rede) — continua sem ela */ }
          }
          // MediaStreamAudioDestinationNode sempre tem uma track mesmo sem fontes conectadas;
          // só inclui no stream quando pelo menos uma fonte real foi conectada.
          if (temFonteConectada) {
            const t = d.stream.getAudioTracks()[0]; if (t) { stream.addTrack(t); temAudio = true; }
          }
        } catch (_) { /* sem áudio se não der */ }
      } // else: sem áudio (remover original e sem música)

      const audioBps = temAudio ? StoryComposer.AUDIO_BPS : 0;
      const orcamento = Math.min(targetBytes, StoryComposer.ORCAMENTO_VIDEO);
      const videoBps = Math.max(120000, Math.floor((orcamento * 8 / Math.max(1, segs)) * 0.9 * fatorBitrate) - audioBps);
      const mime = StoryComposer.#mime();

      const chunks = [];
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: videoBps,
        ...(audioBps ? { audioBitsPerSecond: audioBps } : {}),
      });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const parada = new Promise((resolve) => { rec.onstop = () => resolve(); });

      // Vídeo desenhado em "contain" (letterbox preto, igual ao CSS) + overlays por cima.
      const fit = Math.min(cv.w / vw, cv.h / vh);
      const dw = vw * fit, dh = vh * fit, dx = (cv.w - dw) / 2, dy = (cv.h - dh) / 2;
      let parou = false;
      const desenhar = () => {
        if (parou) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.w, cv.h);
        try { ctx.drawImage(video, dx, dy, dw, dh); } catch (_) {}
        OverlayPainter.desenhar(ctx, overlays, escalaCanvas);
        if (creditos) OverlayPainter.desenharCreditos(ctx, creditos, escalaCanvas);
        raf = requestAnimationFrame(desenhar);
      };
      const parar = () => {
        if (parou) return;
        parou = true;
        try { if (rec.state === 'recording') rec.stop(); } catch (_) {}
      };

      rec.start();
      try { await audioCtx?.resume?.(); } catch (_) {}
      // Alguns browsers (iOS Safari strict-autoplay) resolvem resume() antes de
      // transicionar para 'running'. Só dispara BufferSource se o contexto confirmou.
      if (musicaEl && audioCtx) {
        if (audioCtx.state === 'running') {
          try { musicaEl.start(audioCtx.currentTime || 0); } catch (_) {}
        } else {
          const iniciarAoRetomar = () => {
            if (audioCtx.state === 'running') {
              try { musicaEl.start(audioCtx.currentTime || 0); } catch (_) {}
              audioCtx.removeEventListener('statechange', iniciarAoRetomar);
            }
          };
          audioCtx.addEventListener('statechange', iniciarAoRetomar);
        }
      }
      await video.play();
      desenhar();
      video.onended = parar;
      timer = setTimeout(parar, segs * 1000 + 200);

      await parada;
      limpar();
      return new Blob(chunks, { type: mime || 'video/webm' });
    } catch (_) {
      limpar();
      return null;
    }
  }

  // ── Imagem ──────────────────────────────────────────────────

  /**
   * Imagem + música → vídeo curto (imagem estática como quadro + a música como
   * faixa de áudio). Sobe como vídeo, então a música toca ao visualizar o story.
   * Falha/sem suporte → retorna null (o caminho de imagem normal assume).
   */
  static async #comporImagemComMusica(opts) {
    const plano = StoryComposer.planoAudio({ musica: opts.musica, musicaSrc: opts.musicaSrc, audioMix: opts.audioMix });
    const blob = await StoryComposer.#gravarImagemMusica({
      file:       opts.file,
      overlays:   Array.isArray(opts.overlays) ? opts.overlays : [],
      previewW:   Number(opts.previewW) || 0,
      previewH:   Number(opts.previewH) || 0,
      // Imagem ≤500KB; a faixa de música entra como áudio por cima (≈ 500KB + KB da música).
      targetBytes: StoryComposer.ALVO_IMG,
      maxSeconds: Number(opts.maxSeconds) || 30,
      musicaSrc:  opts.musicaSrc || null,
      volMusica:  plano.volMusica > 0 ? plano.volMusica : 0.7,
      creditos:   opts.creditos || null,
    });
    if (!blob || !blob.size) return null;
    const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], `story-${Date.now()}.${ext}`, { type: blob.type || 'video/webm' });
  }

  static async #gravarImagemMusica({ file, overlays, previewW, previewH, targetBytes, maxSeconds, musicaSrc, volMusica, creditos = null }) {
    let url = null, audioCtx = null, stream = null, musicaEl = null, raf = null, timer = null;
    const limpar = () => {
      try { if (raf) cancelAnimationFrame(raf); } catch (_) {}
      try { clearTimeout(timer); } catch (_) {}
      try { stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
      try { musicaEl?.stop?.(); } catch (_) {}
      try { audioCtx?.close?.(); } catch (_) {}
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
    };

    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC || !musicaSrc) return null; // sem WebAudio/música → deixa a imagem normal
      // Baixa o áudio em paralelo com o carregamento da imagem.
      const promessaArrayBuffer = fetch(StoryComposer.#toAudioProxyUrl(musicaSrc), { mode: 'cors', credentials: 'omit' })
        .then(r => r.ok ? r.arrayBuffer() : null)
        .catch(() => null);

      url = URL.createObjectURL(file);
      const img = document.createElement('img');
      await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url; });

      const iw = img.naturalWidth  || previewW || 9;
      const ih = img.naturalHeight || previewH || 16;
      const aspect    = (previewW > 0 && previewH > 0) ? previewW / previewH : (iw / ih || 9 / 16);
      const ladoLongo = Math.min(Math.max(iw, ih) || StoryComposer.MAX_LADO_VIDEO, StoryComposer.MAX_LADO_VIDEO);
      const cv = StoryComposer.dimsCanvas(aspect, ladoLongo);
      const escalaCanvas = previewW > 0 ? cv.w / previewW : 1;

      const canvas = document.createElement('canvas');
      canvas.width = cv.w; canvas.height = cv.h;
      const ctx = canvas.getContext('2d');
      stream = canvas.captureStream(30);

      // Música → faixa de áudio do stream.
      const arrayBuf = await promessaArrayBuffer;
      if (!arrayBuf) return null;
      audioCtx = new AC();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      const segs = Math.min(audioBuffer.duration || maxSeconds, maxSeconds);
      const d = audioCtx.createMediaStreamDestination();
      const bufSrc = audioCtx.createBufferSource();
      bufSrc.buffer = audioBuffer; bufSrc.loop = true;
      const gm = audioCtx.createGain(); gm.gain.value = volMusica;
      bufSrc.connect(gm); gm.connect(d);
      musicaEl = bufSrc;
      let temAudio = false;
      const at = d.stream.getAudioTracks()[0];
      if (at) { stream.addTrack(at); temAudio = true; }

      const audioBps = temAudio ? StoryComposer.AUDIO_BPS : 0;
      const orcamento = Math.min(targetBytes, StoryComposer.ORCAMENTO_VIDEO);
      const videoBps = Math.max(120000, Math.floor((orcamento * 8 / Math.max(1, segs)) * 0.9) - audioBps);
      const mime = StoryComposer.#mime();

      const chunks = [];
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: videoBps,
        ...(audioBps ? { audioBitsPerSecond: audioBps } : {}),
      });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const parada = new Promise((resolve) => { rec.onstop = () => resolve(); });

      // Imagem desenhada em "contain" (letterbox preto) + overlays por cima.
      const fit = Math.min(cv.w / iw, cv.h / ih);
      const dw = iw * fit, dh = ih * fit, dx = (cv.w - dw) / 2, dy = (cv.h - dh) / 2;
      let parou = false;
      const desenhar = () => {
        if (parou) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.w, cv.h);
        try { ctx.drawImage(img, dx, dy, dw, dh); } catch (_) {}
        OverlayPainter.desenhar(ctx, overlays, escalaCanvas);
        if (creditos) OverlayPainter.desenharCreditos(ctx, creditos, escalaCanvas);
        raf = requestAnimationFrame(desenhar);
      };
      const parar = () => {
        if (parou) return;
        parou = true;
        try { if (rec.state === 'recording') rec.stop(); } catch (_) {}
      };

      rec.start();
      try { await audioCtx?.resume?.(); } catch (_) {}
      // iOS Safari pode resolver resume() antes de 'running' — só dispara quando confirmar.
      if (audioCtx.state === 'running') {
        try { musicaEl.start(audioCtx.currentTime || 0); } catch (_) {}
      } else {
        const iniciarAoRetomar = () => {
          if (audioCtx.state === 'running') {
            try { musicaEl.start(audioCtx.currentTime || 0); } catch (_) {}
            audioCtx.removeEventListener('statechange', iniciarAoRetomar);
          }
        };
        audioCtx.addEventListener('statechange', iniciarAoRetomar);
      }
      desenhar();
      timer = setTimeout(parar, segs * 1000 + 200);

      await parada;
      limpar();
      return new Blob(chunks, { type: mime || 'video/webm' });
    } catch (_) {
      limpar();
      return null;
    }
  }

  static #aguardarVideoMetadata(video) {
    if (!video) return Promise.reject(new Error('metadata'));
    if (Number.isFinite(video.duration) && video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const limpar = () => {
        try { clearTimeout(timer); } catch (_) {}
        try { video.removeEventListener?.('loadedmetadata', ok); } catch (_) {}
        try { video.removeEventListener?.('error', fail); } catch (_) {}
        try { video.removeEventListener?.('stalled', fail); } catch (_) {}
        try { video.removeEventListener?.('abort', fail); } catch (_) {}
      };
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        limpar();
        fn(value);
      };
      const ok = () => finish(resolve);
      const fail = () => finish(reject, new Error('metadata'));
      timer = setTimeout(() => finish(reject, new Error('metadata-timeout')), StoryComposer.VIDEO_METADATA_TIMEOUT_MS);
      video.addEventListener?.('loadedmetadata', ok, { once: true });
      video.addEventListener?.('error', fail, { once: true });
      video.addEventListener?.('stalled', fail, { once: true });
      video.addEventListener?.('abort', fail, { once: true });
      try { video.load?.(); } catch (_) {}
    });
  }

  static async #comporImagem({ file, overlays = [], previewW = 0, previewH = 0, targetBytes = StoryComposer.ALVO_IMG, creditos = null } = {}) {
    let url = null;
    try {
      url = URL.createObjectURL(file);
      const img = document.createElement('img');
      await new Promise((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')); img.src = url; });

      const iw = img.naturalWidth  || previewW || 9;
      const ih = img.naturalHeight || previewH || 16;
      const aspect = (previewW > 0 && previewH > 0) ? previewW / previewH : (iw / ih || 9 / 16);
      const tetoLado = Math.min(Math.max(iw, ih) || StoryComposer.MAX_LADO_IMG, StoryComposer.MAX_LADO_IMG);

      // Busca a MAIOR resolução cuja melhor qualidade ainda cabe no alvo (≤targetBytes).
      // Em cada degrau de resolução, percorre as qualidades de cima p/ baixo.
      // Guarda o melhor candidato (≤alvo) e, como rede de segurança, o menor gerado.
      let melhor = null;     // ≤ alvo, maior resolução possível
      let fallback = null;   // menor blob gerado (se nada couber)
      for (let lado = tetoLado; lado >= 80 && !melhor; lado = Math.round(lado * 0.7)) {
        const cv = StoryComposer.dimsCanvas(aspect, lado);
        const canvas = document.createElement('canvas');
        canvas.width = cv.w; canvas.height = cv.h;
        const ctx = canvas.getContext('2d');
        const escalaCanvas = previewW > 0 ? cv.w / previewW : 1;

        const fit = Math.min(cv.w / iw, cv.h / ih);
        const dw = iw * fit, dh = ih * fit, dx = (cv.w - dw) / 2, dy = (cv.h - dh) / 2;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cv.w, cv.h);
        ctx.drawImage(img, dx, dy, dw, dh);
        OverlayPainter.desenhar(ctx, overlays, escalaCanvas);
        if (creditos) OverlayPainter.desenharCreditos(ctx, creditos, escalaCanvas);

        for (const q of [0.82, 0.7, 0.58, 0.45, 0.34]) {
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
          if (!blob) continue;
          if (!fallback || blob.size < fallback.size) fallback = blob;
          if (blob.size <= targetBytes) { melhor = blob; break; }
        }
      }
      URL.revokeObjectURL(url); url = null;

      const escolhido = melhor || fallback;
      if (!escolhido || !escolhido.size) return file;
      return new File([escolhido], `story-${Date.now()}.jpg`, { type: escolhido.type || 'image/jpeg' });
    } catch (_) {
      try { if (url) URL.revokeObjectURL(url); } catch (_) {}
      return file;
    }
  }
}

// Compressão de vídeo (sem overlays) — mantida por compatibilidade.
// Delega para StoryComposer (DRY). Sem suporte → devolve o original.
class VideoCompressor {
  static async comprimir(file, { maxSeconds = 30, targetBytes = 1.5 * 1024 * 1024 } = {}) {
    return StoryComposer.compor({ file, tipo: 'video', overlays: [], targetBytes, maxSeconds });
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

  static CORES = [
    '#ffffff', '#000000', '#d4a017', '#ff3b30', '#007aff',
    '#34c759', '#ff2d55', '#ff9500', '#af52de',
  ];

  static FONTES = [
    { nome: 'Padrão',      familia: 'sans-serif' },
    { nome: 'Baby Azalea', familia: '"Baby Azalea"' },
    { nome: 'Bartonis',    familia: '"Bartonis One Demo"' },
    { nome: 'Broughton',   familia: '"Broughton"' },
    { nome: 'Hadrey',      familia: '"Hadrey"' },
    { nome: 'Qiduwy',      familia: '"QiduwyPesonaluse"' },
    { nome: 'Sounding',    familia: '"SoundingScript Free"' },
  ];

  static FRASES = [
    'Reserve agora!', 'Novidade!', 'Promoção especial', 'Corte do dia',
    'Barba feita!', 'Visual novo', 'Agende já!', 'Transformação total',
    'Estilo único', 'Profissional top', 'Sem fila!', 'Horário disponível',
    'Venha nos visitar', 'Desconto especial', 'Novo look!',
    'Barba modelada', 'Degradê perfeito', 'Social clássico',
    'Promoção do dia', 'Cliente VIP', 'Melhor barbearia', 'Corte premium',
  ];

  static MUSIC_PAGE = 20;

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
  #processing = null;   // indicador "Processando…" sobre o preview
  #finalBtn   = null;   // botão Finalizar (desabilitado durante o processo)
  #musicaSel  = null;   // faixa escolhida completa (inclui url/src)
  #videoEl    = null;   // <video> atual no preview (p/ volume ao vivo)
  #mediaObjectUrl = null;
  #mediaLoadTimer = null;
  #mediaStatus = 'vazio';

  // Catálogo + subsistema de música (POO)
  #catalogo  = null;    // MusicCatalogService
  #playback  = null;    // MusicPlaybackState
  #repo      = null;    // MusicRepository (persiste só a referência)
  #stateMgr  = null;    // MusicStateManager (Preview→Confirmar→Persistir)
  #playerSvc = null;    // MusicPlayerService (reusa AudioPreviewPlayer)
  #selection = null;    // MusicSelectionController
  #previewCtrl = null;  // MusicPreviewController
  #previewMusicCtrl = null; // PreviewMusicController (creditos visuais)
  #musicList = null;
  #musicGenres = null;
  #musicEmpty = null;
  #musicSentinel = null;
  #musicObserver = null;
  #onMusicScroll = null;
  #musicLoadingMore = false;
  #musicState = { genero: 'Todos', termo: '', pagina: 1, filtrados: [], totalPaginas: 1, hasMore: false };
  #musicSearchTimer = null;
  #mixPanel  = null;
  #mixRefs   = null;
  #mixPlayBtn = null;
  #mixTimeEl = null;

  #nomeBarbearia = '';
  #liveTextEl = null;
  #activeOverlayGesture = null;
  #selectedOverlayEl = null;

  #corTexto   = '#ffffff';
  #fonteTexto = 'sans-serif';
  #fontBtnEls = [];

  #frasesSheet    = null;
  #stageVolumes   = null;
  #volVideoRow    = null;
  #volMusicRow    = null;
  #volVideoSlider = null;
  #volMusicSlider = null;

  constructor(service, { onFinalizar, catalogo, AudioCtor, nomeBarbearia } = {}) {
    this.#service         = service;
    this.#onFinalizar     = typeof onFinalizar === 'function' ? onFinalizar : () => {};
    this.#nomeBarbearia   = String(nomeBarbearia ?? '');
    this.#catalogo    = catalogo
      ?? (typeof MusicCatalogService !== 'undefined' ? new MusicCatalogService() : null);

    // Subsistema de música (POO): estado + repo + manager + player + seleção.
    this.#playback = (typeof MusicPlaybackState !== 'undefined') ? new MusicPlaybackState() : null;
    this.#repo = (typeof MusicRepository !== 'undefined') ? new MusicRepository({ service: this.#service }) : null;
    this.#stateMgr = (typeof MusicStateManager !== 'undefined') ? new MusicStateManager({ state: this.#playback, repository: this.#repo }) : null;
    this.#previewCtrl = (typeof MusicPreviewController !== 'undefined') ? new MusicPreviewController({ state: this.#playback }) : null;
    this.#playerSvc = (typeof MusicPlayerService !== 'undefined')
      ? new MusicPlayerService({
          AudioCtor,
          onProgress: (p) => this.#previewCtrl?.atualizarProgresso(p),
          onState:    ()  => this.#previewCtrl?.atualizarEstado(),
        })
      : null;
    this.#previewCtrl?.setPlayer(this.#playerSvc);
    this.#selection = (typeof MusicSelectionController !== 'undefined')
      ? new MusicSelectionController({
          stateManager: this.#stateMgr, player: this.#playerSvc,
          onAplicar:  (t) => this.#aoAplicarMusica(t),
          onCancelar: ()  => this.#aoCancelarMusica(),
        })
      : null;
    this.#previewMusicCtrl = (typeof PreviewMusicController !== 'undefined')
      ? new PreviewMusicController()
      : null;
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

    // Preview
    this.#vazio = scEl('div', { class: 'sc-preview-vazio', text: 'Escolha um vídeo ou foto para começar' });
    this.#caret = scEl('div', { class: 'sc-text-caret' });
    this.#caret.hidden = true;
    this.#processing = scEl('div', { class: 'sc-processing', text: 'Processando…' });
    this.#processing.hidden = true;

    // Ferramentas sobrepostas no topo do preview (Música, Emoji, Frases)
    const topTools = scEl('div', { class: 'sc-preview-top-tools', children: [
      this.#ptool('🎵', 'Música', () => this.#abrirMusicas()),
      this.#ptool('😊', 'Emoji',  () => this.#abrirEmojis()),
      this.#ptool('💬', 'Frases', () => this.#abrirFrases()),
    ] });

    this.#liveTextEl = scEl('div', { class: 'sc-live-text' });
    this.#liveTextEl.hidden = true;
    this.#preview = scEl('div', { class: 'sc-preview', children: [this.#vazio, this.#caret, this.#processing, this.#liveTextEl] });
    // Rota o segundo dedo (fora do overlay) para o gesto do overlay ativo, permitindo pinça.
    // Também desfaz a seleção ao tocar no fundo (vídeo/imagem ou preview vazio).
    this.#preview.addEventListener('pointerdown', (e) => {
      const tgt = e.target;
      if (tgt === this.#preview || tgt === this.#videoEl || tgt?.tagName === 'IMG') {
        this.#desativarSelecao();
      }
      const ag = this.#activeOverlayGesture;
      if (!ag || !ag.pts.size || ag.pts.has(e.pointerId)) return;
      ag.onDown(e);
    }, { passive: false });

    // Área inferior: volumes (absoluto, flutua sobre botões) + botões de mídia
    this.#stageVolumes = this.#construirVolumes();
    const mediaBtns = scEl('div', { class: 'sc-media-btns', children: [
      this.#mbtn('⬆️', 'Upload', () => this.#escolherMidia(new UploadMediaSource())),
      this.#mbtn('📷', 'Câmera', () => this.#escolherMidia(new CameraMediaSource())),
    ] });
    const stageLower = scEl('div', { class: 'sc-stage-lower', children: [this.#stageVolumes, mediaBtns] });

    const stage = scEl('div', { class: 'sc-stage', children: [topTools, this.#preview, stageLower] });
    this.#previewMusicCtrl?.reattach(this.#preview);

    // Barra de texto (abaixo do preview)
    this.#input = scEl('input', {
      class: 'sc-text-input', type: 'text',
      placeholder: 'Escreva algo…', attrs: { 'aria-label': 'Texto do story', maxlength: '60' },
      on: {
        focus: () => this.#mostrarCaret(true),
        blur:  () => this.#mostrarCaret(false),
        keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); this.#enviarTexto(); } },
        input: () => { this.#atualizarSend(); this.#atualizarLiveText(); },
      },
    });
    this.#sendBtn = scEl('button', { class: 'sc-text-send', type: 'button', text: '➤', attrs: { 'aria-label': 'Adicionar texto' }, on: { click: () => this.#enviarTexto() } });
    this.#sendBtn.disabled = true;
    const textBar = scEl('div', { class: 'sc-text-bar', children: [
      this.#construirTextExtras(),
      scEl('div', { class: 'sc-text-wrap', children: [this.#input, this.#sendBtn] }),
    ] });

    // Ações inferiores
    const btnTexto = scEl('button', { class: 'sc-btn', type: 'button', text: 'Enviar texto', on: { click: () => this.#enviarTexto() } });
    const btnFinal = scEl('button', { class: 'sc-btn sc-btn--primario', type: 'button', text: 'Finalizar', on: { click: () => this.#finalizar() } });
    this.#finalBtn = btnFinal;
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
    if (this.#service?.media) this.#renderMidia();
  }

  #tool(icone, label, onClick) {
    return scEl('button', { class: 'sc-tool', type: 'button', attrs: { 'aria-label': label }, on: { click: onClick }, children: [
      scEl('span', { text: icone }),
      scEl('span', { class: 'sc-tool-label', text: label }),
    ] });
  }

  #ptool(icone, label, onClick) {
    return scEl('button', { class: 'sc-preview-ptool', type: 'button', text: icone, attrs: { 'aria-label': label }, on: { click: onClick } });
  }

  #mbtn(icone, label, onClick) {
    return scEl('button', { class: 'sc-media-btn', type: 'button', attrs: { 'aria-label': label }, on: { click: onClick }, children: [
      scEl('span', { text: icone }),
      scEl('span', { class: 'sc-media-btn-label', text: label }),
    ] });
  }

  #stageEl() {
    return this.#overlayEl?.querySelector?.('.sc-stage') ?? this.#overlayEl;
  }

  #previewEl() {
    return this.#preview ?? this.#overlayEl?.querySelector?.('.sc-preview') ?? this.#stageEl();
  }

  // ── Cor e fonte do texto ───────────────────────────────────

  #construirTextExtras() {
    const fontBtn = this.#criarFontBtn();
    return scEl('div', { class: 'sc-text-extras', children: [
      this.#construirCores(),
      fontBtn,
    ] });
  }

  #construirCores() {
    return scEl('div', { class: 'sc-tcor-row', children:
      StoryCreationModal.CORES.map(cor => {
        const btn = scEl('button', {
          class: 'sc-tcor-btn' + (cor === this.#corTexto ? ' is-sel' : ''),
          type: 'button', dataset: { cor }, attrs: { 'aria-label': cor },
          on: { click: () => { this.#corTexto = cor; this.#sincronizarCores(); } },
        });
        btn.style.background = cor;
        return btn;
      })
    });
  }

  #criarFontBtn() {
    const fonte = StoryCreationModal.FONTES.find(f => f.familia === this.#fonteTexto) ?? StoryCreationModal.FONTES[0];
    const btn = scEl('button', {
      class: 'sc-tfont-btn', type: 'button',
      text: 'Aa', attrs: { 'aria-label': 'Mudar fonte', title: fonte.nome },
      on: { click: () => this.#ciclaisFonte() },
    });
    btn.style.fontFamily = fonte.familia;
    this.#fontBtnEls.push(btn);
    return btn;
  }

  #atualizarLiveText() {
    if (!this.#liveTextEl) return;
    const val = String(this.#input?.value ?? '');
    if (!val) { this.#liveTextEl.hidden = true; return; }
    this.#liveTextEl.textContent = val;
    this.#liveTextEl.style.color = this.#corTexto;
    this.#liveTextEl.style.fontFamily = this.#fonteTexto;
    this.#liveTextEl.hidden = false;
  }

  #sincronizarCores() {
    this.#overlayEl?.querySelectorAll?.('.sc-tcor-btn').forEach(btn => {
      btn.classList.toggle('is-sel', btn.dataset.cor === this.#corTexto);
    });
    this.#atualizarLiveText();
  }

  #ciclaisFonte() {
    const fontes = StoryCreationModal.FONTES;
    const idx = fontes.findIndex(f => f.familia === this.#fonteTexto);
    this.#fonteTexto = fontes[(idx + 1) % fontes.length].familia;
    this.#fontBtnEls.forEach(btn => {
      const f = StoryCreationModal.FONTES.find(f => f.familia === this.#fonteTexto) ?? StoryCreationModal.FONTES[0];
      btn.style.fontFamily = this.#fonteTexto;
      btn.title = f.nome;
    });
    this.#atualizarLiveText();
  }

  #sheetHeader({ title, titleClass, closeClass, onClose }) {
    return scEl('div', { class: 'sc-sheet-head', children: [
      scEl('div', { class: titleClass, text: title }),
      scEl('button', {
        class: `sc-sheet-close ${closeClass}`,
        type: 'button',
        text: '×',
        attrs: { 'aria-label': 'Fechar' },
        on: { click: onClose },
      }),
    ] });
  }

  // ── Mídia ──────────────────────────────────────────────────

  async #escolherMidia(source) {
    const midia = await source.obter();
    if (!midia) return;

    // A compressão/queima de overlays acontece UMA vez, no Finalizar
    // (sem encode duplo). Aqui só guardamos a mídia original e mostramos.
    try {
      this.#service.definirMedia(midia);
    } catch (_) {
      return; // tipo inválido — ignorado silenciosamente nesta etapa de UI
    }
    this.#renderMidia();
  }

  #mostrarProcessando(ativo, texto = 'Processando…') {
    if (!this.#processing) return;
    if (ativo) this.#processing.textContent = texto;
    this.#processing.hidden = !ativo;
  }

  #limparPreviewMedia({ revogarUrl = true } = {}) {
    try { clearTimeout(this.#mediaLoadTimer); } catch (_) {}
    this.#mediaLoadTimer = null;
    if (revogarUrl && this.#mediaObjectUrl) {
      try { URL.revokeObjectURL(this.#mediaObjectUrl); } catch (_) {}
    }
    this.#mediaObjectUrl = null;
    [...(this.#preview?.querySelectorAll?.('video, img, .sc-overlay-item') ?? [])].forEach(el => el.remove());
    this.#videoEl = null;
  }

  #marcarVideoPronto(videoEl) {
    if (videoEl !== this.#videoEl) return;
    try { clearTimeout(this.#mediaLoadTimer); } catch (_) {}
    this.#mediaLoadTimer = null;
    this.#mediaStatus = 'pronto';
    if (this.#finalBtn) this.#finalBtn.disabled = false;
    this.#mostrarProcessando(false);
    this.#atualizarTempoMix();
  }

  #marcarVideoErro(videoEl, mensagem = 'Nao foi possivel carregar este video. Tente outro arquivo MP4 curto.') {
    if (videoEl !== this.#videoEl) return;
    try { clearTimeout(this.#mediaLoadTimer); } catch (_) {}
    this.#mediaLoadTimer = null;
    this.#mediaStatus = 'erro';
    if (this.#finalBtn) this.#finalBtn.disabled = true;
    try { videoEl?.pause?.(); } catch (_) {}
    this.#mostrarProcessando(true, mensagem);
  }

  #renderMidia() {
    const media = this.#service.media;
    if (!this.#preview) return;
    this.#previewMusicCtrl?.reattach(this.#previewEl());
    // Remove mídia e overlays anteriores (troca de mídia reseta overlays)
    this.#limparPreviewMedia();
    this.#mediaStatus = 'vazio';
    this.#mostrarProcessando(false);
    if (this.#vazio) this.#vazio.hidden = true;
    if (!media) { if (this.#vazio) this.#vazio.hidden = false; this.#atualizarVolumes(); return; }

    const url = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(media.file) : '';
    this.#mediaObjectUrl = url || null;
    let el;
    if (media.tipo === 'video') {
      el = scEl('video', { attrs: { playsinline: '', preload: 'auto', loop: '' } });
      this.#mediaStatus = 'carregando';
      if (this.#finalBtn) this.#finalBtn.disabled = true;
      this.#mostrarProcessando(true, 'Carregando video...');
      // Com áudio: a seleção do arquivo é um gesto do usuário, então o play
      // com som é permitido. Se o navegador bloquear, o catch ignora.
      el.muted = false;
      el.src = url;
      this.#videoEl = el;
      el.addEventListener?.('loadedmetadata', () => this.#marcarVideoPronto(el), { once: true });
      el.addEventListener?.('canplay', () => this.#marcarVideoPronto(el), { once: true });
      el.addEventListener?.('error', () => this.#marcarVideoErro(el), { once: true });
      el.addEventListener?.('stalled', () => this.#marcarVideoErro(el, 'O navegador travou ao ler este video. Tente outro MP4 curto.'), { once: true });
      el.addEventListener?.('abort', () => this.#marcarVideoErro(el), { once: true });
      el.addEventListener?.('timeupdate', () => this.#atualizarTempoMix());
      el.addEventListener?.('play', () => this.#atualizarTempoMix());
      el.addEventListener?.('pause', () => this.#atualizarTempoMix());
      this.#mediaLoadTimer = setTimeout(() => {
        this.#marcarVideoErro(el, 'Tempo esgotado ao carregar o video. Tente outro arquivo MP4 curto.');
      }, StoryComposer.VIDEO_METADATA_TIMEOUT_MS);
      this.#aplicarVolumePreview(); // respeita o mix atual (se já houver)
      try { const p = el.play?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      try { el.load?.(); } catch (_) {}
    } else {
      el = scEl('img', { attrs: { alt: '' } });
      el.src = url;
      this.#mediaStatus = 'pronto';
      if (this.#finalBtn) this.#finalBtn.disabled = false;
    }
    // Insere a mídia como primeiro filho (atrás dos overlays/caret)
    if (this.#preview.firstChild) this.#preview.insertBefore(el, this.#preview.firstChild);
    else this.#preview.appendChild(el);
    if (media.tipo === 'video') {
      try { el.load?.(); } catch (_) {}
      try { const p = el.play?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
    this.#atualizarVolumes();
  }

  // ── Mix de áudio (preview + estado) ────────────────────────

  #mostrarMix(show) {
    show = !!show && this.#ehVideoAtual();
    if (!this.#mixPanel) this.#construirMix();
    if (this.#mixPanel) this.#mixPanel.hidden = !show;
    if (show) {
      this.#sincronizarPreviewAudio();
      this.#atualizarTempoMix();
    }
  }

  #construirMix() {
    const mix = this.#service.audioMix;
    const manter = scEl('input', { type: 'checkbox', class: 'sc-mix-keep', on: { change: () => this.#atualizarMix() } });
    manter.checked = mix.manterOriginal;
    const volV = scEl('input', { type: 'range', class: 'sc-mix-range sc-mix-video', attrs: { min: '0', max: '100', 'aria-label': 'Volume do vídeo' }, on: { input: () => this.#atualizarMix() } });
    volV.value = String(Math.round(mix.volumeVideo * 100));
    volV.style.setProperty('--vol-pct', volV.value + '%');
    const volM = scEl('input', { type: 'range', class: 'sc-mix-range sc-mix-music', attrs: { min: '0', max: '100', 'aria-label': 'Volume da música' }, on: { input: () => this.#atualizarMix() } });
    volM.value = String(Math.round(mix.volumeMusica * 100));
    volM.style.setProperty('--vol-pct', volM.value + '%');
    this.#mixRefs = { manter, volV, volM };

    this.#mixPlayBtn = scEl('button', {
      class: 'sc-mix-play', type: 'button', text: '▶',
      attrs: { 'aria-label': 'Tocar preview' },
      on: { click: () => this.#alternarPreviewAudio() },
    });
    this.#mixTimeEl = scEl('span', { class: 'sc-mix-time', text: '00:00 / 00:30' });
    const linhaPlayer = scEl('div', { class: 'sc-mix-row sc-mix-row--player', children: [
      this.#mixPlayBtn, this.#mixTimeEl,
    ] });

    const linhaKeep = scEl('label', { class: 'sc-mix-row sc-mix-row--keep', children: [
      manter, scEl('span', { text: 'Manter som original' }),
    ] });
    const linhaV = scEl('div', { class: 'sc-mix-row', children: [
      scEl('span', { class: 'sc-mix-label', text: 'Video' }), volV,
    ] });
    const linhaM = scEl('div', { class: 'sc-mix-row', children: [
      scEl('span', { class: 'sc-mix-label', text: 'Musica' }), volM,
    ] });

    const remover = scEl('button', {
      class: 'sc-mix-remover', type: 'button', text: 'Remover música',
      on: { click: () => this.#selection?.cancelar() },
    });
    const tituloMix = scEl('div', { class: 'sc-mix-title', text: 'Audio do Video' });
    this.#mixPanel = scEl('div', { class: 'sc-mix', children: [
      tituloMix, linhaPlayer, linhaKeep, linhaV, linhaM, remover,
    ] });
    this.#mixPanel.hidden = true;
    // Insere acima das ações inferiores.
    const bottom = this.#overlayEl?.querySelector?.('.sc-bottom-actions');
    if (bottom && this.#overlayEl?.insertBefore) this.#overlayEl.insertBefore(this.#mixPanel, bottom);
    else this.#overlayEl?.appendChild(this.#mixPanel);
    this.#atualizarMix();
  }

  #atualizarMix() {
    if (!this.#mixRefs) return;
    const manterOriginal = !!this.#mixRefs.manter.checked;
    const volumeVideo  = (Number(this.#mixRefs.volV.value) || 0) / 100;
    const volumeMusica = (Number(this.#mixRefs.volM.value) || 0) / 100;
    // Preenchimento dourado do traço acompanha o valor (igual aos outros sliders).
    this.#mixRefs.volV.style.setProperty('--vol-pct', this.#mixRefs.volV.value + '%');
    this.#mixRefs.volM.style.setProperty('--vol-pct', this.#mixRefs.volM.value + '%');
    this.#service.definirMixAudio({ manterOriginal, volumeVideo, volumeMusica });
    this.#mixRefs.volV.disabled = !manterOriginal;
    this.#aplicarVolumePreview();
  }

  /** Prévia instantânea: ajusta volumes do vídeo e da música ao vivo (sem reprocessar). */
  #aplicarVolumePreview() {
    const mix = this.#service.audioMix;
    if (this.#videoEl) {
      try { this.#videoEl.muted = !mix.manterOriginal; this.#videoEl.volume = mix.manterOriginal ? mix.volumeVideo : 0; } catch (_) {}
    }
    if (this.#playerSvc) this.#playerSvc.volume = mix.volumeMusica;
  }

  #abaixarVolumeVideo() {
    if (!this.#videoEl) return;
    try { this.#videoEl.volume = Math.min(this.#videoEl.volume, 0.2); } catch (_) {}
  }

  #restaurarVolumeVideo() {
    this.#aplicarVolumePreview();
  }

  #construirVolumes() {
    const _setVol = (el) => el.style.setProperty('--vol-pct', el.value + '%');

    this.#volVideoSlider = scEl('input', {
      type: 'range', class: 'sc-vol-range',
      attrs: { min: '0', max: '100', value: '100', 'aria-label': 'Volume do vídeo' },
      on: { input: (e) => { if (this.#videoEl) try { this.#videoEl.volume = e.target.value / 100; } catch (_) {} _setVol(e.target); } },
    });
    _setVol(this.#volVideoSlider);

    this.#volMusicSlider = scEl('input', {
      type: 'range', class: 'sc-vol-range',
      attrs: { min: '0', max: '100', value: '70', 'aria-label': 'Volume da música' },
      on: { input: (e) => { if (this.#playerSvc) this.#playerSvc.volume = e.target.value / 100; _setVol(e.target); } },
    });
    _setVol(this.#volMusicSlider);

    this.#volVideoRow = scEl('div', { class: 'sc-vol-row', children: [
      scEl('span', { class: 'sc-vol-icon', text: '🎬' }),
      scEl('span', { class: 'sc-vol-label', text: 'Vídeo' }),
      this.#volVideoSlider,
    ] });
    this.#volMusicRow = scEl('div', { class: 'sc-vol-row', children: [
      scEl('span', { class: 'sc-vol-icon', text: '🎵' }),
      scEl('span', { class: 'sc-vol-label', text: 'Música' }),
      this.#volMusicSlider,
    ] });

    const vol = scEl('div', { class: 'sc-stage-volumes', children: [this.#volVideoRow, this.#volMusicRow] });
    vol.hidden = true;
    return vol;
  }

  #atualizarVolumes() {
    if (!this.#stageVolumes) return;
    const temVideo  = !!this.#videoEl;
    const temMusica = !!this.#musicaSel;
    this.#stageVolumes.hidden = !temVideo;
    if (this.#volMusicRow) this.#volMusicRow.hidden = !temMusica;
  }

  // ── Texto ──────────────────────────────────────────────────

  #ehVideoAtual() {
    return this.#service?.media?.tipo === 'video';
  }

  #alternarPreviewAudio() {
    if (!this.#videoEl) return;
    if (this.#videoEl.paused) this.#reproduzirPreviewAudio();
    else this.#pausarPreviewAudio();
    this.#atualizarTempoMix();
  }

  #reproduzirPreviewAudio() {
    if (!this.#videoEl) return;
    this.#aplicarVolumePreview();
    try { const p = this.#videoEl.play?.(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    if (this.#musicaSel) {
      this.#playerSvc?.tocar(this.#musicaSel);
      this.#playerSvc?.sincronizarTempo?.(this.#videoEl.currentTime || 0);
    }
  }

  #pausarPreviewAudio() {
    try { this.#videoEl?.pause?.(); } catch (_) {}
    try { this.#playerSvc?.pausar(); } catch (_) {}
  }

  #sincronizarPreviewAudio() {
    if (!this.#videoEl || !this.#musicaSel || !this.#playerSvc?.tocando) return;
    const videoTime = Number(this.#videoEl.currentTime) || 0;
    const audioTime = Number(this.#playerSvc.currentTime) || 0;
    if (Math.abs(videoTime - audioTime) > 0.5) this.#playerSvc.sincronizarTempo?.(videoTime);
  }

  #atualizarTempoMix() {
    const atual = Number(this.#videoEl?.currentTime) || 0;
    const duracao = Number(this.#videoEl?.duration) || 30;
    const fmt = (typeof MusicPreviewController !== 'undefined' && MusicPreviewController.fmtTempo)
      ? MusicPreviewController.fmtTempo
      : ((s) => `00:${String(Math.max(0, Math.round(Number(s) || 0))).padStart(2, '0')}`);
    if (this.#mixTimeEl) this.#mixTimeEl.textContent = `${fmt(atual)} / ${fmt(Math.min(30, duracao))}`;
    if (this.#mixPlayBtn) {
      const tocando = !!this.#videoEl && !this.#videoEl.paused;
      this.#mixPlayBtn.textContent = tocando ? '⏸' : '▶';
      this.#mixPlayBtn.setAttribute('aria-label', tocando ? 'Pausar preview' : 'Tocar preview');
    }
    this.#sincronizarPreviewAudio();
  }

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
    if (this.#liveTextEl) this.#liveTextEl.hidden = true;
  }

  // ── Emoji ──────────────────────────────────────────────────

  // Dentro da .sc-stage só pode haver um modal aberto: ao abrir um, fecha o outro.
  #fecharOutrosSheetsStage(exceto) {
    if (exceto !== 'emoji'  && this.#emojiSheet && !this.#emojiSheet.hidden) this.#fecharEmojiSheet();
    if (exceto !== 'musica' && this.#musicSheet && !this.#musicSheet.hidden) this.#fecharMusicSheet();
  }

  #abrirEmojis() {
    this.#fecharOutrosSheetsStage('emoji');
    if (this.#emojiSheet) { this.#emojiSheet.hidden = false; return; }
    const grid = scEl('div', { class: 'sc-emoji-grid' });
    StoryCreationModal.EMOJIS.forEach((emoji) => {
      grid.appendChild(scEl('button', {
        class: 'sc-emoji-btn', type: 'button', text: emoji,
        dataset: { emoji }, on: { click: () => this.#escolherEmoji(emoji) },
      }));
    });
    const sheet = scEl('div', { class: 'sc-emoji-sheet', attrs: { role: 'menu' }, children: [
      this.#sheetHeader({
        title: 'Emoji',
        titleClass: 'sc-emoji-title',
        closeClass: 'sc-emoji-close',
        onClose: () => this.#fecharEmojiSheet(),
      }),
      grid,
    ] });
    this.#emojiSheet = sheet;
    this.#stageEl()?.appendChild(sheet);
  }

  #fecharEmojiSheet() {
    if (this.#emojiSheet) this.#emojiSheet.hidden = true;
  }

  #abrirFrases() {
    if (this.#frasesSheet) { this.#frasesSheet.hidden = false; return; }
    const grid = scEl('div', { class: 'sc-frase-grid' });
    // Nome da barbearia como primeira opção (se disponível)
    const frases = this.#nomeBarbearia
      ? [this.#nomeBarbearia, ...StoryCreationModal.FRASES]
      : StoryCreationModal.FRASES;
    frases.forEach((frase) => {
      grid.appendChild(scEl('button', {
        class: 'sc-frase-btn', type: 'button', text: frase,
        on: { click: () => this.#escolherFrase(frase) },
      }));
    });
    const sheet = scEl('div', { class: 'sc-frase-sheet', children: [
      this.#sheetHeader({
        title: 'Frases',
        titleClass: 'sc-frase-title',
        closeClass: 'sc-frase-close',
        onClose: () => this.#fecharFrasesSheet(),
      }),
      // Linha de cores também dentro do painel de frases
      scEl('div', { class: 'sc-text-extras', children: [
        this.#construirCores(),
        this.#criarFontBtn(),
      ] }),
      grid,
    ] });
    this.#frasesSheet = sheet;
    // Appended to overlay para cobrir sc-text-bar e sc-bottom-actions
    this.#overlayEl?.appendChild(sheet);
  }

  #fecharFrasesSheet() {
    if (this.#frasesSheet) this.#frasesSheet.hidden = true;
  }

  #escolherFrase(frase) {
    if (!frase || !this.#service) return;
    const overlay = this.#service.adicionarTexto(frase, this.#posicaoInicial());
    this.#renderOverlay(overlay);
    this.#fecharFrasesSheet();
  }

  #escolherEmoji(emoji) {
    const overlay = this.#service.adicionarEmoji(emoji, this.#posicaoInicial());
    this.#renderOverlay(overlay);
    if (this.#emojiSheet) this.#emojiSheet.hidden = true;
  }

  // ── Música ─────────────────────────────────────────────────

  #abrirMusicas() {
    this.#fecharOutrosSheetsStage('musica');
    if (this.#musicSheet) { this.#musicSheet.hidden = false; this.#abaixarVolumeVideo(); return; }
    this.#construirMusicSheet();
    this.#stageEl()?.appendChild(this.#musicSheet);
    this.#abaixarVolumeVideo();
    this.#renderGeneros();
    void this.#carregarCatalogo();
  }

  /** Monta o esqueleto do sheet: título, volume, busca, gêneros e lista. */
  #construirMusicSheet() {
    const header = this.#sheetHeader({
      title: 'Selecionar Música',
      titleClass: 'sc-music-title',
      closeClass: 'sc-music-close',
      onClose: () => this.#fecharMusicSheet(),
    });
    const _setVolPct = (el) => el.style.setProperty('--vol-pct', Number(el.value) + '%');
    const volSlider = scEl('input', {
      type: 'range',
      class: 'sc-music-vol-range',
      attrs: { min: '0', max: '100', value: '70', 'aria-label': 'Volume da música' },
      on: {
        input: (e) => {
          if (this.#playerSvc) this.#playerSvc.volume = Number(e.target.value) / 100;
          _setVolPct(e.target);
        },
      },
    });
    _setVolPct(volSlider);
    const volRow = scEl('div', { class: 'sc-music-vol-row', children: [
      scEl('span', { class: 'sc-music-vol-icon', text: '🔊' }),
      volSlider,
    ] });
    const search = scEl('input', {
      class: 'sc-music-search', type: 'search',
      placeholder: 'Pesquisar música…', attrs: { 'aria-label': 'Pesquisar música' },
      on: { input: (e) => this.#onBuscaMusica(e.target?.value ?? '') },
    });
    this.#musicGenres = scEl('div', { class: 'sc-music-genres', attrs: { role: 'tablist' } });
    this.#musicEmpty  = scEl('div', { class: 'sc-music-empty', text: 'Nenhuma música disponível.' });
    this.#musicEmpty.hidden = true;
    this.#musicList   = scEl('div', { class: 'sc-music-list' });

    this.#musicSheet = scEl('div', { class: 'sc-music-sheet', attrs: { role: 'menu' }, children: [
      header, volRow, search, this.#musicGenres, this.#musicEmpty, this.#musicList,
    ] });
    this.#onMusicScroll = () => this.#verificarScrollMusicas();
    this.#musicList.addEventListener?.('scroll', this.#onMusicScroll);
    this.#previewCtrl?.setLista(this.#musicList);
  }

  #fecharMusicSheet() {
    if (this.#musicSheet) this.#musicSheet.hidden = true;
    this.#restaurarVolumeVideo();
  }

  async #carregarCatalogo() {
    await this.#aplicarFiltroMusica();
    this.#renderGeneros();
  }

  #renderGeneros() {
    if (!this.#musicGenres) return;
    [...(this.#musicGenres.querySelectorAll?.('.sc-music-genre') ?? [])].forEach(el => el.remove());
    const generos = this.#catalogo ? this.#catalogo.generos() : ['Todos'];
    generos.forEach((g) => {
      const chip = scEl('button', {
        class: 'sc-music-genre' + (g === this.#musicState.genero ? ' is-sel' : ''),
        type: 'button', text: g, dataset: { genero: g },
        on: { click: () => this.#selecionarGenero(g) },
      });
      this.#musicGenres.appendChild(chip);
    });
  }

  #selecionarGenero(g) {
    this.#musicState.genero = g;
    [...(this.#musicGenres?.querySelectorAll?.('.sc-music-genre') ?? [])].forEach(b =>
      b.classList.toggle('is-sel', b.dataset.genero === g));
    this.#aplicarFiltroMusica();
  }

  #onBuscaMusica(valor) {
    this.#musicState.termo = String(valor ?? '');
    clearTimeout(this.#musicSearchTimer);
    this.#musicSearchTimer = setTimeout(() => this.#aplicarFiltroMusica(), 180);
  }

  async #aplicarFiltroMusica() {
    await this.#renderPaginaMusica(true);
  }

  /** Renderiza/!append a página atual; reset limpa a lista e volta à página 1. */
  async #renderPaginaMusica(reset = false) {
    if (!this.#musicList) return;
    if (reset) {
      this.#limparSentinelMusica();
      [...(this.#musicList.querySelectorAll?.('.sc-music-item') ?? [])].forEach(el => el.remove());
      this.#musicState.pagina = 1;
    } else {
      this.#limparSentinelMusica();
    }
    const { pagina } = this.#musicState;
    const page = await this.#buscarPaginaMusica(pagina).catch(() => []);
    if (reset) this.#musicState.filtrados = page;
    else this.#musicState.filtrados = [...this.#musicState.filtrados, ...page];
    if (this.#musicEmpty) this.#musicEmpty.hidden = this.#musicState.filtrados.length > 0;

    page.forEach(t => this.#musicList.appendChild(this.#itemMusica(t)));

    this.#renderSentinelMusica();
    this.#previewCtrl?.atualizarEstado();
  }

  #renderSentinelMusica() {
    if (!this.#musicList) return;
    if (!(this.#musicState.hasMore || this.#musicState.pagina < this.#musicState.totalPaginas)) return;
    this.#musicSentinel = scEl('div', { class: 'sc-music-sentinel', attrs: { 'aria-hidden': 'true' } });
    this.#musicList.appendChild(this.#musicSentinel);
    const IO = typeof IntersectionObserver !== 'undefined'
      ? IntersectionObserver
      : (typeof window !== 'undefined' ? window.IntersectionObserver : null);
    if (!IO) return;
    this.#musicObserver?.disconnect?.();
    this.#musicObserver = new IO((entries) => {
      if (entries.some(entry => entry?.isIntersecting)) this.#carregarMaisMusicas();
    }, { root: this.#musicSheet, rootMargin: '80px 0px' });
    this.#musicObserver.observe?.(this.#musicSentinel);
  }

  #limparSentinelMusica() {
    this.#musicObserver?.disconnect?.();
    this.#musicObserver = null;
    this.#musicSentinel?.remove?.();
    this.#musicSentinel = null;
  }

  #verificarScrollMusicas() {
    if (!this.#musicSheet || this.#musicLoadingMore) return;
    const limite = Number(this.#musicSheet.scrollHeight || 0) - 48;
    const posicao = Number(this.#musicSheet.scrollTop || 0) + Number(this.#musicSheet.clientHeight || 0);
    if (posicao >= limite) this.#carregarMaisMusicas();
  }

  async #carregarMaisMusicas() {
    if (this.#musicLoadingMore) return;
    if (!(this.#musicState.hasMore || this.#musicState.pagina < this.#musicState.totalPaginas)) return;
    this.#musicLoadingMore = true;
    try {
      this.#musicState.pagina += 1;
      await this.#renderPaginaMusica(false);
    } finally {
      this.#musicLoadingMore = false;
    }
  }

  async #buscarPaginaMusica(pagina) {
    if (!this.#catalogo) return [];
    if (typeof this.#catalogo.buscarPagina === 'function') {
      const result = await this.#catalogo.buscarPagina({
        genero: this.#musicState.genero,
        termo: this.#musicState.termo,
        pagina,
        pageSize: StoryCreationModal.MUSIC_PAGE,
      });
      this.#musicState.totalPaginas = result.totalPages ?? 1;
      this.#musicState.hasMore = result.hasMore === true;
      return Array.isArray(result.tracks) ? result.tracks : [];
    }
    try { await this.#catalogo.carregar(); } catch (_) { /* degrada p/ vazio */ }
    const filtrados = this.#catalogo.filtrar({ genero: this.#musicState.genero, termo: this.#musicState.termo });
    this.#musicState.totalPaginas = MusicCatalogService.totalPaginas(filtrados.length, StoryCreationModal.MUSIC_PAGE);
    this.#musicState.hasMore = pagina < this.#musicState.totalPaginas;
    return MusicCatalogService.pagina(filtrados, pagina, StoryCreationModal.MUSIC_PAGE);
  }

  #itemMusica(track) {
    const totalSeg = Math.min(MusicPlaybackState?.MAX_PREVIEW ?? 30, Number(track.duration) || 30);
    const selecionada = this.#service?.musica;
    const classe = 'sc-music-item' + (selecionada?.music_id === track.music_id ? ' is-sel' : '');
    const play = scEl('button', {
      class: 'sc-music-play', type: 'button', text: '▶',
      dataset: { musicId: track.music_id, url: track.url || '' }, attrs: { 'aria-label': 'Tocar prévia' },
      on: { click: () => this.#previewCtrl?.togglePlay(track) },
    });
    const usar = scEl('button', {
      class: 'sc-music-usar', type: 'button', text: '+',
      attrs: { 'aria-label': 'Usar música' },
      on: { click: () => this.#onUsarMusica(track) },
    });
    // Espectro: barras com altura e cadência aleatórias via CSS custom props
    const spectrum = scEl('div', { class: 'sc-music-spectrum' });
    for (let i = 0; i < 18; i++) {
      const bar = document.createElement('div');
      bar.className = 'sc-music-bar';
      bar.style.setProperty('--bar-h', (4 + Math.floor(Math.random() * 14)) + 'px');
      bar.style.setProperty('--bar-d', (0.3 + Math.random() * 0.5).toFixed(2) + 's');
      bar.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      spectrum.appendChild(bar);
    }
    return scEl('div', { class: classe, dataset: { musicId: track.music_id }, children: [
      play,
      scEl('div', { class: 'sc-music-info', children: [
        scEl('div', { class: 'sc-music-info-top', children: [
          scEl('span', { class: 'sc-music-nome', text: track.music_name || track.artist || 'Faixa' }),
          scEl('span', { class: 'sc-music-time', text: `00:00 / ${MusicPreviewController.fmtTempo(totalSeg)}` }),
        ] }),
        spectrum,
      ] }),
      usar,
    ] });
  }

  #onUsarMusica(track) {
    // Delega ao controller (seleciona + aplica preview + persiste a trilha).
    const ref = this.#selection?.usar(track);
    if (!ref) return;
    this.#musicaSel = { ...track, src: track.url || track.src || null };
    this.#previewMusicCtrl?.reattach(this.#previewEl());
    this.#previewMusicCtrl?.selectMusic(track);
    if (this.#musicSheet) {
      [...(this.#musicSheet.querySelectorAll?.('.sc-music-item') ?? [])].forEach(b =>
        b.classList.toggle('is-sel', b.dataset.musicId === track.music_id));
      this.#musicSheet.hidden = true;
    }
    this.#previewCtrl?.atualizarEstado();
    this.#atualizarVolumes();
    // Baixa automaticamente o volume do vídeo original ao adicionar música
    if (this.#videoEl && this.#volVideoSlider) {
      try { this.#videoEl.volume = 0.2; } catch (_) {}
      this.#volVideoSlider.value = '20';
      this.#volVideoSlider.style.setProperty('--vol-pct', '20%');
    }
  }

  /** Hook do MusicSelectionController: revela o mix e ajusta volumes do preview. */
  #aoAplicarMusica() {
    this.#mostrarMix(true);
    this.#aplicarVolumePreview();
    this.#atualizarVolumes();
  }

  /** Hook do MusicSelectionController: cancelar/remover música. */
  #aoCancelarMusica() {
    this.#musicaSel = null;
    this.#previewMusicCtrl?.clear();
    if (this.#mixPanel) this.#mixPanel.hidden = true;
    [...(this.#musicSheet?.querySelectorAll?.('.sc-music-item.is-sel') ?? [])].forEach(b => b.classList.remove('is-sel'));
    this.#aplicarVolumePreview();
    this.#atualizarVolumes();
    this.#previewCtrl?.atualizarEstado();
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
    if (overlay.tipo === 'texto') {
      el.style.color = this.#corTexto;
      el.style.fontFamily = this.#fonteTexto;
    }
    this.#preview.appendChild(el);
    this.#ativarGestos(el, overlay);
  }

  /**
   * Arrastar (1 dedo) + pinça (2 dedos) + long press (500 ms) para seleção.
   * Long press sem movimento significativo (< 6 px) → abre o frame de seleção
   * com alças de redimensionamento nas diagonais e botão X para apagar.
   */
  #ativarGestos(el, overlay) {
    const pts = new Map();
    let drag = null;
    let pinch = null;
    let longPressTimer = null;
    let longPressFired = false;
    let downPos = null;
    const LONG_MS = 500;
    const MOVE_PX = 6;
    const svc = this.#service;

    const onDown = (e) => {
      el.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        clearTimeout(longPressTimer); longPressTimer = null; downPos = null;
        const [a, b] = [...pts.values()];
        pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, baseEscala: overlay.escala };
        drag = null;
      } else {
        drag = { x: e.clientX, y: e.clientY, baseX: overlay.posicao.x, baseY: overlay.posicao.y };
        pinch = null;
        downPos = { x: e.clientX, y: e.clientY };
        longPressFired = false;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          downPos = null;
          longPressFired = true;
          this.#ativarSelecao(el, overlay);
        }, LONG_MS);
        this.#activeOverlayGesture = { pts, onDown };
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (longPressTimer && downPos) {
        const p = pts.get(e.pointerId);
        if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > MOVE_PX) {
          clearTimeout(longPressTimer); longPressTimer = null; downPos = null;
        }
      }
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
      // Tap rápido (timer ainda ativo + sem movimento + sem long press):
      // toggle do frame de seleção — abre se fechado, fecha se já aberto.
      const wasTap = longPressTimer !== null && !longPressFired;
      clearTimeout(longPressTimer); longPressTimer = null; downPos = null;

      if (wasTap) {
        if (this.#selectedOverlayEl === el) this.#desativarSelecao();
        else this.#ativarSelecao(el, overlay);
      }

      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) {
        const [p] = [...pts.values()];
        drag = { x: p.x, y: p.y, baseX: overlay.posicao.x, baseY: overlay.posicao.y };
      } else if (pts.size === 0) {
        drag = null;
        if (this.#activeOverlayGesture?.onDown === onDown) this.#activeOverlayGesture = null;
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
  }

  /** Ativa o frame de seleção (borda + alças + X) no overlay informado. */
  #ativarSelecao(el, overlay) {
    this.#desativarSelecao();
    this.#selectedOverlayEl = el;

    const del = scEl('button', {
      class: 'sc-ov-del', type: 'button', text: '×',
      attrs: { 'aria-label': 'Apagar' },
    });
    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#removerOverlay(el, overlay);
    });

    const corners = ['tl', 'tr', 'bl', 'br'].map(pos => {
      const c = scEl('div', { class: `sc-ov-corner sc-ov-corner--${pos}` });
      this.#ativarGestoCantoRedimensionar(c, overlay, el, pos);
      return c;
    });

    el.appendChild(scEl('div', { class: 'sc-ov-sel', children: [...corners, del] }));
  }

  /** Remove o frame de seleção do overlay atualmente selecionado. */
  #desativarSelecao() {
    if (!this.#selectedOverlayEl) return;
    this.#selectedOverlayEl.querySelector('.sc-ov-sel')?.remove();
    this.#selectedOverlayEl = null;
  }

  /** Remove o overlay do serviço e do DOM. */
  #removerOverlay(el, overlay) {
    this.#service.removerOverlay(overlay.id);
    if (this.#selectedOverlayEl === el) this.#selectedOverlayEl = null;
    el.remove();
  }

  /**
   * Gesto de redimensionamento por arrastar uma alça de canto.
   * Dragging para fora do centro → aumenta; para dentro → diminui.
   * A projeção do delta sobre o vetor diagonal do canto determina a mudança de escala.
   */
  #ativarGestoCantoRedimensionar(cornerEl, overlay, overlayEl, pos) {
    // Vetores diagonais normalizados: tl=(-1,-1)/√2, tr=(1,-1)/√2, bl=(-1,1)/√2, br=(1,1)/√2
    const DIRS = { tl: [-1, -1], tr: [1, -1], bl: [-1, 1], br: [1, 1] };
    const [dx, dy] = DIRS[pos];
    const S = Math.SQRT2;
    const ndx = dx / S, ndy = dy / S;
    const svc = this.#service;
    let capturing = false, startX = 0, startY = 0, baseEscala = 1;

    cornerEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      cornerEl.setPointerCapture?.(e.pointerId);
      capturing = true;
      startX = e.clientX; startY = e.clientY;
      baseEscala = overlay.escala;
    });

    cornerEl.addEventListener('pointermove', (e) => {
      if (!capturing) return;
      const proj = (e.clientX - startX) * ndx + (e.clientY - startY) * ndy;
      svc.redimensionarOverlay(overlay.id, baseEscala + proj * 0.018);
      overlay.aplicarTransform(overlayEl);
    });

    const onUp = () => { capturing = false; };
    cornerEl.addEventListener('pointerup', onUp);
    cornerEl.addEventListener('pointercancel', onUp);
    cornerEl.addEventListener('lostpointercapture', onUp);
  }

  #clamp(v, eixo) {
    const max = eixo === 'w' ? (this.#preview?.clientWidth || 0) : (this.#preview?.clientHeight || 0);
    if (!max) return v;
    return Math.min(max, Math.max(0, v));
  }

  // ── Finalizar / fechar ─────────────────────────────────────

  // Texto de créditos/direitos autorais da música (mesma fonte do preview:
  // MusicCreditsService) para queimar no rodapé do conteúdo. Sem música → null.
  #gerarCreditosMusica(musica, musicaSrc) {
    if (!musica || !musicaSrc) return null;
    try {
      const Svc = (typeof MusicCreditsService !== 'undefined')
        ? MusicCreditsService
        : (typeof require === 'function' ? require('./MusicCreditsService').MusicCreditsService : null);
      if (!Svc) return null;
      return new Svc().generate({
        id:         musica.id ?? musica.music_id ?? null,
        artist:     musica.artist ?? '',
        title:      musica.title ?? musica.music_name ?? '',
        music_name: musica.music_name ?? musica.title ?? '',
      });
    } catch (_) { return null; }
  }

  async #finalizar() {
    const estado = this.#service.estado;
    let estadoFinal = estado;

    if (estado.media?.tipo === 'video' && this.#mediaStatus !== 'pronto') {
      const duracaoOk = Number.isFinite(this.#videoEl?.duration) && this.#videoEl.duration > 0;
      const prontoOk = this.#videoEl?.readyState == null || this.#videoEl.readyState >= 1;
      if (duracaoOk && prontoOk) this.#marcarVideoPronto(this.#videoEl);
      else {
        this.#marcarVideoErro(this.#videoEl, 'Aguarde o video carregar ou escolha outro arquivo MP4 curto.');
        return;
      }
    }

    // Queima a mídia + overlays num único arquivo comprimido ANTES de subir.
    // Vídeo → ≤1.6MB (máx. resolução); imagem → ≤10KB (máx. qualidade possível).
    if (estado.media && estado.media.file) {
      const ehImagem = estado.media.tipo === 'imagem';
      this.#mostrarProcessando(true, ehImagem ? 'Processando imagem…' : 'Processando vídeo…');
      if (this.#finalBtn) this.#finalBtn.disabled = true;
      try {
        const musicaSrc = this.#musicaSel?.src || this.#musicaSel?.url || null;
        const file = await StoryComposer.compor({
          file: estado.media.file,
          tipo: estado.media.tipo,
          overlays: estado.overlays,
          previewW: this.#preview?.clientWidth || 0,
          previewH: this.#preview?.clientHeight || 0,
          targetBytes: ehImagem ? StoryComposer.ALVO_IMG : (1.6 * 1024 * 1024),
          maxSeconds: 30,
          musica: estado.musica,
          musicaSrc,
          audioMix: estado.audioMix,
          // Créditos de direitos autorais da música — queimados no rodapé do conteúdo.
          // Usa a faixa CRUA (#musicaSel, com artist/title) — estado.musica é
          // normalizado e não carrega esses campos.
          creditos: this.#gerarCreditosMusica(this.#musicaSel || estado.musica, musicaSrc),
        });
        estadoFinal = { ...estado, media: { ...estado.media, file } };
      } catch (_) {
        estadoFinal = estado; // qualquer erro → arquivo atual (não quebra)
      } finally {
        this.#mostrarProcessando(false);
        if (this.#finalBtn) this.#finalBtn.disabled = false;
      }
    }

    const r = this.#onFinalizar(estadoFinal);
    if (r && typeof r.then === 'function') { try { await r; } catch (_) { /* erro tratado pelo caller */ } }
    this.fechar();
  }

  fechar() {
    if (this.#onKeydown) {
      document.removeEventListener('keydown', this.#onKeydown);
      this.#onKeydown = null;
    }
    try { clearTimeout(this.#musicSearchTimer); } catch (_) {}
    try { this.#musicList?.removeEventListener?.('scroll', this.#onMusicScroll); } catch (_) {}
    this.#onMusicScroll = null;
    this.#limparSentinelMusica();
    this.#pausarPreviewAudio();
    try { this.#playerSvc?.destruir(); } catch (_) {} // libera o <audio> da prévia (mantém a seleção no service)
    try { this.#previewMusicCtrl?.destroy(); } catch (_) {}
    this.#limparPreviewMedia();
    try { this.#overlayEl?.remove(); } catch (_) { /* mock */ }
    this.#overlayEl = null;
    if (StoryCreationModal.#instancia === this) StoryCreationModal.#instancia = null;
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StoryCreationModal, UploadMediaSource, CameraMediaSource, CameraRecorder, VideoCompressor, MediaSourceArquivo, OverlayPainter, StoryComposer };
}
