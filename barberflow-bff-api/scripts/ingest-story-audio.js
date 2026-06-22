'use strict';

/**
 * ingest-story-audio.js — ingestão offline dos áudios de story.
 *
 * Lê uma pasta local de MP3, processa cada faixa (corte 35s + AAC/MP3 + loudnorm),
 * gera music-id estável, classifica gênero (heurística revisável) e:
 *   • --dry-run (padrão): NÃO sobe nada; grava scripts/out/catalog.preview.json
 *     (todas as faixas + gênero p/ revisão) e processa --sample faixas reportando
 *     tamanho antes/depois.
 *   • --upload: processa todas, sobe ao R2 (stories/audio/{genero}/{id}.ext),
 *     pula as já existentes (HEAD; salvo --force), e sobe stories/audio/catalog.json.
 *
 * Uso:
 *   node barberflow-bff-api/scripts/ingest-story-audio.js [--dir=<pasta>]
 *        [--dry-run|--upload] [--sample=3] [--force]
 *
 * NÃO move os arquivos locais. NÃO salva caminhos locais no catálogo.
 * Camada: scripts (tooling)
 */

const crypto = require('node:crypto');
const fs     = require('node:fs/promises');
const path   = require('node:path');

const { AudioTrackNameParser }     = require('../application/stories/audio/AudioTrackNameParser');
const { GenreClassifier }          = require('../application/stories/audio/GenreClassifier');
const { StoryAudioR2Pather }       = require('../application/stories/audio/StoryAudioR2Pather');
const { StoryAudioCatalogBuilder } = require('../application/stories/audio/StoryAudioCatalogBuilder');
const { MusicProcessingService }   = require('../infrastructure/media/MusicProcessingService');

const DEFAULT_DIR = 'C:\\Users\\delim\\Desktop\\audio_storyBarberFlow';
const OUT_DIR     = path.join(__dirname, 'out');

class StoryAudioIngestor {
  #processor;
  #r2;
  #log;

  /**
   * @param {object} deps
   * @param {MusicProcessingService} deps.processor
   * @param {object|null} [deps.r2]  — R2Client-like (putBuffer, head, publicUrl); null em dry-run
   * @param {(...a:any)=>void} [deps.log]
   */
  constructor({ processor, r2 = null, log = console.log } = {}) {
    this.#processor = processor;
    this.#r2 = r2;
    this.#log = log;
  }

