#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

class Utf8MojibakeNormalizer {
  static SUSPICIOUS_PATTERN = /(?:Ã[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|Â[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|Å[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|â[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+|ð[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+|ï[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+)/g;
  static SECONDARY_PATTERN = /(?:Å[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]|ï[\u0080-\u00ff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+)/g;
  static CP1252_BYTES = new Map([
    ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85],
    ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a],
    ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92],
    ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
    ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c],
    ['ž', 0x9e], ['Ÿ', 0x9f],
  ]);

  constructor({ maxPasses = 5 } = {}) {
    this.maxPasses = maxPasses;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }

  normalizeText(text) {
    if (typeof text !== 'string' || text.length === 0) return text;

    let current = text;
    for (let pass = 0; pass < this.maxPasses; pass += 1) {
      const next = this.#normalizePass(current);
      if (next === current) break;
      if (this.score(next) > this.score(current)) break;
      current = next;
    }

    return current;
  }

  score(text) {
    const matches = text.match(Utf8MojibakeNormalizer.SUSPICIOUS_PATTERN) || [];
    const repairable = matches.filter((match) => {
      const repaired = this.#decodeAsUtf8(match);
      return repaired && repaired !== match;
    }).length;

    return repairable + (text.match(/�/g) || []).length;
  }

  hasUnrecoverableReplacement(text) {
    return text.includes('�');
  }

  #normalizePass(text) {
    const prepared = text.replace(Utf8MojibakeNormalizer.SECONDARY_PATTERN, (match) => this.#repairMatch(match));

    return prepared.replace(Utf8MojibakeNormalizer.SUSPICIOUS_PATTERN, (match) => this.#repairMatch(match));
  }

  #repairMatch(match) {
      const repaired = this.#decodeAsUtf8(match);
      if (!repaired || repaired === match) return match;
      if (this.score(repaired) > this.score(match)) return match;
      return repaired;
  }

  #decodeAsUtf8(value) {
    const bytes = this.#encodeMojibakeBytes(value);
    if (!bytes) return null;

    try {
      return this.decoder.decode(Uint8Array.from(bytes));
    } catch (_) {
      return null;
    }
  }

  #encodeMojibakeBytes(value) {
    const bytes = [];

    for (const char of value) {
      const mapped = Utf8MojibakeNormalizer.CP1252_BYTES.get(char);
      if (mapped !== undefined) {
        bytes.push(mapped);
        continue;
      }

      const code = char.charCodeAt(0);
      if (code <= 0xff) {
        bytes.push(code);
        continue;
      }

      return null;
    }

    return bytes;
  }
}

class HtmlCharsetValidator {
  static META_CHARSET_PATTERN = /<meta\s+charset=["']?utf-8["']?\s*\/?>/ig;

  validate(filePath, content) {
    if (!filePath.toLowerCase().endsWith('.html')) return [];

    const issues = [];
    const matches = [...content.matchAll(HtmlCharsetValidator.META_CHARSET_PATTERN)];
    if (matches.length !== 1) {
      issues.push(`${filePath}: esperado exatamente 1 <meta charset="UTF-8">, encontrado ${matches.length}`);
      return issues;
    }

    const lower = content.toLowerCase();
    const headStart = lower.indexOf('<head');
    const headEnd = lower.indexOf('</head>');
    const metaIndex = matches[0].index ?? -1;
    if (headStart < 0 || headEnd < 0 || metaIndex < headStart || metaIndex > headEnd) {
      issues.push(`${filePath}: <meta charset="UTF-8"> deve estar dentro de <head>`);
    }

    const firstContent = this.#firstHeadContentIndex(lower, headStart, headEnd);
    if (firstContent >= 0 && metaIndex > firstContent) {
      issues.push(`${filePath}: <meta charset="UTF-8"> deve vir antes de title/link/script/style no <head>`);
    }

    return issues;
  }

  #firstHeadContentIndex(lower, headStart, headEnd) {
    if (headStart < 0 || headEnd < 0) return -1;

    const candidates = ['<title', '<link', '<script', '<style'];
    return candidates
      .map((tag) => lower.indexOf(tag, headStart))
      .filter((index) => index >= 0 && index < headEnd)
      .sort((a, b) => a - b)[0] ?? -1;
  }
}

class Utf8SourceScanner {
  static TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.mjs', '.cjs', '.txt', '.md', '.hbs', '.ejs']);
  static DEFAULT_TARGETS = [
    'apps',
    'shared',
    'admin',
    'admin.html',
    'profissional.html',
    'server.js',
    'vercel.json',
  ];

  constructor({
    rootDir = path.resolve(__dirname, '..'),
    targets = Utf8SourceScanner.DEFAULT_TARGETS,
    normalizer = new Utf8MojibakeNormalizer(),
    htmlValidator = new HtmlCharsetValidator(),
  } = {}) {
    this.rootDir = rootDir;
    this.targets = targets;
    this.normalizer = normalizer;
    this.htmlValidator = htmlValidator;
  }

