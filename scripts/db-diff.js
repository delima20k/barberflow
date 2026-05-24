#!/usr/bin/env node
'use strict';

/**
 * scripts/db-diff.js — Diff legível entre snapshot armazenado e estado atual.
 *
 * USO:
 *   node scripts/db-diff.js                    # diff vs. snapshot armazenado
 *   node scripts/db-diff.js --rpc <nome>       # compara assinatura de uma RPC específica
 *   node scripts/db-diff.js --coverage         # relatório de cobertura de contratos
 *
 * SAÍDA:
 *   Relatório formatado no stdout, agrupado por tipo de objeto:
 *   - Migrations novas / removidas
 *   - Funções adicionadas / removidas / alteradas
 *   - Índices alterados
 *
 *   Exit code 0 = sem divergência
 *   Exit code 1 = divergência detectada (bloqueia merge no CI)
 */

const fs   = require('node:fs');
const path = require('node:path');

const { RpcSignatureParser, SchemaSnapshotGenerator, SchemaDiffer } = require('./db-rpc-parser');

const ROOT        = path.resolve(__dirname, '..');
const MIGRATIONS  = path.join(ROOT, 'supabase', 'migrations');
const SNAP_DIR    = path.join(ROOT, 'db', 'snapshots');
const SNAP_SQL    = path.join(SNAP_DIR, 'schema-current.sql');
const CONTRACTS   = path.join(ROOT, 'db', 'contracts', 'snapshots');

const ARGS = process.argv.slice(2);
const MODE = ARGS[0] ?? '--diff';

// ─── Diff geral ───────────────────────────────────────────────────────────────

function runDiff() {
  if (!fs.existsSync(SNAP_SQL)) {
    console.error('❌ Snapshot não encontrado. Execute: node scripts/db-snapshot.js');
    process.exit(1);
  }

  const stored  = fs.readFileSync(SNAP_SQL, 'utf8');
  const current = SchemaSnapshotGenerator.generate(MIGRATIONS);
  const result  = SchemaDiffer.diff(stored, current.sql);

  console.log(result.report);
  process.exit(result.changed ? 1 : 0);
}

// ─── Diff de RPC específica ────────────────────────────────────────────────────

function runRpcDiff(funcName) {
  const allSql = _readAllMigrations();
  const sig    = RpcSignatureParser.extract(allSql, funcName);

  if (!sig) {
    console.error(`❌ Função '${funcName}' não encontrada nas migrations.`);
    process.exit(1);
  }

  const snapFile = path.join(CONTRACTS, `${funcName}.json`);
  if (!fs.existsSync(snapFile)) {
    console.warn(`⚠️  Sem snapshot de contrato para '${funcName}'.`);
    console.log('\nAssinatura atual:');
    console.log(JSON.stringify(sig, null, 2));
    process.exit(0);
  }

  const stored  = JSON.parse(fs.readFileSync(snapFile, 'utf8'));
  const current = { ...sig };
  delete current.grants; // grants não fazem parte do contrato estrutural

  const storedCmp  = JSON.stringify(stored.signature ?? stored, null, 2);
  const currentCmp = JSON.stringify(current, null, 2);

  if (storedCmp === currentCmp) {
    console.log(`✅ Contrato de '${funcName}' em conformidade.`);
    process.exit(0);
  }

  console.log(`\n❌ Divergência no contrato de '${funcName}':`);
  _printFieldDiff(stored.signature ?? stored, current);
  process.exit(1);
}

// ─── Relatório de cobertura ────────────────────────────────────────────────────

function runCoverage() {
  const allSql   = _readAllMigrations();
  const allRpcs  = RpcSignatureParser.extractAll(allSql);
  const rpcNames = Object.keys(allRpcs).sort();

  const withContract    = [];
  const withoutContract = [];

  for (const name of rpcNames) {
    const snapFile = path.join(CONTRACTS, `${name}.json`);
    if (fs.existsSync(snapFile)) {
      withContract.push(name);
    } else {
      withoutContract.push(name);
    }
  }

  const pct = rpcNames.length ? Math.round((withContract.length / rpcNames.length) * 100) : 0;

  console.log('\n═══════════════════ RPC CONTRACT COVERAGE ════════════════════');
  console.log(`Total de RPCs:      ${rpcNames.length}`);
  console.log(`Com contrato:       ${withContract.length} (${pct}%)`);
  console.log(`Sem contrato:       ${withoutContract.length}`);

  if (withContract.length) {
    console.log('\n✅ RPCs com contrato documentado:');
    withContract.forEach(n => console.log(`   ${n}()`));
  }

  if (withoutContract.length) {
    console.log('\n⚠️  RPCs sem contrato (dívida técnica):');
    withoutContract.forEach(n => console.log(`   ${n}()  ← pendente`));
    console.log('\n   Crie o contrato em: db/contracts/snapshots/<nome>.json');
    console.log('   Documente em:       db/contracts/<nome>.md');
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function _readAllMigrations() {
  if (!fs.existsSync(MIGRATIONS)) return '';
  return fs.readdirSync(MIGRATIONS)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort()
    .map(f => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'))
    .join('\n');
}

function _printFieldDiff(prev, curr) {
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  for (const key of allKeys) {
    const p = JSON.stringify(prev[key]);
    const c = JSON.stringify(curr[key]);
    if (p !== c) {
      console.log(`  Campo '${key}':`);
      console.log(`    antes: ${p}`);
      console.log(`    agora: ${c}`);
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

switch (MODE) {
  case '--diff':
  case undefined:
    runDiff();
    break;
  case '--rpc':
    if (!ARGS[1]) { console.error('Uso: node scripts/db-diff.js --rpc <nome>'); process.exit(1); }
    runRpcDiff(ARGS[1]);
    break;
  case '--coverage':
    runCoverage();
    break;
  default:
    console.error(`Modo inválido: ${MODE}`);
    console.error('Uso: node scripts/db-diff.js [--diff|--rpc <nome>|--coverage]');
    process.exit(1);
}
