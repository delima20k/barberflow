'use strict';

/**
 * rebuild-counters.js — Rebuild em batches dos contadores desnormalizados.
 *
 * Uso:
 *   node scripts/rebuild-counters.js
 *   node scripts/rebuild-counters.js --dry-run
 *   node scripts/rebuild-counters.js --batch-size=200
 *   node scripts/rebuild-counters.js --counters=C8,C10
 *   node scripts/rebuild-counters.js --checkpoint=/tmp/rebuild.json
 *
 * Pré-requisito: migration 20260524000001_rebuild_counters_with_atomic_triggers.sql
 * aplicada em produção (cria a RPC rebuild_counter_batch).
 *
 * Saída: logs no stdout + docs/db/drift-report-after.json ao final.
 */

const path = require('node:path');
const fs   = require('node:fs');
const { createClient } = require('@supabase/supabase-js');

// ─── Configuração via variáveis de ambiente ───────────────────────────────────
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPORT_OUTPUT     = path.resolve(__dirname, '../docs/db/drift-report-after.json');

// Contadores disponíveis para rebuild (C9 e C13 não têm fonte — excluídos)
const ALL_COUNTERS = ['C8', 'C10', 'C11', 'C12'];

class RebuildLogger {
  #startedAt = Date.now();

  info(msg, ...args) {
    process.stdout.write(`[${this.#ts()}] INFO  ${msg}\n`);
    if (args.length) process.stdout.write(`       ${JSON.stringify(args)}\n`);
  }

  warn(msg) {
    process.stdout.write(`[${this.#ts()}] WARN  ${msg}\n`);
  }

  error(msg, err) {
    process.stderr.write(`[${this.#ts()}] ERROR ${msg}\n`);
    if (err) process.stderr.write(`       ${err.message ?? String(err)}\n`);
  }

  done(counter, totalRows, elapsedMs) {
    process.stdout.write(
      `[${this.#ts()}] DONE  ${counter} — ${totalRows} linhas atualizadas em ${elapsedMs}ms\n`,
    );
  }

  #ts() {
    const elapsed = ((Date.now() - this.#startedAt) / 1000).toFixed(1);
    return `+${elapsed.padStart(6)}s`;
  }
}

class CheckpointStore {
  #filePath;
  #state;

  constructor(filePath) {
    this.#filePath = filePath;
    this.#state    = this.#load();
  }

  get(counter) {
    return this.#state[counter] ?? '00000000-0000-0000-0000-000000000000';
  }

  set(counter, lastId) {
    this.#state[counter] = lastId;
    this.#persist();
  }

  clear(counter) {
    delete this.#state[counter];
    this.#persist();
  }

