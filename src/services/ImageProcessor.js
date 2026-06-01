'use strict';

// =============================================================
// ImageProcessor.js — Otimização de imagens para web em larga escala
// Camada: application
//
// OBJETIVO: garantir imagens leves (≤20KB) mantendo qualidade visual.
//
// PIPELINE COMPLETO:
//   1. Validar — garante que o input é um Buffer
//   2. Orientar — aplica rotação EXIF + strip de TODOS os metadados
//   3. Crop 1:1 — extrai quadrado central sem distorção
//   4. Redimensionar — 200×200 (ideal), nunca acima de 300×300
//   5. Converter — WebP primário; JPG como fallback
//   6. Comprimir — redução progressiva de qualidade até ≤20KB
//
// RESTRIÇÕES POR DESIGN:
//   - Nunca comprime sem redimensionar antes (redução sem resize gera
//     artefatos e não garante o limite de tamanho)
//   - Não processa imagens de barbearia (logo, cover) — use endpoint dedicado
//   - Nunca gera PNG na saída (tamanho não controlável sem perda)
//
// FORMATOS DE SAÍDA:
//   WebP: qualidade 70→60 (step -5), chroma 4:2:0 implícito
//   JPG:  qualidade 75→65 (step -5), chroma subsampling 4:2:0, progressive
//
// USO:
//   const proc = new ImageProcessor();
//   const { data, format, bytes } = await proc.processAvatar(buffer);
//   const { data, format, bytes } = await proc.processIcon(buffer);
//
// DEPENDÊNCIA: sharp (npm install sharp)
// =============================================================

const sharp = require('sharp');

// ── Limites e configuração de qualidade ───────────────────────
const IDEAL_SIZE  = 200;      // dimensão alvo (px)
const MAX_SIZE    = 300;      // limite máximo aceito na saída (não usado no resize, mas como guard)
const MAX_BYTES   = 20_480;   // 20 KB

const WEBP_Q_MAX  = 70;
const WEBP_Q_MIN  = 60;
const JPG_Q_MAX   = 75;
const JPG_Q_MIN   = 65;
const Q_STEP      = 5;

/**
 * @typedef {Object} ProcessedImage
 * @property {Buffer}         data    — Buffer da imagem processada
 * @property {'webp'|'jpg'}   format  — formato de saída
 * @property {number}         bytes   — tamanho em bytes
 */

class ImageProcessor {

  // ── Campos privados estáticos (configuração imutável) ────────
  static #IDEAL_SIZE = IDEAL_SIZE;
  static #MAX_BYTES  = MAX_BYTES;
  static #WEBP_Q_MAX = WEBP_Q_MAX;
  static #WEBP_Q_MIN = WEBP_Q_MIN;
  static #JPG_Q_MAX  = JPG_Q_MAX;
  static #JPG_Q_MIN  = JPG_Q_MIN;
  static #Q_STEP     = Q_STEP;

  // ══════════════════════════════════════════════════════════════
  // PÚBLICOS
  // ══════════════════════════════════════════════════════════════

  /**
   * Processa imagem de avatar do usuário.
   * Crop 1:1 central + 200×200 + WebP ≤20KB + strip EXIF.
   *
   * @param {Buffer} buffer — Imagem original (qualquer formato suportado pelo sharp)
   * @returns {Promise<ProcessedImage>}
   * @throws {Error{status:400}} se input não for Buffer
   */
  async processAvatar(buffer) {
    return this.#processar(buffer);
  }

  /**
   * Processa ícone de serviço (corte, barba, etc.).
   * Mesmas regras que processAvatar: 1:1, 200×200, WebP ≤20KB, sem EXIF.
   *
   * @param {Buffer} buffer — Imagem original (qualquer formato suportado pelo sharp)
   * @returns {Promise<ProcessedImage>}
   * @throws {Error{status:400}} se input não for Buffer
   */
  async processIcon(buffer) {
    return this.#processar(buffer);
  }

  // ══════════════════════════════════════════════════════════════
  // PIPELINE INTERNO
  // ══════════════════════════════════════════════════════════════

