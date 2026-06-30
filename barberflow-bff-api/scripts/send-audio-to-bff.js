'use strict';

/**
 * send-audio-to-bff.js — processa os MP3s localmente (trim 35s + AAC) e
 * envia o resultado compactado (~350KB) para a BFF em produção armazenar no R2.
 *
 * Nenhuma credencial R2 é necessária aqui — a BFF cuida do R2.
 *
 * Uso:
 *   node barberflow-bff-api/scripts/send-audio-to-bff.js \
 *        --token=ADMIN_INGEST_TOKEN \
 *        [--dir=C:\Users\delim\Desktop\audio_storyBarberFlow] \
 *        [--bff=https://bff.barberflow.live]
 */

const fs   = require('node:fs');
const path = require('node:path');

// Módulos do projeto (disponíveis no node_modules da barberflow-bff-api)
const { MusicProcessingService } = require('../infrastructure/media/MusicProcessingService');

const DEFAULT_DIR = 'C:\\Users\\delim\\Desktop\\audio_storyBarberFlow';
const DEFAULT_BFF = 'https://bff.barberflow.live';

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, bff: DEFAULT_BFF, token: '' };
  for (const a of argv) {
    if (a.startsWith('--dir='))   args.dir   = a.slice(6);
    if (a.startsWith('--bff='))   args.bff   = a.slice(6);
    if (a.startsWith('--token=')) args.token = a.slice(8);
  }
  return args;
}

async function uploadArquivo(bff, token, filePath) {
  const filename = path.basename(filePath);
  const rawBuffer = fs.readFileSync(filePath);

  // Processa localmente: trim 35s + AAC 80kbps + loudnorm
  const processor = new MusicProcessingService();
  const result = await processor.process(rawBuffer, { maxSeconds: 35, targetKbps: 80 });

  // Envia o arquivo já processado (~350KB) para a BFF guardar no R2
  const res = await fetch(`${bff}/api/v1/admin/ingest-audio/upload`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  result.contentType,   // audio/mp4 — já processado
      'X-Filename':    filename,
      'X-Preprocessed': 'true',
    },
    body: result.bytes,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 120)); }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.dados;
}

async function gerarCatalogo(bff, token, tracks) {
  const res = await fetch(`${bff}/api/v1/admin/ingest-audio/catalog`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ tracks }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 120)); }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.dados;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.token) {
    console.error('Uso: node send-audio-to-bff.js --token=SEU_TOKEN');
    process.exit(1);
  }

  const arquivos = fs.readdirSync(args.dir)
    .filter(f => /\.mp3$/i.test(f))
    .sort()
    .map(f => path.join(args.dir, f));

  console.log(`\n[send] BFF: ${args.bff}`);
  console.log(`[send] pasta: ${args.dir}`);
  console.log(`[send] faixas encontradas: ${arquivos.length}`);
  console.log('[send] processamento: trim 35s + AAC 80kbps (local) → upload BFF → R2\n');

  const tracks = [];
  let ok = 0, falhas = 0;

  for (let i = 0; i < arquivos.length; i++) {
    const nome = path.basename(arquivos[i]);
    process.stdout.write(`[${String(i + 1).padStart(3)}/${arquivos.length}] ${nome} ... `);
    try {
      const track = await uploadArquivo(args.bff, args.token, arquivos[i]);
      tracks.push(track);
      ok++;
      console.log(`OK (${track.genre}, ${(track.size / 1024).toFixed(0)}KB)`);
    } catch (err) {
      falhas++;
      console.log(`ERRO: ${err.message}`);
    }
  }

  console.log(`\n[send] uploads: ${ok} ok, ${falhas} falhas`);

  if (tracks.length) {
    console.log('[send] gerando catalog.json no R2...');
    const cat = await gerarCatalogo(args.bff, args.token, tracks);
    console.log(`[send] catálogo gerado: ${cat.count} faixas em ${cat.catalogKey}`);
  }

  console.log('\n[send] concluído.');
}

main().catch(err => { console.error('[send] erro fatal:', err.message); process.exit(1); });
