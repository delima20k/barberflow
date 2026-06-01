'use strict';

// Recolore a imagem LogoNomeBarberFlow.png:
//   - pixels escuros (texto "Barber") na metade esquerda → amarelo #D4AF37
//   - pixels escuros (texto "Flow")  na metade direita  → marrom claro #8B5A2B

const { Jimp } = require('jimp');
const path = require('path');

// =============================================================
// LogoColorizer — Recolore o logotipo BarberFlow (POO)
// =============================================================
class LogoColorizer {

  static #INPUT  = path.join(__dirname, '../shared/img/LogoNomeBarberFlow.png');
  static #OUTPUT = LogoColorizer.#INPUT; // sobreescreve o original

  /** Luminância BT.601 — detecta pixels escuros (texto). */
  static #lum(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /** Recolore e salva o logotipo. */
  static async run() {
    const img    = await Jimp.read(LogoColorizer.#INPUT);
    const w      = img.bitmap.width;
    const h      = img.bitmap.height;
    const splitX = Math.round(w * 0.53);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r   = img.bitmap.data[idx];
        const g   = img.bitmap.data[idx + 1];
        const b   = img.bitmap.data[idx + 2];
        const a   = img.bitmap.data[idx + 3];

        if (a < 10) continue;
        if (LogoColorizer.#lum(r, g, b) > 100) continue; // fundo claro — ignora

        if (x < splitX) {
          // Barber → amarelo #D4AF37
          img.bitmap.data[idx]     = 212;
          img.bitmap.data[idx + 1] = 175;
          img.bitmap.data[idx + 2] = 55;
        } else {
          // Flow → marrom claro #8B5A2B
          img.bitmap.data[idx]     = 139;
          img.bitmap.data[idx + 1] = 90;
          img.bitmap.data[idx + 2] = 43;
        }
      }
    }

    await img.write(LogoColorizer.#OUTPUT);
    console.log('✅ Logo recolorida! Barber=#D4AF37 | Flow=#8B5A2B');
  }
}

/* ── Ponto de entrada ─────────────────────────────────────── */
LogoColorizer.run().catch(err => console.error('❌', err.message));