  collectFiles() {
    const files = [];

    for (const target of this.targets) {
      const fullPath = path.resolve(this.rootDir, target);
      if (!fs.existsSync(fullPath)) continue;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        this.#walk(fullPath, files);
      } else if (this.#isTextFile(fullPath)) {
        files.push(fullPath);
      }
    }

    return [...new Set(files)].sort();
  }

  inspectFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    const raw = hasBom ? buffer.subarray(3) : buffer;
    const original = raw.toString('utf8');
    const normalized = this.normalizer.normalizeText(original);
    const relativePath = this.#relative(filePath);

    return {
      filePath,
      relativePath,
      original,
      normalized,
      hasBom,
      changed: hasBom || normalized !== original,
      beforeScore: this.normalizer.score(original),
      afterScore: this.normalizer.score(normalized),
      hasReplacement: this.normalizer.hasUnrecoverableReplacement(normalized),
      htmlIssues: this.htmlValidator.validate(relativePath, normalized),
    };
  }

  scan({ write = false, check = false } = {}) {
    const reports = this.collectFiles().map((filePath) => this.inspectFile(filePath));

    if (write) {
      for (const report of reports) {
        if (!report.changed) continue;
        fs.writeFileSync(report.filePath, report.normalized, 'utf8');
      }
    }

    const changed = reports.filter((report) => report.changed);
    const remaining = reports.filter((report) => report.afterScore > 0 || report.hasReplacement || report.htmlIssues.length > 0);

    return {
      scanned: reports.length,
      changed,
      remaining,
      failures: check ? remaining : [],
    };
  }

  #walk(dir, files) {
    if (this.#shouldSkipPath(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (this.#shouldSkipPath(fullPath)) continue;

      if (entry.isDirectory()) {
        this.#walk(fullPath, files);
      } else if (entry.isFile() && this.#isTextFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  #isTextFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!Utf8SourceScanner.TEXT_EXTENSIONS.has(ext)) return false;
    if (filePath.endsWith('.min.js')) return false;
    if (/package-lock\.json$/i.test(filePath)) return false;
    if (/supabase\.min\.js$/i.test(filePath)) return false;
    return true;
  }

  #shouldSkipPath(filePath) {
    const relative = this.#relative(filePath).replace(/\\/g, '/');
    const parts = relative.split('/');
    if (parts.some((part) => part === 'node_modules' || part === '.git' || part === 'dist' || part === 'coverage')) return true;
    if (parts.some((part) => part.startsWith('.tmp'))) return true;
    if (relative.startsWith('shared/vendor/')) return true;
    if (relative.startsWith('shared/fonts/')) return true;
    if (relative.startsWith('shared/img/')) return true;
    if (relative.startsWith('shared/sounds/')) return true;
    return false;
  }

  #relative(filePath) {
    return path.relative(this.rootDir, filePath);
  }
}

class Utf8NormalizationCli {
  constructor({ argv = process.argv.slice(2), stdout = console.log, stderr = console.error } = {}) {
    this.argv = argv;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  run() {
    const mode = this.#mode();
    const scanner = new Utf8SourceScanner();
    const report = scanner.scan({ write: mode === 'write', check: mode === 'check' });

    this.#printReport(report, mode);

    if (report.failures.length > 0) {
      process.exitCode = 1;
    }
  }

  #mode() {
    if (this.argv.includes('--write')) return 'write';
    if (this.argv.includes('--check')) return 'check';
    return 'dry-run';
  }

  #printReport(report, mode) {
    this.stdout(`UTF-8 mojibake ${mode}: ${report.scanned} arquivos analisados`);

    if (report.changed.length > 0) {
      this.stdout(`Arquivos ${mode === 'write' ? 'normalizados' : 'que seriam normalizados'}:`);
      for (const item of report.changed) {
        this.stdout(`- ${item.relativePath} (${item.beforeScore} -> ${item.afterScore}${item.hasBom ? ', BOM removido' : ''})`);
      }
    } else {
      this.stdout('Nenhum arquivo precisa de normalizacao.');
    }

    if (report.remaining.length > 0) {
      this.stderr('Pendencias encontradas:');
      for (const item of report.remaining) {
        const issues = [
          item.afterScore > 0 ? `mojibakeScore=${item.afterScore}` : null,
          item.hasReplacement ? 'replacement-char' : null,
          ...item.htmlIssues,
        ].filter(Boolean).join('; ');
        this.stderr(`- ${item.relativePath}: ${issues}`);
      }
    }
  }
}

if (require.main === module) {
  new Utf8NormalizationCli().run();
}

module.exports = {
  HtmlCharsetValidator,
  Utf8MojibakeNormalizer,
  Utf8NormalizationCli,
  Utf8SourceScanner,
};
