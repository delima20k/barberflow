'use strict';
// Gera ícones PWA com fundo claro + Logo01.png para cada app.
// Saída: shared/img/icon-192-cliente.png, icon-512-cliente.png,
//        shared/img/icon-192-pro.png,     icon-512-pro.png

const { Jimp } = require('jimp');
const path     = require('path');
const IMG_DIR  = path.join(__dirname, '../shared/img');

// =============================================================
// AppIconGenerator — Fundo creme claro, glow dourado, logo BF
// =============================================================
class AppIconGenerator {

  static #LOGO = path.join(IMG_DIR, 'Logo01.png');

  /**
   * Gera um ícone PWA com fundo claro e glow dourado radial.
   * @param {number} tamanho
   * @param {string} saida
   */
  static async gerar(tamanho, saida) {
    // Fundo creme claro (#F5EDD8)
    const base = new Jimp({ width: tamanho, height: tamanho, color: 0xF5EDD8ff });

    const cx   = tamanho / 2;
    const cy   = tamanho / 2;
    const raio = tamanho * 0.46;

    // Glow dourado suave ao centro
    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        const dist  = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const t     = Math.max(0, 1 - dist / raio);
        const alpha = t * t * 0.35; // suave — max 35% blend
        if (alpha > 0) {
          const idx = (y * tamanho + x) * 4;
          const br  = base.bitmap.data[idx];
          const bg  = base.bitmap.data[idx + 1];
          const bb  = base.bitmap.data[idx + 2];
          // Blend dourado #D4AF37 (212, 175, 55)
          base.bitmap.data[idx]     = Math.round(212 * alpha + br * (1 - alpha));
          base.bitmap.data[idx + 1] = Math.round(175 * alpha + bg * (1 - alpha));
          base.bitmap.data[idx + 2] = Math.round(55  * alpha + bb * (1 - alpha));
        }
      }
    }

    // Logo centralizado ocupando 70% do tamanho
    const logo  = await Jimp.read(AppIconGenerator.#LOGO);
    const logoW = Math.round(tamanho * 0.70);
    logo.resize({ w: logoW });
    const lx = Math.round((tamanho - logo.bitmap.width)  / 2);
    const ly = Math.round((tamanho - logo.bitmap.height) / 2);
    base.composite(logo, lx, ly);

    await base.write(saida);
    console.log('✅ Gerado:', path.basename(saida), `(${tamanho}x${tamanho})`);
  }

  static async run() {
    const apps = ['cliente', 'pro'];
    for (const app of apps) {
      await AppIconGenerator.gerar(512, path.join(IMG_DIR, `icon-512-${app}.png`));
      await AppIconGenerator.gerar(192, path.join(IMG_DIR, `icon-192-${app}.png`));
    }
  }
}

AppIconGenerator.run().catch(err => console.error('❌', err.message));