  /** Lista os .mp3 da pasta (não recursivo por padrão; pasta é plana). */
  async listar(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && /\.mp3$/i.test(e.name))
      .map(e => ({ file: e.name, abs: path.join(dir, e.name) }))
      .sort((a, b) => a.file.localeCompare(b.file));
  }

  /** Metadados (sem processar): parse + gênero + id estável. */
  meta({ file }) {
    const parsed = AudioTrackNameParser.parse(file);
    const genre  = GenreClassifier.classificar(parsed);
    const hash   = crypto.createHash('sha1').update(file).digest('hex').slice(0, 8);
    const music_id = `${StoryAudioR2Pather.slug(parsed.name)}-${hash}`;
    return { music_id, music_name: parsed.name, artist: parsed.artist, genre };
  }

  async run({ dir = DEFAULT_DIR, dryRun = true, sample = 3, force = false } = {}) {
    const arquivos = await this.listar(dir);
    this.#log(`\n[ingest] pasta: ${dir}`);
    this.#log(`[ingest] faixas .mp3 encontradas: ${arquivos.length}`);
    this.#log(`[ingest] modo: ${dryRun ? 'DRY-RUN (não sobe nada)' : 'UPLOAD (R2)'}\n`);

    const t0 = Date.now();
    return dryRun
      ? this.#runDryRun(dir, arquivos, sample, t0)
      : this.#runUpload(dir, arquivos, force, t0);
  }

  async #runDryRun(dir, arquivos, sample, t0) {
    // 1) Catálogo de revisão (todas as faixas, metadados + duração).
    const preview = [];
    for (const a of arquivos) {
      let duration = 0;
      try { duration = await this.#processor.inspectPath(a.abs); }
      catch (_) { /* ffprobe indisponível → 0 (revisar gênero não depende disso) */ }
      const m = this.meta(a);
      const ext = 'm4a';
      preview.push({
        ...m, duration: Math.round(duration),
        size: 0, ext,
        key: StoryAudioR2Pather.keyFor({ genre: m.genre, musicId: m.music_id, ext }),
        url: '', source_file: a.file,
      });
    }
    await fs.mkdir(OUT_DIR, { recursive: true });
    const previewPath = path.join(OUT_DIR, 'catalog.preview.json');
    await fs.writeFile(previewPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: preview.length,
      genres: ['Todos', ...GenreClassifier.GENEROS.filter(g => preview.some(p => p.genre === g))],
      tracks: preview,
    }, null, 2));
    this.#log(`[dry-run] catálogo de revisão: ${previewPath}`);
    this.#log(`[dry-run] distribuição de gênero:`);
    for (const [g, n] of this.#contarGeneros(preview)) this.#log(`   ${String(g).padEnd(12)} ${n}`);

    // 2) Processa uma amostra reportando antes/depois.
    const amostra = arquivos.slice(0, Math.max(0, sample));
    if (amostra.length) this.#log(`\n[dry-run] processando amostra (${amostra.length}):`);
    let somaOrig = 0, somaOut = 0;
    for (const a of amostra) {
      try {
        const buf = await fs.readFile(a.abs);
        const r = await this.#processor.process(buf, { maxSeconds: 35, targetKbps: 80 });
        somaOrig += r.originalBytes; somaOut += r.outputBytes;
        this.#log(`   ${a.file}\n      ${kb(r.originalBytes)} → ${kb(r.outputBytes)} (${r.codec}, -${pct(r.originalBytes, r.outputBytes)}%)`);
      } catch (err) {
        this.#log(`   ${a.file}\n      FALHA: ${err.message}`);
      }
    }
    if (amostra.length) this.#log(`   amostra total: ${kb(somaOrig)} → ${kb(somaOut)}`);
    this.#log(`\n[dry-run] concluído em ${secs(t0)}s. Revise os gêneros em catalog.preview.json e rode com --upload.`);
    return { dryRun: true, count: preview.length, previewPath };
  }

  async #runUpload(dir, arquivos, force, t0) {
    if (!this.#r2) throw new Error('R2 indisponível: configure R2_* para --upload.');
    const tracks = [];
    let enviados = 0, pulados = 0, falhas = 0, somaOrig = 0, somaOut = 0;

    for (const a of arquivos) {
      const m = this.meta(a);
      try {
        const buf = await fs.readFile(a.abs);
        const r = await this.#processor.process(buf, { maxSeconds: 35, targetKbps: 80 });
        const key = StoryAudioR2Pather.keyFor({ genre: m.genre, musicId: m.music_id, ext: r.ext });

        if (!force) {
          const exists = await this.#r2.head(key).catch(() => null);
          if (exists) {
            pulados += 1;
            tracks.push({ ...m, duration: 0, size: exists.tamanhoBytes ?? r.outputBytes, ext: r.ext, url: this.#r2.publicUrl(key) });
            this.#log(`   = ${a.file} (já existe)`);
            continue;
          }
        }

        let duration = 0; try { duration = Math.round(await this.#processor.inspectPath(a.abs)); } catch (_) {}
        await this.#r2.putBuffer(key, r.bytes, r.contentType);
        enviados += 1; somaOrig += r.originalBytes; somaOut += r.outputBytes;
        tracks.push({ ...m, duration, size: r.outputBytes, ext: r.ext, url: this.#r2.publicUrl(key) });
        this.#log(`   + ${a.file} → ${key} (${kb(r.outputBytes)})`);
      } catch (err) {
        falhas += 1;
        this.#log(`   ! ${a.file} FALHA: ${err.message}`);
      }
    }

    const catalogo = StoryAudioCatalogBuilder.montar(tracks);
    const catKey = StoryAudioR2Pather.catalogKey();
    await this.#r2.putBuffer(catKey, Buffer.from(JSON.stringify(catalogo)), 'application/json');
    this.#log(`\n[upload] catálogo → ${catKey} (${catalogo.count} faixas)`);
    this.#log(`[upload] enviados=${enviados} pulados=${pulados} falhas=${falhas}`);
    this.#log(`[upload] tamanho processado: ${kb(somaOrig)} → ${kb(somaOut)} em ${secs(t0)}s`);
    return { dryRun: false, enviados, pulados, falhas, catalogKey: catKey };
  }

  #contarGeneros(tracks) {
    const m = new Map();
    for (const t of tracks) m.set(t.genre, (m.get(t.genre) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
}

// ── helpers de relatório ──────────────────────────────────────
function kb(b) { return `${(Number(b || 0) / 1024).toFixed(0)}KB`; }
function pct(a, b) { return a > 0 ? Math.round((1 - b / a) * 100) : 0; }
function secs(t0) { return ((Date.now() - t0) / 1000).toFixed(1); }

// ── CLI ───────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, dryRun: true, sample: 3, force: false };
  for (const a of argv) {
    if (a === '--upload') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--dir=')) args.dir = a.slice(6);
    else if (a.startsWith('--sample=')) args.sample = Number(a.slice(9)) || 0;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const processor = new MusicProcessingService();
  let r2 = null;
  if (!args.dryRun) {
    const R2Client = require('../../src/infra/R2Client');
    r2 = R2Client.getInstance();
  }
  const ingestor = new StoryAudioIngestor({ processor, r2 });
  await ingestor.run(args);
}

if (require.main === module) {
  main().catch(err => { console.error('[ingest] erro fatal:', err); process.exit(1); });
}

module.exports = { StoryAudioIngestor };