  /**
   * Pipeline completo: validar → orientar → crop1:1 → comprimir.
   *
   * @param {Buffer} buffer
   * @returns {Promise<ProcessedImage>}
   */
  async #processar(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw Object.assign(
        new Error('[ImageProcessor] input deve ser um Buffer (imagem)'),
        { status: 400 }
      );
    }

    // 1. Aplicar orientação EXIF + strip TODOS os metadados (EXIF, ICC, XMP)
    const orientado = await this.#rotacionar(buffer);

    // 2. Crop central 1:1 + resize para dimensão ideal
    const cortado = await this.#centerCrop(orientado);

    // 3. Converter + comprimir até ≤20KB
    return this.#enforceLimit(cortado);
  }

  /**
   * Aplica orientação EXIF correta e descarta TODOS os metadados.
   *
   * `.rotate()` sem argumento usa a orientação EXIF da imagem.
   * `.withMetadata(false)` garante output limpo: sem EXIF, ICC, XMP.
   *
   * @param {Buffer} buffer
   * @returns {Promise<Buffer>} — buffer PNG sem metadados, orientação correta
   */
  async #rotacionar(buffer) {
    return sharp(buffer)
      .rotate()             // aplica orientação EXIF automaticamente
      .withMetadata(false)  // strip absoluto: EXIF, ICC, XMP, IPTC
      .png()                // mantém sem perdas para o próximo passo (crop)
      .toBuffer();
  }

  /**
   * Extrai o quadrado central da imagem e redimensiona para IDEAL_SIZE.
   *
   * Algoritmo:
   *   side = min(width, height)
   *   left = floor((width  - side) / 2)
   *   top  = floor((height - side) / 2)
   *
   * Garante crop simétrico em ambos os eixos, centralizado.
   *
   * @param {Buffer} buffer — buffer PNG sem metadados (saída de #rotacionar)
   * @returns {Promise<Buffer>}
   */
  async #centerCrop(buffer) {
    const { width, height } = await sharp(buffer).metadata();
    const side = Math.min(width, height);
    const left = Math.floor((width  - side) / 2);
    const top  = Math.floor((height - side) / 2);

    return sharp(buffer)
      .extract({ left, top, width: side, height: side })
      .resize(ImageProcessor.#IDEAL_SIZE, ImageProcessor.#IDEAL_SIZE, {
        fit:                'fill',  // já é quadrado — fill sem distorção
        withoutEnlargement: false,   // imagens pequenas (<200px) são ampliadas para uniformidade
      })
      .toBuffer();
  }

  /**
   * Converte o buffer para WebP ou JPG com redução progressiva de qualidade
   * até que o arquivo fique dentro do limite de 20KB.
   *
   * Estratégia:
   *   1. Tenta WebP com qualidade 70, 65, 60 (step -5)
   *   2. Se ainda >20KB, tenta JPG com qualidade 75, 70, 65
   *   3. Se ainda >20KB após JPG@65, retorna o menor resultado obtido
   *      (best-effort — evita lançar erro em imagens excepcionalmente complexas)
   *
   * JPG usa: chroma subsampling 4:2:0 + progressive (conforme spec).
   *
   * @param {Buffer} buffer — buffer quadrado 200×200 sem metadados
   * @returns {Promise<ProcessedImage>}
   */
  async #enforceLimit(buffer) {
    // ── Tentativas WebP ──────────────────────────────────────────
    for (
      let q = ImageProcessor.#WEBP_Q_MAX;
      q >= ImageProcessor.#WEBP_Q_MIN;
      q -= ImageProcessor.#Q_STEP
    ) {
      const data = await sharp(buffer)
        .webp({ quality: q })
        .toBuffer();

      if (data.length <= ImageProcessor.#MAX_BYTES) {
        return { data, format: 'webp', bytes: data.length };
      }
    }

    // ── Fallback JPG (qualidade reduzida) ────────────────────────
    let melhorJpg     = null;
    let melhorJpgSize = Infinity;

    for (
      let q = ImageProcessor.#JPG_Q_MAX;
      q >= ImageProcessor.#JPG_Q_MIN;
      q -= ImageProcessor.#Q_STEP
    ) {
      const data = await sharp(buffer)
        .jpeg({
          quality:          q,
          chromaSubsampling: '4:2:0',
          progressive:      true,
          mozjpeg:          false,  // sem mozjpeg — compatibilidade máxima
        })
        .toBuffer();

      if (data.length <= ImageProcessor.#MAX_BYTES) {
        return { data, format: 'jpg', bytes: data.length };
      }

      // Guarda o menor obtido até agora para best-effort
      if (data.length < melhorJpgSize) {
        melhorJpg     = data;
        melhorJpgSize = data.length;
      }
    }

    // ── Best-effort: WebP@60 vs JPG@65 — retorna o menor ────────
    // Acontece apenas em imagens excepcionalmente complexas (raro com 200×200)
    const webpMin = await sharp(buffer)
      .webp({ quality: ImageProcessor.#WEBP_Q_MIN })
      .toBuffer();

    if (webpMin.length <= melhorJpgSize) {
      return { data: webpMin, format: 'webp', bytes: webpMin.length };
    }

    return { data: melhorJpg, format: 'jpg', bytes: melhorJpgSize };
  }
}

module.exports = ImageProcessor;
