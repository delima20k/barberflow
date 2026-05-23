#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

class BundleBudgetChecker {
  static DEFAULT_LIMIT_KB = 350;
  static SECTION_LIMIT_KB = 90;

  constructor({
    distDir = path.resolve(__dirname, '..', 'dist/vite'),
    maxKb = Number(process.env.BF_BUNDLE_MAX_KB || BundleBudgetChecker.DEFAULT_LIMIT_KB),
    sectionMaxKb = Number(process.env.BF_SECTION_CHUNK_MAX_KB || BundleBudgetChecker.SECTION_LIMIT_KB),
  } = {}) {
    this.distDir = distDir;
    this.maxBytes = maxKb * 1024;
    this.sectionMaxBytes = sectionMaxKb * 1024;
  }

  run() {
    const files = this.#javascriptFiles(this.distDir);
    const violations = files.flatMap((file) => this.#violationsFor(file));
    const report = files.map((file) => this.#measure(file));

    console.table(report.map((item) => ({
      chunk: path.relative(this.distDir, item.file).replace(/\\/g, '/'),
      kb: (item.bytes / 1024).toFixed(1),
      gzipKb: (item.gzipBytes / 1024).toFixed(1),
      brotliKb: (item.brotliBytes / 1024).toFixed(1),
    })));

    if (violations.length > 0) {
      throw new Error(`Bundle budget excedido:\n${violations.join('\n')}`);
    }
  }

  #javascriptFiles(dir) {
    if (!fs.existsSync(dir)) throw new Error(`Diretorio de build nao encontrado: ${dir}`);
    const stack = [dir];
    const files = [];
    while (stack.length > 0) {
      const current = stack.pop();
      fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(fullPath);
        if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
      });
    }
    return files;
  }

  #violationsFor(file) {
    const { bytes } = this.#measure(file);
    const name = path.basename(file);
    const limit = name.startsWith('section-') ? this.sectionMaxBytes : this.maxBytes;
    return bytes > limit ? [`${name}: ${(bytes / 1024).toFixed(1)} KB > ${(limit / 1024).toFixed(1)} KB`] : [];
  }

  #measure(file) {
    const buffer = fs.readFileSync(file);
    return {
      file,
      bytes: buffer.length,
      gzipBytes: zlib.gzipSync(buffer).length,
      brotliBytes: zlib.brotliCompressSync(buffer).length,
    };
  }
}

try {
  new BundleBudgetChecker().run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
