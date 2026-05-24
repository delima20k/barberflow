'use strict';

/**
 * SchemaValidator — Valida o hash do schema ao iniciar a aplicação.
 *
 * Compara o hash das migrations em disco (ou o snapshot armazenado) com
 * o hash em `db/snapshots/schema.hash`.
 *
 * Uso no servidor (server.js ou BFF):
 *
 *   const SchemaValidator = require('./shared/js/SchemaValidator');
 *   SchemaValidator.validar({ bloquearEmProducao: true });
 *
 * Ambiente:
 *   APP_ENV=production  → bloqueia se hash divergir (process.exit(1))
 *   APP_ENV=development → apenas log de aviso (nunca bloqueia)
 *   APP_ENV=test        → silencioso
 *
 * Invariantes:
 *   - Zero dependências externas (apenas node:fs, node:path, node:crypto)
 *   - Nunca lança exceção — loga e retorna boolean
 *   - Idempotente: chamar múltiplas vezes é seguro
 */

/* istanbul ignore next — NODE_PATH polyfill para ambientes isomórficos */
const _isNode = typeof require === 'function' && typeof module !== 'undefined';

class SchemaValidator {
  /**
   * Valida o hash do schema.
   *
   * @param {{ bloquearEmProducao?: boolean, silencioso?: boolean }} opts
   * @returns {boolean} true = em conformidade, false = divergência detectada
   */
  static validar(opts = {}) {
    if (!_isNode) return true; // Browser não valida schema

    const { bloquearEmProducao = false, silencioso = false } = opts;
    const env = (typeof process !== 'undefined' && process.env?.APP_ENV) || 'development';

    if (env === 'test') return true;

    try {
      const { fs, path, crypto } = _requireBuiltins();
      const ROOT      = _findRoot(path);
      const hashFile  = path.join(ROOT, 'db', 'snapshots', 'schema.hash');
      const migsDir   = path.join(ROOT, 'supabase', 'migrations');

      if (!fs.existsSync(hashFile)) {
        _log('⚠️  SchemaValidator: db/snapshots/schema.hash não encontrado. '
          + 'Execute: node scripts/db-snapshot.js', 'warn', silencioso);
        return false;
      }

      const storedHash  = fs.readFileSync(hashFile, 'utf8').trim();
      const currentHash = _computeMigrationsHash(fs, path, crypto, migsDir);

      if (storedHash === currentHash) {
        _log('✅ SchemaValidator: schema em conformidade.', 'info', silencioso);
        return true;
      }

      const msg = [
        '⚠️  SchemaValidator: DIVERGÊNCIA DE SCHEMA DETECTADA.',
        `   Hash armazenado: ${storedHash}`,
        `   Hash atual:      ${currentHash}`,
        '   Ação: node scripts/db-snapshot.js && commitar db/snapshots/',
      ].join('\n');

      _log(msg, 'warn', silencioso);

      if (bloquearEmProducao && env === 'production') {
        console.error('❌ Bloqueando boot em produção por divergência de schema.');
        if (typeof process !== 'undefined') process.exit(1);
      }

      return false;

    } catch (err) {
      _log(`⚠️  SchemaValidator: erro ao validar schema — ${err.message}`, 'warn', silencioso);
      return false;
    }
  }

  /**
   * Retorna o hash atual das migrations sem comparar.
   * Útil para diagnóstico e scripts.
   */
  static hashAtual() {
    if (!_isNode) return null;
    const { fs, path, crypto } = _requireBuiltins();
    const ROOT    = _findRoot(path);
    const migsDir = path.join(ROOT, 'supabase', 'migrations');
    return _computeMigrationsHash(fs, path, crypto, migsDir);
  }
}

// ─── Utilitários privados ─────────────────────────────────────────────────────

function _requireBuiltins() {
  return {
    fs:     require('node:fs'),
    path:   require('node:path'),
    crypto: require('node:crypto'),
  };
}

/** Encontra a raiz do projeto subindo até encontrar package.json. */
function _findRoot(path) {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, 'package.json');
    if (require('node:fs').existsSync(pkg)) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, '..', '..');
}

/**
 * Calcula SHA-256 das migrations em ordem determinística.
 * Mesmo algoritmo que SchemaSnapshotGenerator._sha256.
 */
function _computeMigrationsHash(fs, path, crypto, migsDir) {
  if (!fs.existsSync(migsDir)) return '';

  const content = fs.readdirSync(migsDir)
    .filter(f => /^\d+.*\.sql$/.test(f))
    .sort()
    .map(f => {
      const raw  = fs.readFileSync(path.join(migsDir, f), 'utf8');
      return `-- MIGRATION: ${f}\n${_stripComments(raw)}`;
    })
    .join('\n\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const header = [
    '-- BarberFlow Schema Snapshot',
    '',
  ].join('\n');

  return crypto.createHash('sha256').update(header + '\n\n' + content, 'utf8').digest('hex');
}

function _stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

function _log(msg, level, silencioso) {
  if (silencioso) return;
  if (level === 'warn') {
    console.warn(msg);
  } else {
    console.log(msg);
  }
}

module.exports = SchemaValidator;
