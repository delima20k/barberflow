#!/usr/bin/env node
'use strict';

/**
 * scripts/db-snapshot.js — Gerador de snapshot determinístico do schema.
 *
 * USO:
 *   node scripts/db-snapshot.js           # gera snapshot e salva em db/snapshots/
 *   node scripts/db-snapshot.js --check   # compara com snapshot armazenado; exit 1 se divergir
 *   node scripts/db-snapshot.js --verify  # apenas imprime o hash atual (não salva)
 *
 * SAÍDA:
 *   db/snapshots/schema-current.sql  — snapshot SQL normalizado
 *   db/snapshots/schema.hash         — SHA-256 do snapshot (usado na validação de boot)
 *
 * FLUXO NO CI:
 *   1. PR inclui nova migration
 *   2. CI roda este script em --check
 *   3. Se snapshot desatualizado → CI falha com diff legível
 *   4. Developer roda `node scripts/db-snapshot.js` e commita o snapshot atualizado
 */

const fs   = require('node:fs');
const path = require('node:path');

const { SchemaSnapshotGenerator, SchemaDiffer } = require('./db-rpc-parser');

const ROOT       = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const SNAP_DIR   = path.join(ROOT, 'db', 'snapshots');
const SNAP_SQL   = path.join(SNAP_DIR, 'schema-current.sql');
const SNAP_HASH  = path.join(SNAP_DIR, 'schema.hash');

const MODE = process.argv[2] ?? '--generate';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function generate() {
  console.log('⏳ Gerando snapshot do schema...');
  const result = SchemaSnapshotGenerator.generate(MIGRATIONS);

  ensureDir(SNAP_DIR);
  fs.writeFileSync(SNAP_SQL,  result.sql,  'utf8');
  fs.writeFileSync(SNAP_HASH, result.hash, 'utf8');

  console.log(`✅ Snapshot gerado com sucesso.`);
  console.log(`   Migrations incluídas: ${result.files.length}`);
  console.log(`   Hash: ${result.hash}`);
  console.log(`   Arquivo: ${SNAP_SQL}`);

  return result;
}

function check() {
  if (!fs.existsSync(SNAP_SQL)) {
    console.error('❌ Snapshot não encontrado. Execute: node scripts/db-snapshot.js');
    process.exit(1);
  }

  const stored  = fs.readFileSync(SNAP_SQL, 'utf8');
  const current = SchemaSnapshotGenerator.generate(MIGRATIONS);
  const diff    = SchemaDiffer.diff(stored, current.sql);

  console.log(diff.report);

  if (diff.changed) {
    console.error('\n❌ FALHA: Schema diverge do snapshot armazenado.');
    console.error('   Ação necessária: node scripts/db-snapshot.js && git add db/snapshots/ && git commit');
    process.exit(1);
  }

  console.log('✅ Schema em conformidade com o snapshot.');
}

function verify() {
  const result = SchemaSnapshotGenerator.generate(MIGRATIONS);
  console.log(`Hash atual: ${result.hash}`);
  console.log(`Migrations: ${result.files.length}`);

  if (fs.existsSync(SNAP_HASH)) {
    const stored = fs.readFileSync(SNAP_HASH, 'utf8').trim();
    if (stored === result.hash) {
      console.log('✅ Hash em conformidade com snapshot armazenado.');
    } else {
      console.warn(`⚠️  Hash diverge do armazenado: ${stored}`);
    }
  }
}

switch (MODE) {
  case '--generate':
  case '--gen':
    generate();
    break;
  case '--check':
    check();
    break;
  case '--verify':
    verify();
    break;
  default:
    console.error(`Modo inválido: ${MODE}`);
    console.error('Uso: node scripts/db-snapshot.js [--generate|--check|--verify]');
    process.exit(1);
}
