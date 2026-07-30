import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

class StaticProjectValidator {
  #root;
  #errors = [];

  constructor(root) {
    this.#root = root;
  }

  async validate() {
    await this.#validateJson();
    await this.#validateHtmlReferences();
    await this.#validateServiceWorkerShell();
    await this.#validateJavaScript();
    await this.#validateDemoIsolation();

    if (this.#errors.length) {
      throw new Error(`Validacao falhou:\n- ${this.#errors.join('\n- ')}`);
    }
  }

  async #validateJson() {
    for (const relativePath of ['manifest.json', 'package.json', 'vercel.json']) {
      try {
        JSON.parse(await this.#read(relativePath));
      } catch (error) {
        this.#errors.push(`${relativePath}: JSON invalido (${error.message})`);
      }
    }
  }

  async #validateHtmlReferences() {
    const html = await this.#read('index.html');
    const references = [...html.matchAll(/(?:href|src)="\.\/([^"#?]+)"/g)]
      .map((match) => match[1]);
    await this.#assertFilesExist(references, 'index.html');
  }

  async #validateServiceWorkerShell() {
    const worker = await this.#read('service-worker.js');
    const references = [...worker.matchAll(/'\.\/([^']+)'/g)]
      .map((match) => match[1])
      .filter(Boolean);
    await this.#assertFilesExist(references, 'service-worker.js');
  }

  async #validateJavaScript() {
    const files = await this.#walk(this.#root);
    for (const absolutePath of files) {
      const relativePath = path.relative(this.#root, absolutePath).replaceAll('\\', '/');
      if (!/\.(?:js|mjs)$/.test(relativePath) || relativePath.startsWith('assets/vendor/')) {
        continue;
      }
      const result = spawnSync(process.execPath, ['--check', absolutePath], {
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        this.#errors.push(`${relativePath}: ${result.stderr.trim()}`);
      }
    }
  }

  async #validateDemoIsolation() {
    const source = await this.#read('config/runtime-config.js');
    const match = source.match(/Object\.freeze\((\{[\s\S]*\})\)/);
    if (!match) {
      this.#errors.push('config/runtime-config.js: formato inesperado');
      return;
    }
    const runtime = JSON.parse(match[1]);
    if (runtime.mode === 'demo' && (
      runtime.supabaseUrl
      || runtime.supabasePublishableKey
      || runtime.collectorUrl
    )) {
      this.#errors.push('modo DEMO nao pode conter configuracao do Supabase');
    }
  }

  async #assertFilesExist(relativePaths, owner) {
    for (const relativePath of new Set(relativePaths)) {
      try {
        await stat(path.join(this.#root, relativePath));
      } catch {
        this.#errors.push(`${owner}: referencia ausente ${relativePath}`);
      }
    }
  }

  async #walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? this.#walk(absolutePath) : [absolutePath];
    }));
    return nested.flat();
  }

  #read(relativePath) {
    return readFile(path.join(this.#root, relativePath), 'utf8');
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await new StaticProjectValidator(root).validate();
process.stdout.write('Analytics Admin: estrutura, sintaxe e modo DEMO validados.\n');
