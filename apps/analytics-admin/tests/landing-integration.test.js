'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

class LandingIntegrationFixture {
  static repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  static landingRoot = path.join(this.repositoryRoot, 'apps', 'landing-page');

  static source(relativePath) {
    return fs.readFileSync(path.join(this.landingRoot, relativePath), 'utf8');
  }
}

describe('Landing analytics integration', () => {
  it('deve instalar o tracker desativado sem valores de producao', () => {
    const html = LandingIntegrationFixture.source('index.html');
    const config = LandingIntegrationFixture.source('config/landing-config.js');
    const tracker = LandingIntegrationFixture.source('js/analytics-tracker.js');

    assert.match(html, /<script src="\.\/js\/analytics-tracker\.js" defer><\/script>/);
    assert.match(config, /analyticsEnabled:\s*false/);
    assert.match(config, /analyticsCollectorUrl:\s*''/);
    assert.match(config, /analyticsPublishableKey:\s*''/);
    assert.doesNotMatch(config, /analyticsSupabaseUrl/);
    assert.match(tracker, /class LandingAnalyticsTracker\b/);
    assert.doesNotMatch(tracker, /service_role|SUPABASE_SERVICE_ROLE_KEY/i);
  });

  it('deve monitorar somente os eventos essenciais sem capturar teclas', () => {
    const html = LandingIntegrationFixture.source('index.html');
    const analytics = LandingIntegrationFixture.source('js/analytics.js');
    const tracker = LandingIntegrationFixture.source('js/analytics-tracker.js');
    const modal = LandingIntegrationFixture.source('js/voucher-modal.js');

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
    ].forEach((eventName) => assert.match(`${analytics}\n${tracker}`, new RegExp(eventName)));

    assert.match(html, /data-analytics-start="email_input_started"/);
    assert.match(html, /data-analytics-event="cta_click"/);
    assert.match(modal, /track\?\.\('email_submitted',\s*\{\s*email\s*\}\)/);
    assert.doesNotMatch(tracker, /keydown|keypress|keyup|event\.key|input\.value/);
  });
});
