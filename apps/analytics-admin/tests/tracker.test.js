'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('LandingAnalyticsTracker privacy guard', () => {
  it('deve permanecer inerte quando desativado', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'landing-page', 'js', 'analytics-tracker.js'),
      'utf8',
    );
    let networkCalls = 0;
    const context = vm.createContext({
      globalThis: {},
      fetch() {
        networkCalls += 1;
      },
    });
    vm.runInContext(source, context);
    const tracker = new context.globalThis.LandingAnalyticsTracker({ enabled: false });

    assert.equal(tracker.init(), tracker);
    assert.equal(tracker.track('landing_view'), false);
    assert.equal(networkCalls, 0);
  });

  it('não deve persistir o email cru na fila local', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'landing-page', 'js', 'analytics-tracker.js'),
      'utf8',
    );

    assert.match(source, /delete queuedPayload\.email/);
    assert.doesNotMatch(source, /localStorage\.setItem\([^)]*email/i);
  });
});
