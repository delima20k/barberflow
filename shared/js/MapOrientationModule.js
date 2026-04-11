'use strict';

// =================================================================
// MapOrientationModule.js — Bússola e orientação do mapa (POO)
//
// Classes:
//   DeviceCompass          — abstrai DeviceOrientationEvent (iOS + Android)
//   MapRotationController  — rotaciona .mapa-container, contra-roda controles
//   MapOrientationUI       — botão bússola + display de heading
//   MapOrientationModule   — orquestrador (static init)
//
// Requer:
//   MapWidget.js  → getMap(), setUserHeading(), clearUserHeading()
//   map-panel.css → estilos .moc-toolbar, .mapa-heading-arrow
//
// NÃO altera: Router.js, animações de abas, qualquer outra lógica.
// =================================================================

// ─────────────────────────────────────────────────────────────────
// 1. DeviceCompass — abstração do sensor de orientação
// ─────────────────────────────────────────────────────────────────

class DeviceCompass {
  #onHeadingCb = null;
  #lastHeading = null;
  #listening   = false;
  #hasAbsolute = false;   // Android envia `deviceorientationabsolute` (melhor)
  #boundHandler;

  constructor() {
    this.#boundHandler = this.#handleEvent.bind(this);
  }

  // ── Queries ──────────────────────────────────────────────────

  get isAvailable() {
    return typeof DeviceOrientationEvent !== 'undefined'
        && typeof window.ondeviceorientation !== 'undefined';
  }

  /** iOS 13+ exige requestPermission(). Android não. */
  get needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  // ── API pública ───────────────────────────────────────────────

