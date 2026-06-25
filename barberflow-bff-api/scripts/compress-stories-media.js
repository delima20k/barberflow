'use strict';

/**
 * compress-stories-media.js — compressão batch de vídeos e imagens de stories
 * para um teto de tamanho (padrão 2 MB), mantendo a melhor qualidade possível.
 *
 * Lê uma pasta local (recursiva), comprime cada imagem (→ WebP) e vídeo
 * (→ H.264/AAC) com StoryMediaCompressor e gera relatório antes/depois.
 *
 *   • --dry-run (padrão): NÃO escreve nada permanente; processa --sample arquivos
 *     e grava scripts/out/compress-report.json com tamanho antes/depois.
 *   • --out=<pasta>: grava os arquivos comprimidos numa pasta de saída.
 *   • --upload: sobe ao R2 sob --prefix (padrão stories/recompressed/), preservando
 *     o caminho relativo (extensão trocada), pulando existentes via HEAD (salvo --force).
 *
 * Uso:
 *   node barberflow-bff-api/scripts/compress-stories-media.js --dir=<pasta> \
 *        [--dry-run | --out=<pasta> | --upload] [--sample=5] [--target=2] \
 *        [--maxlado=1080] [--prefix=stories/recompressed/] [--force]
 *
 * NÃO move/apaga os arquivos de origem. Camada: scripts (tooling)
 */

const fs   = require('node:fs/promises');
const path = require('node:path');

const { StoryMediaCompressor } = require('../infrastructure/media/StoryMediaCompressor');

const OUT_DIR = path.join(__dirname, 'out');
const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VID_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

class StoryMediaBatch {
  #compressor;
  #r2;
  #log;

  constructor({ compressor, r2 = null, log = console.log } = {}) {
    this.#compressor = compressor;
    this.#r2 = r2;
    this.#log = log;
  }

  /** Lista arquivos de mídia (recursivo). */
  async listar(dir) {
    const out = [];
    const walk = async (d) => {
      const entries = await fs.readdir(d, { withFileTypes: true });
      for (const e of entries) {
        const abs = path.join(d, e.name);
        if (e.isDirectory()) { await walk(abs); continue; }
        const ext = path.extname(e.name).toLowerCase();
        const tipo = IMG_EXT.has(ext) ? 'image' : VID_EXT.has(ext) ? 'video' : null;
        if (tipo) out.push({ abs, rel: path.relative(dir, abs), ext, tipo });
      }
    };
    await walk(dir);
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
  }

