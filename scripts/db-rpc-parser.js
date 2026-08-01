'use strict';

/**
 * db-rpc-parser.js — parser de assinaturas de RPCs PostgreSQL a partir de SQL puro.
 *
 * Usado por:
 *   scripts/db-snapshot.js   — geração do snapshot de schema
 *   scripts/db-diff.js       — diff legível entre snapshots
 *   tests/db-contracts.test.js — testes de contrato sem conexão ao banco
 *
 * Zero dependências externas — apenas Node.js built-ins.
 *
 * Classe exposta:
 *   RpcSignatureParser   — extrai e parseia assinaturas de funções SQL
 *   SchemaSnapshotGenerator — gera snapshot determinístico das migrations
 */

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

// ─── RpcSignatureParser ───────────────────────────────────────────────────────

/**
 * Extrai assinaturas estruturadas de funções PL/pgSQL / SQL a partir de texto SQL.
 *
 * Formato de retorno de `extractAll`:
 *   {
 *     [nomeFuncao]: {
 *       name:            string,
 *       params:          Array<{ name: string, type: string, default?: string }>,
 *       returns:         string | { type: 'TABLE', columns: Array<{name,type}> },
 *       language:        'plpgsql' | 'sql' | string,
 *       securityDefiner: boolean,
 *       grants:          string[],
 *     }
 *   }
 */
class RpcSignatureParser {
  /**
   * Extrai todas as assinaturas de função do SQL.
   * Quando a mesma função aparece múltiplas vezes (CREATE OR REPLACE),
   * retorna apenas a ÚLTIMA definição — replica o comportamento do PostgreSQL.
   */
  static extractAll(sql) {
    const blocks  = this._extractFunctionBlocks(sql);
    const result  = {};

    for (const block of blocks) {
      const sig = this._parseSignature(block);
      if (sig) result[sig.name] = sig;
    }

    // Extrai grants que aparecem fora do corpo da função
    this._applyGrants(sql, result);

    return result;
  }

  /** Extrai a assinatura de uma função específica (última ocorrência). */
  static extract(sql, funcName) {
    const all = this.extractAll(sql);
    return all[funcName.toLowerCase()] ?? null;
  }

  // ─── privado: extração de blocos ────────────────────────────────────────────

  /**
   * Localiza todos os blocos CREATE [OR REPLACE] FUNCTION … END.
   * Suporta dollar-quoting: $$, $body$, $function$, etc.
   */
  static _extractFunctionBlocks(sql) {
    const blocks  = [];
    const CREATE  = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i;
    let   pos     = 0;

    while (pos < sql.length) {
      const slice = sql.slice(pos);
      const m     = CREATE.exec(slice);
      if (!m) break;

      const blockStart = pos + m.index;

      // Encontra o dollar-quote que abre o corpo (AS $$ ou AS $body$)
      const asMatch = /\bAS\s+(\$[^$]*\$)/i.exec(sql.slice(blockStart));
      if (!asMatch) { pos = blockStart + 1; continue; }

      const tag       = asMatch[1]; // e.g. $$ ou $function$
      const openAt    = blockStart + asMatch.index + asMatch[0].indexOf(tag);
      const bodyStart = openAt + tag.length;

      // Encontra o tag de fechamento correspondente
      const closeAt = sql.indexOf(tag, bodyStart);
      if (closeAt === -1) { pos = blockStart + 1; continue; }

      // Encontra o ; após o tag de fechamento
      const afterClose = closeAt + tag.length;
      const semiAt     = sql.indexOf(';', afterClose);
      if (semiAt === -1) { pos = blockStart + 1; continue; }

      blocks.push(sql.slice(blockStart, semiAt + 1));
      pos = semiAt + 1;
    }

    return blocks;
  }

  // ─── privado: parse de um bloco ─────────────────────────────────────────────

  static _parseSignature(block) {
    // Nome da função
    const nameM = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[a-z_]\w*\.)?(\w+)\s*\(/i.exec(block);
    if (!nameM) return null;
    const name = nameM[1].toLowerCase();

    // Lista de parâmetros
    const parenOpen  = block.indexOf('(', nameM.index + nameM[0].length - 1);
    const parenClose = this._matchingParen(block, parenOpen);
    if (parenClose === -1) return null;

    const paramsRaw = block.slice(parenOpen + 1, parenClose);
    const params    = this._parseParams(paramsRaw);

    // Cláusula RETURNS (entre ) e LANGUAGE/AS)
    const afterParen  = block.slice(parenClose + 1);
    const returnsM    = /RETURNS\s+([\s\S]+?)(?=\s*(?:LANGUAGE|AS\s*\$))/i.exec(afterParen);
    const returnsStr  = returnsM ? returnsM[1].trim() : 'void';
    const returns     = this._parseReturns(returnsStr);

    // LANGUAGE
    const langM    = /LANGUAGE\s+(\w+)/i.exec(block);
    const language = langM ? langM[1].toLowerCase() : 'sql';

    // SECURITY DEFINER
    const securityDefiner = /\bSECURITY\s+DEFINER\b/i.test(block);

    return { name, params, returns, language, securityDefiner, grants: [] };
  }