  #load() {
    try {
      if (fs.existsSync(this.#filePath)) {
        return JSON.parse(fs.readFileSync(this.#filePath, 'utf8'));
      }
    } catch { /* arquivo corrompido — começa do zero */ }
    return {};
  }

  #persist() {
    fs.writeFileSync(this.#filePath, JSON.stringify(this.#state, null, 2), 'utf8');
  }
}

class CounterRebuilder {
  #db;
  #batchSize;
  #dryRun;
  #counters;
  #checkpoint;
  #log;
  #report;

  /**
   * @param {{
   *   batchSize?: number,
   *   dryRun?: boolean,
   *   counters?: string[],
   *   checkpointFile?: string
   * }} opts
   */
  constructor(opts = {}) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error(
        'Variáveis de ambiente obrigatórias ausentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
      );
    }

    this.#db          = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.#batchSize   = Math.max(1, Math.min(opts.batchSize ?? 500, 5000));
    this.#dryRun      = opts.dryRun ?? false;
    this.#counters    = opts.counters ?? ALL_COUNTERS;
    this.#checkpoint  = new CheckpointStore(
      opts.checkpointFile ?? path.resolve(__dirname, '../.counter-rebuild-checkpoint.json'),
    );
    this.#log         = new RebuildLogger();
    this.#report      = {
      generated_at: new Date().toISOString(),
      dry_run:      this.#dryRun,
      batch_size:   this.#batchSize,
      counters:     {},
    };
  }

  async run() {
    this.#log.info(
      `Iniciando rebuild — dry_run=${this.#dryRun}, batch_size=${this.#batchSize}`,
    );
    this.#log.info(`Contadores: ${this.#counters.join(', ')}`);

    if (this.#dryRun) {
      this.#log.warn('DRY-RUN: nenhuma alteração será gravada no banco.');
    }

    for (const counter of this.#counters) {
      await this.#rebuildCounter(counter);
    }

    this.#writeReport();
    this.#log.info(`Relatório salvo em ${REPORT_OUTPUT}`);
    this.#log.info('Rebuild concluído.');
  }

  async #rebuildCounter(counter) {
    const startMs   = Date.now();
    let lastId      = this.#checkpoint.get(counter);
    let totalRows   = 0;
    let batchCount  = 0;

    this.#report.counters[counter] = {
      status: 'in_progress',
      rows_updated: 0,
      batches: 0,
      resumed_from: lastId,
      last_id: lastId,
      error: null,
    };

    this.#log.info(`[${counter}] Iniciando — checkpoint: ${lastId}`);

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batchResult = await this.#runBatch(counter, lastId);

        if (!batchResult || batchResult.rows_updated === 0) {
          break; // sem mais dados
        }

        totalRows += batchResult.rows_updated;
        batchCount++;
        lastId = batchResult.last_processed_id;

        this.#checkpoint.set(counter, lastId);
        this.#log.info(
          `[${counter}] batch #${batchCount} — ${batchResult.rows_updated} linhas, cursor: ${lastId}`,
        );

        // Pausa entre batches para não sobrecarregar o banco em produção
        if (batchResult.rows_updated === this.#batchSize) {
          await CounterRebuilder.#sleep(50);
        }
      }

      this.#checkpoint.clear(counter);
      this.#report.counters[counter] = {
        status: 'completed',
        rows_updated: totalRows,
        batches: batchCount,
        resumed_from: this.#report.counters[counter].resumed_from,
        last_id: lastId,
        elapsed_ms: Date.now() - startMs,
        error: null,
      };
      this.#log.done(counter, totalRows, Date.now() - startMs);

    } catch (err) {
      this.#report.counters[counter].status = 'error';
      this.#report.counters[counter].error  = err.message;
      this.#log.error(`[${counter}] Falha no batch — checkpoint preservado para retry.`, err);
    }
  }

  async #runBatch(counter, afterId) {
    if (this.#dryRun) {
      return this.#dryRunBatch(counter, afterId);
    }

    const { data, error } = await this.#db.rpc('rebuild_counter_batch', {
      p_counter:  counter,
      p_after_id: afterId,
      p_limit:    this.#batchSize,
    });

    if (error) throw new Error(`RPC rebuild_counter_batch falhou: ${error.message}`);

    const row = Array.isArray(data) ? data[0] : data;
    return row ?? { last_processed_id: afterId, rows_updated: 0 };
  }

  async #dryRunBatch(counter, afterId) {
    // Dry-run: usa a RPC mas em uma transação que nunca commita (via dummy check).
    // Aqui apenas loga o que SERIA processado sem alterar dados.
    const tableMap = {
      C8:  { table: 'portfolio_images', filter: { status_ne: 'deleted' } },
      C10: { table: 'stories',          filter: {} },
      C11: { table: 'stories',          filter: {} },
      C12: { table: 'feed_items',       filter: {} },
    };

    const cfg = tableMap[counter];
    if (!cfg) return { last_processed_id: afterId, rows_updated: 0 };

    let query = this.#db
      .from(cfg.table)
      .select('id')
      .gt('id', afterId)
      .order('id')
      .limit(this.#batchSize);

    if (cfg.filter.status_ne) {
      query = query.neq('status', cfg.filter.status_ne);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Dry-run query falhou: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) return { last_processed_id: afterId, rows_updated: 0 };

    const lastId = rows[rows.length - 1].id;
    this.#log.info(
      `[${counter}] DRY-RUN: encontradas ${rows.length} linhas no intervalo (${afterId} … ${lastId})`,
    );

    return { last_processed_id: lastId, rows_updated: rows.length };
  }

  #writeReport() {
    this.#report.finished_at = new Date().toISOString();

    const validation = {
      queries: {
        C8:  'SELECT COUNT(*) FROM portfolio_images pi LEFT JOIN likes l ON l.content_id=pi.id AND l.content_type=\'portfolio_image\' WHERE pi.status!=\'deleted\' GROUP BY pi.id HAVING pi.likes_count != COUNT(l.id);',
        C10: 'SELECT COUNT(*) FROM stories s LEFT JOIN story_views sv ON sv.story_id=s.id GROUP BY s.id HAVING s.views_count != COUNT(sv.id);',
        C11: 'SELECT COUNT(*) FROM stories s LEFT JOIN likes l ON l.content_id=s.id AND l.content_type=\'story\' GROUP BY s.id HAVING s.likes_count != COUNT(l.id);',
        C12: 'SELECT COUNT(*) FROM feed_items fi LEFT JOIN likes l ON l.content_id=fi.source_id AND l.content_type=fi.source_type GROUP BY fi.id HAVING fi.likes_count != COUNT(l.id);',
      },
      expected_drift_rows: 0,
      note: 'Execute as queries acima com role service_role após o rebuild. Resultado esperado: 0 linhas.',
    };

    const report = { ...this.#report, post_rebuild_validation: validation };
    fs.writeFileSync(REPORT_OUTPUT, JSON.stringify(report, null, 2), 'utf8');
  }

  static #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    const [key, val] = arg.replace(/^--/, '').split('=');
    if (key === 'batch-size' && val) { opts.batchSize = Number(val); }
    if (key === 'counters'   && val) { opts.counters = val.split(',').map(s => s.trim().toUpperCase()); }
    if (key === 'checkpoint' && val) { opts.checkpointFile = val; }
  }
  return opts;
}

(async () => {
  const opts    = parseArgs(process.argv);
  const builder = new CounterRebuilder(opts);
  await builder.run();
})().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
