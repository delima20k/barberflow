'use strict';

/**
 * BarberFlow — Componente BarberPole
 *
 * Polo giratório animado com cores do sistema.
 * Auto-injeta a fonte Rye (Google Fonts) se não estiver presente.
 *
 * Uso:
 *   <div id="meu-polo"></div>
 *
 *   const polo = new BarberPole(document.getElementById('meu-polo'));
 *   polo.parar();    // pausa a animação
 *   polo.iniciar();  // retoma a animação
 *   polo.destruir(); // remove completamente do DOM
 */
class BarberPole {

  // ── Configuração ────────────────────────────────────────────
  // Cores do sistema intercaladas com branco: ouro, branco, marrom, branco, preto, branco, vermelho, branco
  static #CORES_FALLBACK = ['#D4AF37', '#FFFFFF', '#5C3317', '#FFFFFF', '#1a0800', '#FFFFFF', '#8B2500', '#FFFFFF'];
  static #CICLO    = 800;  // 8 cores × 100px — período completo
  static #PASSO    = 4;    // pixels avançados por frame (velocidade)
  static #MS_FRAME = 20;   // ~50fps — balanceado para mobile/TWA

  // ── Estado privado ──────────────────────────────────────────
  #container  = null;
  #campo      = null;
  #svg        = null;
  #frame      = 0;
  #animId     = null;
  #tsAnterior = 0;

  /**
   * @param {HTMLElement} container — elemento que receberá o polo
   */
  constructor(container) {
    this.#container = container;
    this.#carregarFonte();
    this.#montar();
    this.iniciar();
  }

  // ── Fonte ────────────────────────────────────────────────────
  #carregarFonte() {
    if (document.querySelector('link[href*="Rye"]')) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Rye&display=swap';
    document.head.appendChild(link);
  }

  // ── Montagem do DOM ──────────────────────────────────────────
  #montar() {
    this.#container.classList.add('barber-pole');
    this.#container.innerHTML = `
      <div class="bp-globo"></div>
      <div class="bp-topo">
        <span class="bp-nome">BarberFlow</span>
      </div>
      <div class="bp-aro"></div>
      <div class="bp-campo"></div>
      <div class="bp-base-med"></div>
      <div class="bp-base"></div>
    `;
    this.#campo = this.#container.querySelector('.bp-campo');
    this.#svg   = this.#mkSVG();
    this.#campo.appendChild(this.#svg);
  }

  #mkSVG() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width',             '200');
    s.setAttribute('height',            '400');
    s.setAttribute('viewBox',           '0 0 200 400');
    s.setAttribute('preserveAspectRatio', 'none');
    return s;
  }

  #obterCores() {
    const css = getComputedStyle(document.documentElement);
    const ler = (token, fallback) => {
      const valor = css.getPropertyValue(token).trim();
      return valor || fallback;
    };

    return [
      ler('--gold', BarberPole.#CORES_FALLBACK[0]),
      '#FFFFFF',
      ler('--wood-1', BarberPole.#CORES_FALLBACK[2]),
      '#FFFFFF',
      ler('--wood-darker', BarberPole.#CORES_FALLBACK[4]),
      '#FFFFFF',
      '#8B2500',
      '#FFFFFF',
    ];
  }

  // ── Render de um frame ───────────────────────────────────────
  #render() {
    const svg   = this.#svg;
    const f     = this.#frame;
    const cores = this.#obterCores();

    // Limpa SVG de forma eficiente
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Faixas diagonais — angulo ~30° (tan30° × 200 ≈ 115px)
    const OFF = -115;
    for (let i = -10; i < 20; i++) {
      const y1  = i * 100 + f;
      const cor = cores[((i % 8) + 8) % 8];
      const p   = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', cor);
      p.setAttribute('d',
        `M0,${y1} L200,${y1+OFF} L200,${y1+100+OFF} L0,${y1+100} Z`
      );
      svg.appendChild(p);
    }
  }

  #mkTexto(x, y, char, cor, fonte, size) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x',           x);
    t.setAttribute('y',           y);
    t.setAttribute('fill',        cor);
    t.setAttribute('font-family', fonte);
    t.setAttribute('font-weight', 'bold');
    t.setAttribute('font-size',   size);
    t.setAttribute('transform',   `rotate(-30 ${x} ${y})`);
    t.textContent = char;
    return t;
  }

  // ── Loop de animação — requestAnimationFrame + throttle ──────
  iniciar() {
    this.parar();
    this.#render();

    const loop = (ts) => {
      this.#animId = requestAnimationFrame(loop);
      if (ts - this.#tsAnterior < BarberPole.#MS_FRAME) return;
      this.#tsAnterior = ts;
      this.#frame = (this.#frame + BarberPole.#PASSO) % BarberPole.#CICLO;
      this.#render();
    };

    this.#animId = requestAnimationFrame(loop);
  }

  parar() {
    if (this.#animId) {
      cancelAnimationFrame(this.#animId);
      this.#animId = null;
    }
  }

  destruir() {
    this.parar();
    this.#container.innerHTML = '';
    this.#container.classList.remove('barber-pole');
  }
}