  /** Encontra o índice do parêntese fechador correspondente. */
  static _matchingParen(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
      if (str[i] === '(') depth++;
      if (str[i] === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  /**
   * Parseia a string de parâmetros em array de objetos.
   * Entrada: "p_termo TEXT, p_limite INT DEFAULT 20"
   * Saída:   [{ name: 'p_termo', type: 'TEXT' }, { name: 'p_limite', type: 'INT', default: '20' }]
   */
  static _parseParams(raw) {
    if (!raw || !raw.trim()) return [];

    // Strip inline SQL comments (-- ... até o fim da linha) antes de processar
    const stripped = raw.replace(/--[^\n]*/g, '');

    return stripped
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        // Normaliza espaços múltiplos
        const norm    = p.replace(/\s+/g, ' ');
        const defM    = /\bDEFAULT\s+(.+)$/i.exec(norm);
        const withoutDefault = defM ? norm.slice(0, defM.index).trim() : norm;
        const parts   = withoutDefault.split(/\s+/);
        const name    = parts[0] ?? '';
        const type    = parts.slice(1).join(' ').toUpperCase();
        const param   = { name: name.toLowerCase(), type };
        if (defM) param.default = defM[1].trim();
        return param;
      });
  }

  /**
   * Parseia a cláusula RETURNS.
   * Suporta: scalar ('UUID'), SETOF ('SETOF public.appointments'),
   * TABLE (columns list), void.
   */
  static _parseReturns(raw) {
    const s = raw.trim().toUpperCase();

    if (s === 'VOID') return 'void';

    // RETURNS TABLE (col type, ...)
    const tableM = /^TABLE\s*\((.+)\)$/is.exec(raw.trim());
    if (tableM) {
      const columns = tableM[1]
        .split(',')
        .map(c => {
          const parts = c.trim().replace(/\s+/g, ' ').split(/\s+/);
          return { name: (parts[0] ?? '').toLowerCase(), type: parts.slice(1).join(' ').toUpperCase() };
        })
        .filter(c => c.name);
      return { type: 'TABLE', columns };
    }

    // SETOF ...
    if (s.startsWith('SETOF')) {
      return { type: 'SETOF', of: raw.trim().replace(/^SETOF\s+/i, '').toLowerCase() };
    }

    return s;
  }

  // ─── privado: grants ─────────────────────────────────────────────────────────

  /**
   * Extrai GRANT EXECUTE ON FUNCTION ... TO ... do SQL
   * e popula o campo `grants` de cada assinatura encontrada.
   */
  static _applyGrants(sql, signatures) {
    const grantRe = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:[a-z_]\w*\.)?(\w+)\s*\([^)]*\)\s+TO\s+(\w+)/gi;
    let m;
    while ((m = grantRe.exec(sql)) !== null) {
      const name = m[1].toLowerCase();
      const role = m[2].toLowerCase();
      if (signatures[name]) {
        if (!signatures[name].grants.includes(role)) {
          signatures[name].grants.push(role);
        }
      }
    }
  }
}

// ─── SchemaSnapshotGenerator ──────────────────────────────────────────────────

/**
 * Gera um snapshot determinístico e normalizado do schema do banco
 * a partir dos arquivos de migration em supabase/migrations/.
 *
 * Invariantes:
 *   - Mesmo conjunto de migrations → mesmo snapshot (determinismo)
 *   - Nova migration → snapshot diferente (detectabilidade)
 *   - Duas execuções consecutivas sem mudanças → hashes idênticos
 */
class SchemaSnapshotGenerator {
  /**
   * Gera o snapshot completo.
   *
   * @param {string} migrationsDir - Caminho para supabase/migrations/
   * @returns {{ sql: string, hash: string, files: string[] }}
   */
  static generate(migrationsDir) {
    const files   = this._sortedMigrationFiles(migrationsDir);
    const parts   = files.map(f => this._normalizeMigration(f));
    const header  = this._header(files);
    const sql     = [header, ...parts].join('\n\n');
    const hash    = this._sha256(sql);

    return { sql, hash, files: files.map(f => path.basename(f)) };
  }

  /** SHA-256 do conteúdo (hex). */
  static hash(content) {
    return this._sha256(content);
  }

  // ─── privado ────────────────────────────────────────────────────────────────

