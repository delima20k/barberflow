const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const SECTION_ROOT = path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage');
const SECTION_NAMES = ['Agenda', 'Story', 'Portfolio', 'Notification', 'Queue', 'Analytics', 'Settings'];

function url(relativePath) {
  return pathToFileURL(path.join(ROOT, relativePath)).href;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function importsFrom(relativePath) {
  const source = read(relativePath);
  return [...source.matchAll(/import(?:\s+[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

function moduleFiles() {
  const files = [
    'shared/js/SectionEventCatalog.js',
    'shared/js/PageSection.js',
    'shared/js/SectionEventBus.js',
    'apps/profissional/assets/js/pages/MinhaBarbeariaPage.js',
    'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js',
    'apps/profissional/assets/js/pages/MinhaBarbeariaPage/QueueRealtimeClient.js',
  ];

  const stack = [SECTION_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile() && entry.name.endsWith('.js')) files.push(path.relative(ROOT, fullPath).replace(/\\/g, '/'));
    });
  }
  return [...new Set(files)];
}

function assertNoCycles(files) {
  const graph = new Map();
  const moduleSet = new Set(files);
  files.forEach((file) => {
    const dir = path.dirname(file);
    const deps = importsFrom(file)
      .filter((specifier) => specifier.startsWith('.'))
      .map((specifier) => path.normalize(path.join(dir, specifier)).replace(/\\/g, '/'))
      .filter((specifier) => moduleSet.has(specifier));
    graph.set(file, deps);
  });

  const visiting = new Set();
  const visited = new Set();
  const visit = (file, trail = []) => {
    if (visiting.has(file)) {
      throw new Error(`Ciclo de modulo detectado: ${[...trail, file].join(' -> ')}`);
    }
    if (visited.has(file)) return;
    visiting.add(file);
    graph.get(file)?.forEach((dep) => visit(dep, [...trail, file]));
    visiting.delete(file);
    visited.add(file);
  };
  files.forEach((file) => visit(file));
}

describe('ES modules por Section', () => {
  it('cada Section possui index.js com exports nomeados importaveis', async () => {
    for (const name of SECTION_NAMES) {
      const module = await import(url(`apps/profissional/assets/js/pages/MinhaBarbeariaPage/${name}Section/index.js`));
      assert.equal(typeof module[`${name}Section`], 'function');
      assert.equal(typeof module[`${name}Controller`], 'function');
      assert.equal(typeof module[`${name}State`], 'function');
      assert.equal(typeof module[`${name}View`], 'function');
      assert.equal('default' in module, false);
    }
  });

  it('MinhaBarbeariaPage importa runtime e runtime importa EventBus/Sections estaticas', () => {
    const page = read('apps/profissional/assets/js/pages/MinhaBarbeariaPage.js');
    const runtime = read('apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js');

    assert.match(page, /import \{ MinhaBarbeariaRuntimeController \}/);
    assert.match(runtime, /shared\/js\/SectionEventCatalog\.js/);
    assert.equal(runtime.includes('events/catalog.js'), false);
    assert.match(runtime, /import \{ SectionEventBus \}/);
    assert.match(runtime, /from '\.\/AgendaSection\/index\.js'/);
    assert.match(runtime, /from '\.\/QueueSection\/index\.js'/);
  });

  it('Story e Portfolio ficam fora do HTML e entram por import dinamico', () => {
    const html = read('apps/profissional/index.html');
    const runtime = read('apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js');

    assert.equal(html.includes('StorySection/Story'), false);
    assert.equal(html.includes('PortfolioSection/Portfolio'), false);
    assert.match(runtime, /import\('\.\/StorySection\/index\.js'\)/);
    assert.match(runtime, /import\('\.\/PortfolioSection\/index\.js'\)/);
  });

  it('grafo local de modulos nao possui ciclos', () => {
    assert.doesNotThrow(() => assertNoCycles(moduleFiles()));
  });
});
