'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MetricsFixture {
  static load() {
    const context = vm.createContext({ globalThis: {} });
    const root = path.resolve(__dirname, '..');
    ['services/MockAnalyticsDataSource.js', 'services/MetricsService.js']
      .forEach((relativePath) => vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
      ));
    return context.globalThis;
  }
}

describe('MetricsService', () => {
  it('deve calcular metricas e funil sem mutar os eventos', () => {
    const { MockAnalyticsDataSource, MetricsService } = MetricsFixture.load();
    const source = new MockAnalyticsDataSource();
    const events = source.events();
    const before = JSON.stringify(events);
    const service = new MetricsService();

    const metrics = service.summarize(events, source.sessions());
    const funnel = service.funnel(events);

    assert.ok(metrics.visitorsToday > 0);
    assert.ok(metrics.ctaClicks > 0);
    assert.equal(funnel[0].eventName, 'landing_view');
    assert.equal(funnel.at(-1).eventName, 'first_login');
    assert.equal(JSON.stringify(events), before);
  });

  it('deve aplicar os mesmos filtros a eventos e sessoes', () => {
    const { MockAnalyticsDataSource, MetricsService } = MetricsFixture.load();
    const source = new MockAnalyticsDataSource();
    const service = new MetricsService();
    const filters = { source: 'instagram', campaign: 'all' };

    const events = service.filter(source.events(), filters);
    const sessions = service.filterSessions(source.sessions(), filters);
    const metrics = service.summarize(events, sessions, [
      { visitorId: 'visitor-yesterday' },
    ]);

    assert.ok(events.every((event) => event.source === 'instagram'));
    assert.ok(sessions.every((session) => session.source === 'instagram'));
    assert.equal(metrics.visitorsYesterday, 1);
  });
});
