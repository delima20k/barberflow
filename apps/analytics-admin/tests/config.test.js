'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class AdminConfigFixture {
  static load() {
    const root = path.resolve(__dirname, '..');
    const context = vm.createContext({ globalThis: {} });
    ['config/runtime-config.js', 'config/admin-config.js', 'config/event-catalog.js']
      .forEach((relativePath) => {
        vm.runInContext(
          fs.readFileSync(path.join(root, relativePath), 'utf8'),
          context,
          { filename: relativePath },
        );
      });
    return context.globalThis;
  }
}

describe('AdminConfig', () => {
  it('deve iniciar em demo sem credenciais ou URLs inventadas', () => {
    const globals = AdminConfigFixture.load();

    assert.equal(globals.AdminConfig.mode, 'demo');
    assert.equal(globals.AdminConfig.supabaseUrl, '');
    assert.equal(globals.AdminConfig.supabasePublishableKey, '');
    assert.equal(globals.AdminConfig.collectorUrl, '');
    assert.equal(globals.AdminConfig.productionUrl, 'https://superadmin.barberflow.live');
    assert.match(globals.AdminConfig.buildVersion, /^[a-z0-9._-]+$/i);
    assert.equal(globals.AdminConfig.isSupabaseReady(), false);
  });

  it('deve limitar o catalogo aos eventos essenciais e futuros preparados', () => {
    const { AnalyticsEventCatalog } = AdminConfigFixture.load();
    const essential = AnalyticsEventCatalog.essential();

    assert.deepEqual(
      [...essential],
      [
        'landing_view',
        'cta_click',
        'voucher_modal_opened',
        'email_input_started',
        'email_submitted',
        'voucher_generated',
        'scroll_25',
        'scroll_50',
        'scroll_75',
        'scroll_100',
        'session_started',
        'session_ended',
      ],
    );
    assert.equal(AnalyticsEventCatalog.isFuture('account_created'), true);
    assert.equal(AnalyticsEventCatalog.isFuture('email_confirmed'), true);
    assert.equal(AnalyticsEventCatalog.isFuture('first_login'), true);
  });
});