  async run(args) {
    const t0 = Date.now();
    const targetBytes = Math.round((Number(args.target) || 2) * 1024 * 1024);
    const maxLado = Number(args.maxlado) || StoryMediaCompressor.DEFAULT_MAX_LADO;

    const todos = await this.listar(args.dir);
    if (!todos.length) { this.#log(`[compress] nenhum vídeo/imagem em ${args.dir}`); return { items: [] }; }

    const alvo = (args.dryRun && args.sample > 0) ? todos.slice(0, args.sample) : todos;
    this.#log(`[compress] ${todos.length} arquivos; processando ${alvo.length} (alvo ${(targetBytes / 1024 / 1024).toFixed(1)}MB, maxLado ${maxLado})`);

    const items = [];
    let okCount = 0, somaOrig = 0, somaOut = 0;
    for (const a of alvo) {
      try {
        const input = await fs.readFile(a.abs);
        const r = a.tipo === 'image'
          ? await this.#compressor.compressImage(input, { targetBytes, maxLado })
          : await this.#compressor.compressVideo(input, { targetBytes, maxLado });

        const item = {
          file: a.rel, type: a.tipo,
          originalBytes: r.originalBytes, outputBytes: r.bytes,
          reductionPct: pct(r.originalBytes, r.bytes), ok: r.ok, contentType: r.contentType,
        };
        items.push(item);
        okCount += r.ok ? 1 : 0; somaOrig += r.originalBytes; somaOut += r.bytes;
        this.#log(`   ${r.ok ? '✓' : '✗'} ${a.rel}  ${kb(r.originalBytes)} → ${kb(r.bytes)} (${item.reductionPct}%)`);

        if (!args.dryRun) await this.#persistir(a, r, args);
      } catch (err) {
        items.push({ file: a.rel, type: a.tipo, error: String(err?.message ?? err), ok: false });
        this.#log(`   ! ${a.rel} FALHA: ${err?.message ?? err}`);
      }
    }

    const relatorio = {
      generatedAt: new Date().toISOString(),
      targetBytes, maxLado, dir: args.dir,
      totals: { files: items.length, ok: okCount, originalBytes: somaOrig, outputBytes: somaOut },
      items,
    };
    await fs.mkdir(OUT_DIR, { recursive: true });
    const reportPath = path.join(OUT_DIR, 'compress-report.json');
    await fs.writeFile(reportPath, JSON.stringify(relatorio, null, 2));

    this.#log(`\n[compress] relatório → ${reportPath}`);
    this.#log(`[compress] total ${kb(somaOrig)} → ${kb(somaOut)} em ${secs(t0)}s`);
    this.#log(`[compress] ${okCount}/${items.length} ≤ ${(targetBytes / 1024 / 1024).toFixed(1)}MB`);
    if (okCount < items.length) this.#log(`[compress] ATENÇÃO: ${items.length - okCount} arquivo(s) NÃO couberam no alvo (ver relatório).`);
    return relatorio;
  }

  async #persistir(a, r, args) {
    const novoNome = a.rel.replace(/\.[^.]+$/, '') + (r.contentType === 'image/webp' ? '.webp' : '.mp4');
    if (args.out) {
      const dest = path.join(args.out, novoNome);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, r.buffer);
      this.#log(`     → ${dest}`);
    }
    if (args.upload && this.#r2) {
      const key = (args.prefix + novoNome).replace(/\\/g, '/').replace(/\/+/g, '/');
      if (!args.force && typeof this.#r2.head === 'function') {
        const existe = await this.#r2.head(key).catch(() => null);
        if (existe) { this.#log(`     = ${key} (já existe, pulado)`); return; }
      }
      await this.#r2.putBuffer(key, r.buffer, r.contentType);
      this.#log(`     ↑ ${key}`);
    }
  }
}

// ── helpers de relatório ──────────────────────────────────────
function kb(b) { return `${(Number(b || 0) / 1024).toFixed(0)}KB`; }
function pct(a, b) { return a > 0 ? Math.round((1 - b / a) * 100) : 0; }
function secs(t0) { return ((Date.now() - t0) / 1000).toFixed(1); }

// ── CLI ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dir: '', dryRun: true, sample: 5, force: false, out: '', upload: false, target: 2, maxlado: 1080, prefix: 'stories/recompressed/' };
  for (const a of argv) {
    if (a === '--upload') { args.upload = true; args.dryRun = false; }
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--dir=')) args.dir = a.slice(6);
    else if (a.startsWith('--out=')) { args.out = a.slice(6); args.dryRun = false; }
    else if (a.startsWith('--sample=')) args.sample = Number(a.slice(9)) || 0;
    else if (a.startsWith('--target=')) args.target = Number(a.slice(9)) || 2;
    else if (a.startsWith('--maxlado=')) args.maxlado = Number(a.slice(10)) || 1080;
    else if (a.startsWith('--prefix=')) args.prefix = a.slice(9);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) { console.error('[compress] informe --dir=<pasta>'); process.exit(1); }
  let r2 = null;
  if (args.upload) {
    const R2Client = require('../../src/infra/R2Client'); // eslint-disable-line global-require
    r2 = R2Client.getInstance();
  }
  const batch = new StoryMediaBatch({ compressor: new StoryMediaCompressor(), r2 });
  await batch.run(args);
}

if (require.main === module) {
  main().catch(err => { console.error('[compress] erro fatal:', err); process.exit(1); });
}

module.exports = { StoryMediaBatch };
