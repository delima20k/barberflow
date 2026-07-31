'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class AnalyticsAdminStructureFixture {
  static root = path.resolve(__dirname, '..');

  static source(relativePath) {
    return fs.readFileSync(path.join(this.root, relativePath), 'utf8');
  }
}

describe('Analytics Admin structure', () => {
  it('deve manter o aplicativo isolado e completo', () => {
    const requiredFiles = [
      'index.html',
      'manifest.json',
      'service-worker.js',
      'vercel.json',
      'ANALYTICS_ADMIN.md',
      'CLASS_REGISTRY.md',
      'config/admin-config.js',
      'config/event-catalog.js',
      'config/runtime-config.js',
      'js/app.js',
      'js/router.js',
      'pages/LoginPage.js',
      'pages/DashboardPage.js',
      'pages/FunnelPage.js',
      'pages/SessionsPage.js',
      'services/AuthService.js',
      'services/AnalyticsRepository.js',
      'services/MetricsService.js',
      'services/PresenceService.js',
      'services/RealtimeAnalyticsService.js',
      'services/SnapshotService.js',
      'utils/SpreadsheetValueSanitizer.js',
      'supabase/migrations/20260730000001_create_analytics_admin.sql',
      'supabase/functions/collect-analytics-event/index.ts',
    ];

    requiredFiles.forEach((relativePath) => {
      assert.equal(fs.existsSync(path.join(AnalyticsAdminStructureFixture.root, relativePath)), true);
    });
  });

  it('deve declarar as quatro paginas e o modo demonstracao', () => {
    const html = AnalyticsAdminStructureFixture.source('index.html');

    assert.match(html, /data-page="login"/);
    assert.match(html, /data-page="dashboard"/);
    assert.match(html, /data-page="funnel"/);
    assert.match(html, /data-page="sessions"/);
    assert.match(html, /Dados demonstrativos/);
    assert.doesNotMatch(html, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  });

  it('deve carregar filtros globais e deixar o SDK Supabase fora do demo', () => {
    const html = AnalyticsAdminStructureFixture.source('index.html');
    const app = AnalyticsAdminStructureFixture.source('js/app.js');
    const factory = AnalyticsAdminStructureFixture.source('services/SupabaseClientFactory.js');

    assert.match(html, /data-global-filter-bar/);
    assert.doesNotMatch(html, /<script[^>]+supabase\.min\.js/);
    assert.match(app, /new globalThis\.FilterBar/);
    assert.match(factory, /if \(!config\?\.isSupabaseReady\?\.\(\)\) return null/);
    assert.equal(
      fs.existsSync(path.join(AnalyticsAdminStructureFixture.root, 'utils/DomFactory.js')),
      false,
    );
  });

  it('deve incluir os scripts de build quando a Vercel usa o app como raiz', () => {
    const repositoryRoot = path.resolve(AnalyticsAdminStructureFixture.root, '..', '..');
    const vercelIgnore = fs.readFileSync(
      path.join(repositoryRoot, '.vercelignore'),
      'utf8',
    );
    const rules = vercelIgnore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const packageJson = JSON.parse(AnalyticsAdminStructureFixture.source('package.json'));

    assert.equal(rules.includes('scripts/'), false);
    assert.equal(rules.includes('/scripts/'), true);
    assert.match(packageJson.scripts.build, /node scripts\/configure-runtime\.mjs/);
    assert.equal(
      fs.existsSync(path.join(AnalyticsAdminStructureFixture.root, 'scripts/configure-runtime.mjs')),
      true,
    );
  });
});