  static _sortedMigrationFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => /^\d+.*\.sql$/.test(f))
      .sort()
      .map(f => path.join(dir, f));
  }

  static _normalizeMigration(filePath) {
    const raw      = fs.readFileSync(filePath, 'utf8');
    const stripped = this._stripComments(raw);
    const normal   = this._normalizeWhitespace(stripped);
    return `-- MIGRATION: ${path.basename(filePath)}\n${normal}`;
  }

  /** Remove comentários SQL de linha e bloco. */
  static _stripComments(sql) {
    // Remove bloco /* ... */ e linha -- ...
    let s = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove linha -- ...
    s = s.replace(/--[^\n]*/g, '');
    return s;
  }

  /** Colapsa espaços múltiplos e linhas em branco consecutivas. */
  static _normalizeWhitespace(sql) {
    return sql
      .split('\n')
      .map(l => l.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static _header(files) {
    return [
      '-- BarberFlow Schema Snapshot',
      `-- Gerado em: ${new Date().toISOString().split('T')[0]}`,
      `-- Migrations: ${files.length}`,
      '-- NÃO editar manualmente. Regenerar com: node scripts/db-snapshot.js',
      '',
    ].join('\n');
  }

  static _sha256(content) {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }
}

// ─── SchemaDiffer ─────────────────────────────────────────────────────────────

/**
 * Compara dois snapshots e retorna um diff legível agrupado por tipo de objeto.
 */
class SchemaDiffer {
  /**
   * Compara o snapshot armazenado com o gerado agora.
   *
   * @param {string} storedSql   - Conteúdo de db/snapshots/schema-current.sql
   * @param {string} currentSql  - Snapshot gerado agora
   * @returns {{ changed: boolean, report: string, groups: object }}
   */
  static diff(storedSql, currentSql) {
    const storedSigs  = RpcSignatureParser.extractAll(storedSql);
    const currentSigs = RpcSignatureParser.extractAll(currentSql);

    const added   = [];
    const removed = [];
    const changed = [];

    // Funções novas
    for (const name of Object.keys(currentSigs)) {
      if (!storedSigs[name]) added.push(name);
    }

    // Funções removidas
    for (const name of Object.keys(storedSigs)) {
      if (!currentSigs[name]) removed.push(name);
    }

    // Funções alteradas
    for (const name of Object.keys(currentSigs)) {
      if (!storedSigs[name]) continue;
      const prev = JSON.stringify(storedSigs[name]);
      const curr = JSON.stringify(currentSigs[name]);
      if (prev !== curr) changed.push({ name, prev: storedSigs[name], curr: currentSigs[name] });
    }

    // Diff de migrações (linhas com "-- MIGRATION:")
    const storedMigs   = this._extractMigrationNames(storedSql);
    const currentMigs  = this._extractMigrationNames(currentSql);
    const newMigs      = currentMigs.filter(m => !storedMigs.includes(m));
    const deletedMigs  = storedMigs.filter(m => !currentMigs.includes(m));

    const hasChanges = added.length + removed.length + changed.length + newMigs.length + deletedMigs.length > 0;

    const report = this._buildReport({ added, removed, changed, newMigs, deletedMigs });
    const groups = { functions: { added, removed, changed }, migrations: { new: newMigs, deleted: deletedMigs } };

    return { changed: hasChanges, report, groups };
  }

  static _extractMigrationNames(sql) {
    return [...sql.matchAll(/^-- MIGRATION:\s*(.+)$/gm)].map(m => m[1].trim());
  }

  static _buildReport({ added, removed, changed, newMigs, deletedMigs }) {
    const lines = ['═══════════════════ SCHEMA DIFF REPORT ═══════════════════'];

    if (newMigs.length) {
      lines.push('\n📁 MIGRATIONS NOVAS:');
      newMigs.forEach(m => lines.push(`  + ${m}`));
    }
    if (deletedMigs.length) {
      lines.push('\n📁 MIGRATIONS REMOVIDAS:');
      deletedMigs.forEach(m => lines.push(`  - ${m}`));
    }

    if (added.length) {
      lines.push('\n✅ FUNÇÕES ADICIONADAS:');
      added.forEach(n => lines.push(`  + ${n}()`));
    }
    if (removed.length) {
      lines.push('\n❌ FUNÇÕES REMOVIDAS:');
      removed.forEach(n => lines.push(`  - ${n}()`));
    }
    if (changed.length) {
      lines.push('\n⚠️  FUNÇÕES ALTERADAS:');
      for (const { name, prev, curr } of changed) {
        lines.push(`  ~ ${name}():`);
        if (JSON.stringify(prev.params) !== JSON.stringify(curr.params)) {
          lines.push(`      params:   ${JSON.stringify(prev.params)} → ${JSON.stringify(curr.params)}`);
        }
        if (JSON.stringify(prev.returns) !== JSON.stringify(curr.returns)) {
          lines.push(`      returns:  ${JSON.stringify(prev.returns)} → ${JSON.stringify(curr.returns)}`);
        }
        if (prev.securityDefiner !== curr.securityDefiner) {
          lines.push(`      security: ${prev.securityDefiner} → ${curr.securityDefiner}`);
        }
      }
    }

    if (!newMigs.length && !deletedMigs.length && !added.length && !removed.length && !changed.length) {
      lines.push('\n✔  Nenhuma divergência encontrada. Schema em conformidade.');
    }

    lines.push('\n═══════════════════════════════════════════════════════════');
    return lines.join('\n');
  }
}

module.exports = { RpcSignatureParser, SchemaSnapshotGenerator, SchemaDiffer };
