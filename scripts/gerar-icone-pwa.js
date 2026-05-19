'use strict';
// Gera icon-512.png e icon-192.png para o PWA
// Fundo escuro #0a0a0a + glow dourado radial + Logo01.png centralizado

const { Jimp } = require('jimp');
const path = require('path');

// =============================================================
// IconGenerator — Gera ícones PWA com glow dourado (POO)
// =============================================================
class IconGenerator {

  static #LOGO    = path.join(__dirname, '../shared/img/Logo01.png');
  static #OUT_512 = path.join(__dirname, '../shared/img/icon-512.png');
  static #OUT_192 = path.join(__dirname, '../shared/img/icon-192.png');

  /**
   * Gera um ícone PWA com fundo escuro e glow dourado radial.
   * @param {number} tamanho — dimensão (px)
   * @param {string} saida   — caminho de saída
   */
  static async gerar(tamanho, saida) {
    // 1. Fundo escuro
    const base = new Jimp({ width: tamanho, height: tamanho, color: 0x0a0a0aff });
    const cx   = tamanho / 2;
    const cy   = tamanho / 2;
    const raio = tamanho * 0.44;

    // 2. Glow dourado radial (pixel a pixel) — pico no centro, some nas bordas
    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        const dist  = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const t     = Math.max(0, 1 - dist / raio);
        const alpha = t * t * 0.72; // suave — máx 72% de opacidade
        if (alpha > 0) {
          const idx = (y * tamanho + x) * 4;
          const br  = base.bitmap.data[idx];
          const bg  = base.bitmap.data[idx + 1];
          const bb  = base.bitmap.data[idx + 2];
          // Blend: dourado #D4AF37 (212, 175, 55)
          base.bitmap.data[idx]     = Math.round(212 * alpha + br * (1 - alpha));
          base.bitmap.data[idx + 1] = Math.round(175 * alpha + bg * (1 - alpha));
          base.bitmap.data[idx + 2] = Math.round(55  * alpha + bb * (1 - alpha));
        }
      }
    }

    // 3. Logo centralizado ocupando 68% do tamanho
    const logo  = await Jimp.read(IconGenerator.#LOGO);
    const logoW = Math.round(tamanho * 0.68);
    logo.resize({ w: logoW });
    const lx = Math.round((tamanho - logo.bitmap.width)  / 2);
    const ly = Math.round((tamanho - logo.bitmap.height) / 2);
    base.composite(logo, lx, ly);

    await base.write(saida);
    console.log('✅ Gerado:', path.basename(saida), `(${tamanho}x${tamanho})`);
  }

  /** Ponto de entrada — gera os dois tamanhos obrigatórios para PWA. */
  static async run() {
    await IconGenerator.gerar(512, IconGenerator.#OUT_512);
    await IconGenerator.gerar(192, IconGenerator.#OUT_192);
  }
}

/* ── Ponto de entrada ─────────────────────────────────────── */
IconGenerator.run().catch(err => console.error('❌', err.message));
