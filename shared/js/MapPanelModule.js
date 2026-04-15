'use strict';

// =================================================================
// MapPanelModule.js — Módulo de mapa expansível premium (POO)
//
// Classes:
//   MapTextAnimation  — animação de opacidade letra por letra
//   MapHandleButton   — botão controle (traço + texto + seta)
//   MapDragHandle     — arraste para expandir
//   MapBorderFrame    — frame amadeirado (show/hide)
//   MapPanel          — orquestrador principal (export global)
//
// NÃO altera: MapWidget, NearbyBarbershopsWidget, GeoService, Router.
// =================================================================

// ─────────────────────────────────────────────────────────────────
// 1. MapTextAnimation
// ─────────────────────────────────────────────────────────────────

class MapTextAnimation {
  /** @param {HTMLElement} container — elemento .mph-text */
  constructor(container) {
    this._el = container;
    this._chars = [];
    this._building = false;
    this._buildSpans();
  }

  /** Quebra o texto em <span class="mta-char"> individuais */
  _buildSpans() {
    const text = this._el.textContent.trim();
    this._el.textContent = '';
    this._chars = [...text].map(ch => {
      const span = document.createElement('span');
      span.className    = 'mta-char';
      span.textContent  = ch;
      span.setAttribute('aria-hidden', 'true');
      this._el.appendChild(span);
      return span;
    });
    // Texto acessível via aria-label no container
    this._el.setAttribute('aria-label', text);
    this._el.setAttribute('aria-live', 'polite');
  }

  /**
   * Oculta os caracteres da esquerda para a direita, sincronizando
   * com a progressão do traço (0.0 a 1.0).
   * @param {number} progress — 0 = nada oculto, 1 = tudo oculto
   */
  setProgress(progress) {
    const count  = this._chars.length;
    const limiar = Math.round(progress * count);
    this._chars.forEach((span, i) => {
      if (i < limiar) {
        span.classList.add('mta-oculto');
      } else {
        span.classList.remove('mta-oculto');
      }
    });
  }

  /**
   * Oculta letra por letra (esq→dir) em ~320ms total, então chama cb.
   * @param {Function} [cb]
   */
  animateOut(cb) {
    const count   = this._chars.length;
    const delay   = Math.min(30, Math.floor(300 / count));
    this._chars.forEach((span, i) => {
      setTimeout(() => {
        span.classList.add('mta-saindo');
        if (i === count - 1 && cb) setTimeout(cb, 80);
      }, i * delay);
    });
  }

