'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class PwaFixture {
  static root = path.resolve(__dirname, '..');

  static source(relativePath) {
    return fs.readFileSync(path.join(this.root, relativePath), 'utf8');
  }
}

describe('Analytics Admin PWA', () => {
  it('deve declarar manifest, icones e service worker isolado', () => {
    const manifest = JSON.parse(PwaFixture.source('manifest.json'));
    const worker = PwaFixture.source('service-worker.js');
    const html = PwaFixture.source('index.html');

    assert.equal(manifest.name, 'Analytics Admin');
    assert.equal(manifest.id, './');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.length >= 3);
    assert.match(html, /rel="manifest"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(worker, /analytics-admin-shell-/);
    assert.match(worker, /importScripts\('\.\/config\/runtime-config\.js'\)/);
    assert.match(worker, /buildVersion/);
    assert.match(worker, /mode\s*===\s*'supabase'/);
    assert.doesNotMatch(worker, /caches\.keys\(\)[\s\S]*map\(\s*\([^)]*\)\s*=>\s*caches\.delete/);
  });

  it('deve identificar snapshots offline com data e hora', () => {
    const html = PwaFixture.source('index.html');
    const snapshot = PwaFixture.source('services/SnapshotService.js');
    const app = PwaFixture.source('js/app.js');

    assert.match(html, /data-offline-state/);
    assert.match(snapshot, /savedAt/);
    assert.match(snapshot, /lastSnapshot/);
    assert.match(app, /navigator\.onLine/);
    assert.match(app, /#offline\.show\(snapshot\)/);
  });

  it('deve verificar atualizacoes e assumir o novo worker sem loop de reload', () => {
    const app = PwaFixture.source('js/app.js');

    assert.match(app, /registration\.update\(\)/);
    assert.match(app, /controllerchange/);
    assert.match(app, /analytics_admin_sw_reloaded/);
  });
});
