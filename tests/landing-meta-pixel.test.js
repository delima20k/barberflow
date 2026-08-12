'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const ROOT = join(__dirname, '..');
const LANDING_ROOT = join(ROOT, 'apps', 'landing-page');

class MetaPixelFixture {
  constructor({ existingFbq = null } = {}) {
    this.insertedScripts = [];
    this.firstScript = {
      parentNode: {
        insertBefore: (script) => this.insertedScripts.push(script),
      },
    };
    this.document = {
      createElement: (tagName) => ({ tagName: tagName.toUpperCase() }),
      getElementsByTagName: (tagName) => (tagName === 'script' ? [this.firstScript] : []),
      head: { appendChild: (script) => this.insertedScripts.push(script) },
    };
    this.context = vm.createContext({
      console,
      document: this.document,
      ...(existingFbq ? { fbq: existingFbq } : {}),
    });
    vm.runInContext(
      readFileSync(join(LANDING_ROOT, 'js', 'meta-pixel.js'), 'utf8'),
      this.context,
    );
  }

  createTracker() {
    return new this.context.MetaPixelTracker(this.document);
  }

  calls() {
    return JSON.parse(JSON.stringify(this.context.fbq?.queue ?? []));
  }

}

describe('MetaPixelTracker', () => {
  it('deve carregar o SDK e enviar init e PageView uma unica vez', () => {
    const fixture = new MetaPixelFixture();
    const tracker = fixture.createTracker();

    tracker.init();
    tracker.init();

    assert.deepEqual(fixture.calls(), [
      ['init', '2486237658515097'],
      ['track', 'PageView'],
    ]);
    assert.equal(fixture.insertedScripts.length, 1);
    assert.equal(
      fixture.insertedScripts[0].src,
      'https://connect.facebook.net/en_US/fbevents.js',
    );
  });

  it('deve enviar VoucherStart somente quando o fluxo solicitar', () => {
    const fixture = new MetaPixelFixture();
    const tracker = fixture.createTracker().init();

    tracker.trackVoucherStart();

    assert.deepEqual(fixture.calls().slice(-1), [
      ['trackCustom', 'VoucherStart'],
    ]);
  });

  it('deve enviar um CompleteRegistration por codigo sem transmitir o codigo a Meta', () => {
    const fixture = new MetaPixelFixture();
    const tracker = fixture.createTracker().init();

    assert.equal(tracker.trackCompleteRegistration(' ABC123 '), true);
    assert.equal(tracker.trackCompleteRegistration('ABC123'), false);
    assert.equal(fixture.createTracker().trackCompleteRegistration('ABC123'), false);
    assert.equal(tracker.trackCompleteRegistration(''), false);

    assert.deepEqual(fixture.calls().filter((call) => call[1] === 'CompleteRegistration'), [
      ['track', 'CompleteRegistration'],
    ]);
  });

  it('deve enviar GoToSignup como evento personalizado', () => {
    const fixture = new MetaPixelFixture();
    const tracker = fixture.createTracker().init();

    assert.equal(tracker.trackGoToSignup(), true);

    assert.deepEqual(fixture.calls().slice(-1), [
      ['trackCustom', 'GoToSignup'],
    ]);
  });

  it('deve isolar falhas do fbq sem interromper o fluxo chamador', () => {
    const fixture = new MetaPixelFixture({
      existingFbq: () => { throw new Error('pixel blocked'); },
    });
    const tracker = fixture.createTracker();

    assert.doesNotThrow(() => tracker.init());
    assert.equal(tracker.trackVoucherStart(), false);
    assert.equal(tracker.trackCompleteRegistration('ABC123'), false);
    assert.equal(tracker.trackGoToSignup(), false);
  });
});

describe('Meta Pixel na landing', () => {
  it('deve marcar apenas os nove CTAs que abrem o voucher', () => {
    const html = readFileSync(join(LANDING_ROOT, 'index.html'), 'utf8');
    const markedTags = html.match(/<[^>]+data-meta-event="voucher-start"[^>]*>/g) ?? [];

    assert.equal(markedTags.length, 9);
    markedTags.forEach((tag) => assert.match(tag, /data-open-voucher/));
  });

  it('deve identificar somente o link pos-voucher para entrada no app', () => {
    const html = readFileSync(join(LANDING_ROOT, 'index.html'), 'utf8');
    const signupLinks = html.match(
      /<a[^>]+data-voucher-app-link[^>]*>Entrar no app profissional<\/a>/g,
    ) ?? [];

    assert.equal(signupLinks.length, 1);
    assert.ok(
      signupLinks[0].includes('href="https://pro.barberflow.live/?start=signup"'),
    );
  });

  it('deve carregar o tracker somente na landing e liberar a CSP minima', () => {
    const html = readFileSync(join(LANDING_ROOT, 'index.html'), 'utf8');
    const vercel = readFileSync(join(LANDING_ROOT, 'vercel.json'), 'utf8');

    assert.match(html, /<script src="\.\/js\/meta-pixel\.js" defer><\/script>/);
    assert.match(html, /facebook\.com\/tr\?id=2486237658515097&ev=PageView&noscript=1/);
    assert.match(vercel, /script-src[^;]*https:\/\/connect\.facebook\.net/);
    assert.match(vercel, /img-src[^;]*https:\/\/www\.facebook\.com/);
    assert.match(vercel, /connect-src[^;]*https:\/\/www\.facebook\.com/);
    assert.doesNotMatch(vercel, /script-src[^;]*'unsafe-inline'/);
  });

  it('nao deve instalar o Pixel nas paginas legais internas', () => {
    const legalRoot = join(LANDING_ROOT, 'legal');
    const legalPages = readdirSync(legalRoot).filter((file) => file.endsWith('.html'));

    legalPages.forEach((file) => {
      const html = readFileSync(join(legalRoot, file), 'utf8');
      assert.doesNotMatch(html, /meta-pixel|fbevents|fbq\(|2486237658515097/i);
    });
  });
});