  /**
   * Mostra letra por letra (esq→dir) em ~320ms total.
   * @param {Function} [cb]
   */
  animateIn(cb) {
    const count   = this._chars.length;
    const delay   = Math.min(30, Math.floor(300 / count));
    this._chars.forEach((span, i) => {
      // Remove estado de ocultação sincronizada primeiro
      span.classList.remove('mta-oculto');
      setTimeout(() => {
        span.classList.remove('mta-saindo');
        if (i === count - 1 && cb) setTimeout(cb, 80);
      }, i * delay);
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. MapHandleButton
// ─────────────────────────────────────────────────────────────────

class MapHandleButton {
  /**
   * @param {HTMLButtonElement} btn — .mph-wrapper
   * @param {Function} onToggle — called onToggle(open:bool)
   */
  constructor(btn, onToggle) {
    this._btn      = btn;
    this._bar      = btn.querySelector('.mph-bar');
    this._textEl   = btn.querySelector('.mph-text');
    this._anim     = this._textEl ? new MapTextAnimation(this._textEl) : null;
    this._open     = false;
    this._locked   = false;

    btn.addEventListener('click', () => {
      if (this._locked) return;
      this._open = !this._open;
      onToggle(this._open);
    });
  }

  /**
   * Sincroniza visualmente o botão com o estado do painel.
   * @param {boolean} open
   * @param {boolean} [animated=true]
   */
  setOpen(open, animated = true) {
    this._open = open;
    this._btn.setAttribute('aria-expanded', String(open));

    // Expande/retrai o traço
    if (open) {
      this._btn.classList.remove('mph-text-reveal');
      this._expandBar();
      if (animated && this._anim) this._anim.animateOut();
    } else {
      this._retractBar();
      this._triggerTextRevealOutline();
      if (animated && this._anim) this._anim.animateIn();
    }
  }

  /** Bloqueia cliques durante animação */
  lock()   { this._locked = true; }
  unlock() { this._locked = false; }

  _expandBar() {
    if (!this._bar) return;
    // Lê largura do container para expandi bar 100%
    requestAnimationFrame(() => {
      const trackW = this._btn.offsetWidth;
      this._bar.style.width = trackW + 'px';
    });
  }

  _retractBar() {
    if (!this._bar) return;
    this._bar.style.width = '48px';
  }

  _triggerTextRevealOutline() {
    this._btn.classList.remove('mph-text-reveal');
    // Reinicia a animação para disparar em toda reabertura do texto.
    void this._btn.offsetWidth;
    this._btn.classList.add('mph-text-reveal');
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. MapBorderFrame
// ─────────────────────────────────────────────────────────────────

class MapBorderFrame {
  /** @param {HTMLElement} frame — .mpf-frame */
  constructor(frame) {
    this._frame = frame;
  }

  show() {
    this._frame.style.display = 'block';
    // Força reflow para a transição de height funcionar
    void this._frame.offsetHeight;
    this._frame.classList.add('mpf-visivel');
    this._frame.removeAttribute('aria-hidden');
  }

  hide() {
    this._frame.classList.remove('mpf-visivel');
    this._frame.setAttribute('aria-hidden', 'true');
    // Aguarda transição antes de display:none
    this._frame.addEventListener('transitionend', () => {
      if (!this._frame.classList.contains('mpf-visivel')) {
        this._frame.style.display = 'none';
      }
    }, { once: true });
  }

  setState(state) {
    this._frame.dataset.state = state; // 'closed' | 'semiopen' | 'open'
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. MapDragHandle
// ─────────────────────────────────────────────────────────────────

class MapDragHandle {
  /**
   * @param {HTMLElement} handle  — .mpd-handle
   * @param {Function}    onDrag  — called onDrag(newHeight:number)
   * @param {Function}    onRelease — called onRelease(finalHeight:number)
   * @param {{min:number, max:number}} bounds
   */
  constructor(handle, onDrag, onRelease, bounds) {
    this._handle    = handle;
    this._onDrag    = onDrag;
    this._onRelease = onRelease;
    this._bounds    = bounds;
    this._dragging  = false;
    this._startY    = 0;
    this._startH    = 0;

    this._bindEvents();
  }

  _bindEvents() {
    // Touch
    this._handle.addEventListener('touchstart', e => this._start(e.touches[0].clientY), { passive: true });
    this._handle.addEventListener('touchmove',  e => this._move(e.touches[0].clientY),  { passive: true });
    this._handle.addEventListener('touchend',   e => this._end(e.changedTouches[0].clientY));

    // Mouse (desktop)
    this._handle.addEventListener('mousedown', e => {
      this._start(e.clientY);
      const onMove = ev => this._move(ev.clientY);
      const onUp   = ev => { this._end(ev.clientY); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _start(y) {
    this._dragging = true;
    this._startY   = y;
    // Pega altura atual do painel
    const panel = this._handle.closest('.mpf-frame')?.querySelector('.mpp-panel');
    this._startH = panel ? panel.offsetHeight : 0;
    this._handle.classList.add('mpd-arrastando');
  }

  _move(y) {
    if (!this._dragging) return;
    const delta  = y - this._startY;       // positivo = arraste para baixo
    const newH   = Math.max(this._bounds.min, Math.min(this._bounds.max, this._startH + delta));
    this._onDrag(newH);
  }

  _end(y) {
    if (!this._dragging) return;
    this._dragging = false;
    this._handle.classList.remove('mpd-arrastando');
    const delta  = y - this._startY;
    const finalH = Math.max(this._bounds.min, Math.min(this._bounds.max, this._startH + delta));
    this._onRelease(finalH);
  }
}

// ─────────────────────────────────────────────────────────────────
// 5. MapPanel — orquestrador
// ─────────────────────────────────────────────────────────────────

class MapPanel {
  // Alturas dos estados (px)
  static #H_SEMI = 230;
  static #H_FULL = Math.min(420, Math.round(window.innerHeight * 0.62));

  /**
   * Factory — inicializa o módulo a partir do id da section.
   * Idempotente: segunda chamada é ignorada.
   * @param {string} sectionId
   */
  static init(sectionId = 'section-mapa') {
    const section = document.getElementById(sectionId);
    if (!section || section.dataset.mapPanelInit) return;
    section.dataset.mapPanelInit = '1';
    new MapPanel(section);
  }

  /** @param {HTMLElement} section */
  constructor(section) {
    this._section   = section;
    this._state     = 'closed'; // 'closed' | 'semiopen' | 'open'

    // Referências DOM
    this._btn       = section.querySelector('.mph-wrapper');
    this._panel     = section.querySelector('.mpp-panel');
    this._frame     = section.querySelector('.mpf-frame');
    this._dragEl    = section.querySelector('.mpd-handle');

    if (!this._btn || !this._panel || !this._frame) {
      console.warn('[MapPanel] Estrutura HTML incompleta na section#' + section.id);
      return;
    }

    // Sub-componentes
    this._handle = new MapHandleButton(this._btn, open => {
      if (open) this.open();
      else      this.close();
    });

    this._border = new MapBorderFrame(this._frame);

    if (this._dragEl) {
      this._drag = new MapDragHandle(
        this._dragEl,
        h => this._onDrag(h),
        h => this._snapToState(h),
        { min: MapPanel.#H_SEMI, max: MapPanel.#H_FULL }
      );
    }

    // Inicia fechado
    this._panel.style.height    = '0px';
    this._panel.style.overflow  = 'hidden';
    this._frame.style.display   = 'none';
    this._frame.setAttribute('aria-hidden', 'true');
    this._btn.setAttribute('aria-expanded', 'false');
    section.classList.add('map-panel-section');
  }

  // ── Estado: ABRIR (fecha → semiopen) ──────────────────────────

  open() {
    if (this._state !== 'closed') return;
    this._handle.lock();

    // 1. Mostra o frame
    this._border.show();
    this._border.setState('semiopen');

    // 2. Anima painel de 0 → semiopen
    requestAnimationFrame(() => {
      this._panel.style.height = MapPanel.#H_SEMI + 'px';
    });

    // 3. Sincroniza botão
    this._handle.setOpen(true);

    // 4. Notifica Leaflet após animação
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 310);

    this._state = 'semiopen';

    setTimeout(() => this._handle.unlock(), 350);
  }

  // ── Estado: EXPANDIR (semiopen → open) ────────────────────────

  expand() {
    if (this._state === 'closed') return;
    this._panel.style.height = MapPanel.#H_FULL + 'px';
    this._border.setState('open');
    this._state = 'open';

    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 310);
  }

  // ── Estado: FECHAR (semiopen|open → closed) ───────────────────

  close() {
    if (this._state === 'closed') return;
    this._handle.lock();

    // Anima painel para 0
    this._panel.style.height = '0px';

    // Sincroniza botão
    this._handle.setOpen(false);

    // Oculta frame após animação
    setTimeout(() => {
      this._border.hide();
      this._border.setState('closed');
      this._state = 'closed';
      this._handle.unlock();
    }, 310);
  }

  // ── Drag logic ────────────────────────────────────────────────

  _onDrag(height) {
    // Atualiza altura sem transição (fluido)
    this._panel.style.transition = 'none';
    this._panel.style.height     = height + 'px';
  }

  _snapToState(finalH) {
    // Restaura transição para snap
    this._panel.style.transition = '';

    const mid = (MapPanel.#H_SEMI + MapPanel.#H_FULL) / 2;

    if (finalH >= mid) {
      this.expand();
    } else if (finalH >= MapPanel.#H_SEMI - 40) {
      // Snap para semiopen
      this._panel.style.height = MapPanel.#H_SEMI + 'px';
      this._border.setState('semiopen');
      this._state = 'semiopen';
    } else {
      // Fecha se arrastar muito para cima
      this.close();
      this._handle.setOpen(false);
    }
  }
}
