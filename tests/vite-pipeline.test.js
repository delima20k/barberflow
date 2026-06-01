const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

describe('Vite pipeline canario', () => {
  it('configura Vite com aliases, manifest, sourcemap e chunks por section', () => {
    const config = read('vite.config.mjs');

    assert.match(config, /manifest:\s*true/);
    assert.match(config, /sourcemap:\s*true/);
    assert.match(config, /'@shared'/);
    assert.match(config, /'@sections'/);
    assert.match(config, /section-story/);
    assert.match(config, /section-portfolio/);
    assert.match(config, /vendor-supabase/);
    assert.match(config, /vendor-maps/);
  });

  it('package.json expõe scripts de build, preview, dev server e Lighthouse CI', () => {
    const pkg = JSON.parse(read('package.json'));

    assert.equal(pkg.scripts['dev:vite'], 'vite --host 0.0.0.0');
    assert.match(pkg.scripts['build:vite'], /vite build/);
    assert.match(pkg.scripts['build:vite'], /check-bundle-size/);
    assert.match(pkg.scripts['preview:vite'], /vite preview/);
    assert.match(pkg.scripts['perf:lhci'], /lhci autorun/);
  });

  it('valida import.meta.env com erro tipado e snapshot imutavel', async () => {
    const module = await import(pathToFileURL(path.join(ROOT, 'src/vite/ViteEnvValidator.js')).href);
    const ok = module.ViteEnvValidator.validate({
      appName: 'teste',
      env: { VITE_BFF_BASE_URL: 'https://bff.example.test' },
      required: ['VITE_BFF_BASE_URL'],
    });

    assert.equal(ok.VITE_BFF_BASE_URL, 'https://bff.example.test');
    assert.throws(() => {
      module.ViteEnvValidator.validate({
        appName: 'teste',
        env: { VITE_BFF_BASE_URL: 'not-url' },
        required: ['VITE_BFF_BASE_URL'],
      });
    }, /Vite env invalido/);
  });

  it('registra artefatos e plano de rollout da Fase 3', () => {
    assert.equal(exists('docs/perf/fase-3/resultados.md'), true);
    assert.equal(exists('docs/perf/fase-3/rollout.md'), true);
    assert.equal(exists('docs/perf/fase-3/bundle.html'), true);
    assert.equal(exists('lighthouserc.cjs'), true);
  });
});