  async requestPermission() {
    if (this.needsPermission) {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        return result === 'granted';
      } catch {
        return false;
      }
    }
    return true; // Android: sempre concedido
  }

  /** Registra callback de heading. @param {Function} cb — (degrees:number)=>{} */
  onHeading(cb) { this.#onHeadingCb = cb; }

  /** Começa a escutar os eventos de orientação. */
  start() {
    if (this.#listening) return;
    this.#listening = true;
    // Prefere `deviceorientationabsolute` (Android, calibrado) sobre relativo
    window.addEventListener('deviceorientationabsolute', this.#boundHandler, { passive: true });
    window.addEventListener('deviceorientation',         this.#boundHandler, { passive: true });
  }

  /** Para de escutar. */
  stop() {
    this.#listening  = false;
    this.#hasAbsolute = false;
    this.#lastHeading = null;
    window.removeEventListener('deviceorientationabsolute', this.#boundHandler);
    window.removeEventListener('deviceorientation',         this.#boundHandler);
  }

  // ── Privado ───────────────────────────────────────────────────

  #handleEvent(e) {
    // Se já recebemos eventos absolute, ignorar os relativos
    if (e.type === 'deviceorientationabsolute') {
      this.#hasAbsolute = true;
    } else if (this.#hasAbsolute) {
      return;
    }

    let heading = null;

    // iOS: webkitCompassHeading (0=Norte, sentido horário) — mais preciso
    if (e.webkitCompassHeading != null) {
      heading = e.webkitCompassHeading;
    }
    // Android absolute: alpha (0=Norte, anti-horário) → converter
    else if (e.absolute === true && e.alpha != null) {
      heading = (360 - e.alpha) % 360;
    }
    // Fallback relativo
    else if (e.alpha != null) {
      heading = (360 - e.alpha) % 360;
    }

    if (heading == null) return;
    heading = Math.round(heading);

    // Dead zone: só dispara se mudou >= 2°
    if (this.#lastHeading != null) {
      let delta = Math.abs(heading - this.#lastHeading);
      if (delta > 180) delta = 360 - delta;
      if (delta < 2) return;
    }

    this.#lastHeading = heading;
    if (this.#onHeadingCb) this.#onHeadingCb(heading);
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. MapRotationController — rotaciona o container do mapa
// ─────────────────────────────────────────────────────────────────

class MapRotationController {
  #mapaContainer    = null;  // #mapa-container (o div que envolve o Leaflet)
  #leafletContainer = null;  // .leaflet-container (raiz do Leaflet)
  #controls         = null;  // .leaflet-control-container (zoom +/-)
  #fab              = null;  // #mapa-gps-fab
  #active           = false;

  /**
   * @param {string} containerId — id do .mapa-container
   * @param {Object|null} leafletMap — instância Leaflet Map
   */
  constructor(containerId, leafletMap) {
    this.#mapaContainer    = document.getElementById(containerId);
    this.#leafletContainer = leafletMap?.getContainer() ?? null;
    this.#resolveRefs();
  }

  enable() {
    if (!this.#mapaContainer) return;
    this.#active = true;
    // Fundo escuro para não mostrar branco nos cantos ao rotacionar
    this.#mapaContainer.style.background = '#111a22';
    this.#mapaContainer.style.overflow   = 'hidden';
  }

  disable() {
    this.#active = false;
    this.#reset();
  }

  /**
   * Aplica rotação ao container do mapa e contra-roda os elementos UI.
   * @param {number} degrees — heading absoluto 0-360
   */
  setHeading(degrees) {
    if (!this.#active || !this.#mapaContainer) return;

    // Re-resolve FAB (pode ter sido criado após instanciar o Controller)
    this.#resolveRefs();

    const ease = 'transform 150ms ease-out';

    // ── Rota o container inteiro (tiles + marcadores + FAB giram juntos)
    this.#mapaContainer.style.transition      = ease;
    this.#mapaContainer.style.transformOrigin = 'center center';
    this.#mapaContainer.style.transform       = `rotate(${-degrees}deg)`;

    // ── Contra-roda os controles do Leaflet (zoom +/-) para ficarem retos
    if (this.#controls) {
      this.#controls.style.transition      = ease;
      this.#controls.style.transformOrigin = 'center center';
      this.#controls.style.transform       = `rotate(${degrees}deg)`;
    }

    // ── Contra-roda o FAB para ficar reto
    if (this.#fab) {
      this.#fab.style.transition   = ease;
      this.#fab.style.transform    = `rotate(${degrees}deg)`;
    }
  }

  // ── Privado ───────────────────────────────────────────────────

  #resolveRefs() {
    if (this.#leafletContainer) {
      this.#controls = this.#leafletContainer.querySelector('.leaflet-control-container');
    }
    if (this.#mapaContainer && !this.#fab) {
      this.#fab = this.#mapaContainer.querySelector('#mapa-gps-fab');
    }
  }

  #reset() {
    if (!this.#mapaContainer) return;
    const ease = 'transform 300ms ease-out';

    this.#mapaContainer.style.transition = ease;
    this.#mapaContainer.style.transform  = 'rotate(0deg)';

    if (this.#controls) {
      this.#controls.style.transition = ease;
      this.#controls.style.transform  = 'rotate(0deg)';
    }
    if (this.#fab) {
      this.#fab.style.transition = ease;
      this.#fab.style.transform  = 'rotate(0deg)';
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// 3. MapOrientationUI — botão bússola + display de heading
// ─────────────────────────────────────────────────────────────────

class MapOrientationUI {
  #btn        = null;
  #headingEl  = null;
  #onToggle   = null;
  #active     = false;

  /**
   * @param {HTMLElement} parentEl — elemento onde injetar a toolbar (ex: #map-panel)
   * @param {Function}    onToggle — called onToggle(active:bool)
   */
  constructor(parentEl, onToggle) {
    this.#onToggle = onToggle;
    this.#inject(parentEl);
  }

  setActive(active) {
    this.#active = active;
    this.#btn?.classList.toggle('ativo', active);
    this.#btn?.setAttribute('aria-pressed', String(active));

    if (this.#btn) {
      const label = this.#btn.querySelector('.moc-btn-label');
      if (label) label.textContent = active ? 'Bússola ON' : 'Bússola';
    }

    if (!active && this.#headingEl) {
      this.#headingEl.textContent = '';
    }
  }

  /**
   * Atualiza o display de heading (ex: "NE 47°").
   * @param {number} degrees
   */
  updateHeading(degrees) {
    if (!this.#headingEl || !this.#active) return;
    const cardinal = MapOrientationUI.#toCardinal(degrees);
    this.#headingEl.textContent = `${cardinal} ${Math.round(degrees)}°`;
  }

  // ── Privado ───────────────────────────────────────────────────

  #inject(parent) {
    const toolbar = document.createElement('div');
    toolbar.className = 'moc-toolbar';
    toolbar.innerHTML = `
      <button type="button" class="moc-btn" id="map-compass-btn"
              aria-pressed="false"
              aria-label="Ativar bússola: rotaciona o mapa conforme a direção do celular">
        <svg class="moc-btn-svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <!-- Círculo externo -->
          <circle cx="12" cy="12" r="9"/>
          <!-- Ponta Norte (sólida) -->
          <path d="M12 3 L14.5 10 L12 9 L9.5 10 Z" fill="currentColor" stroke="none"/>
          <!-- Ponta Sul (vazia) -->
          <path d="M12 21 L9.5 14 L12 15 L14.5 14 Z"/>
        </svg>
        <span class="moc-btn-label">Bússola</span>
      </button>
      <span class="moc-heading-text" id="map-heading-text" aria-live="polite"></span>
    `;

    parent.appendChild(toolbar);

    this.#btn       = toolbar.querySelector('#map-compass-btn');
    this.#headingEl = toolbar.querySelector('#map-heading-text');

    this.#btn.addEventListener('click', () => {
      this.#active = !this.#active;
      this.setActive(this.#active);
      if (this.#onToggle) this.#onToggle(this.#active);
    });
  }

  /**
   * Converte graus em ponto cardeal em PT-BR.
   * @param {number} deg
   * @returns {string}
   */
  static #toCardinal(deg) {
    const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round((deg % 360) / 45) % 8];
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. MapOrientationModule — orquestrador principal
// ─────────────────────────────────────────────────────────────────

class MapOrientationModule {
  static #compass   = null;
  static #rotation  = null;
  static #ui        = null;
  static #initiated = false;

  /**
   * Inicializa o módulo. Deve ser chamado no DOMContentLoaded,
   * após MapWidget.init() e MapPanel.init().
   *
   * @param {string} containerId — id do .mapa-container  (default: 'mapa-container')
   * @param {string} panelId     — id do .mpp-panel       (default: 'map-panel')
   */
  static init(containerId = 'mapa-container', panelId = 'map-panel') {
    if (MapOrientationModule.#initiated) return;

    const panel = document.getElementById(panelId);
    if (!panel) return; // map panel não existe nesta página

    MapOrientationModule.#initiated = true;
    MapOrientationModule.#compass   = new DeviceCompass();

    // Sensor indisponível (desktop sem sensor) — não injetar toolbar
    if (!MapOrientationModule.#compass.isAvailable) return;

    // Injeta toolbar com botão bússola dentro do #map-panel
    MapOrientationModule.#ui = new MapOrientationUI(panel, async (activate) => {
      if (activate) {
        await MapOrientationModule.#ativar(containerId);
      } else {
        MapOrientationModule.#desativar();
      }
    });
  }

  // ── Privado ───────────────────────────────────────────────────

  static async #ativar(containerId) {
    const compass = MapOrientationModule.#compass;

    // Solicitar permissão (iOS 13+ exige toque do usuário)
    const granted = await compass.requestPermission();

    if (!granted) {
      MapOrientationModule.#ui?.setActive(false);
      // Toast não-bloqueante em vez de alert
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Bússola bloqueada',
          'Permissão de orientação negada. Verifique as configurações do dispositivo.',
          'sistema'
        );
      }
      return;
    }

    // O mapa fica sempre com Norte para cima.
    // Apenas a seta no marcador do usuário gira conforme o heading do celular.
    compass.onHeading(heading => {
      MapOrientationModule.#ui?.updateHeading(heading);
      if (typeof MapWidget !== 'undefined') {
        MapWidget.setUserHeading(heading);
      }
    });

    compass.start();
  }

  static #desativar() {
    MapOrientationModule.#compass?.stop();

    if (typeof MapWidget !== 'undefined') {
      MapWidget.clearUserHeading();
    }
  }
}
