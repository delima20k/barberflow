'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  HtmlCharsetValidator,
  Utf8MojibakeNormalizer,
  Utf8SourceScanner,
} = require('../scripts/fix-utf8-mojibake.js');

describe('Utf8MojibakeNormalizer', () => {
  it('deve corrigir acentos corrompidos por mojibake', () => {
    const normalizer = new Utf8MojibakeNormalizer();

    assert.equal(
      normalizer.normalizeText('PortfÃ³lio da Barbearia'),
      'Portfólio da Barbearia',
    );
  });

  it('deve corrigir multiplas palavras corrompidas na mesma linha', () => {
    const normalizer = new Utf8MojibakeNormalizer();

    assert.equal(
      normalizer.normalizeText('Barbearias PrÃ³ximas de VocÃª'),
      'Barbearias Próximas de Você',
    );
  });

  it('deve preservar texto que ja esta correto', () => {
    const normalizer = new Utf8MojibakeNormalizer();
    const texto = 'Portfólio da Barbearia - Próximas de Você';

    assert.equal(normalizer.normalizeText(texto), texto);
  });

  it('deve preservar URLs e codigo sem mojibake', () => {
    const normalizer = new Utf8MojibakeNormalizer();
    const texto = 'const url = "https://pro.barberflow.live/portfolio?tab=home";';

    assert.equal(normalizer.normalizeText(texto), texto);
  });

  it('deve corrigir pontuacao e emoji mojibake quando recuperavel', () => {
    const normalizer = new Utf8MojibakeNormalizer();

    assert.equal(
      normalizer.normalizeText('Seguro â€” status ðŸ”’'),
      'Seguro — status 🔒',
    );
  });

  it('deve corrigir emoji com variacao e dupla conversao de ligatura', () => {
    const normalizer = new Utf8MojibakeNormalizer();

    assert.equal(
      normalizer.normalizeText('Você foi chamado! âÅ“‚ï¸ ©ï¸'),
      'Você foi chamado! ✂️ ©️',
    );
  });
});

describe('HtmlCharsetValidator', () => {
  it('deve aceitar um unico meta charset UTF-8 no head antes do title', () => {
    const validator = new HtmlCharsetValidator();
    const html = '<!doctype html><html><head><meta charset="UTF-8"><title>Ok</title></head></html>';

    assert.deepEqual(validator.validate('index.html', html), []);
  });

  it('deve falhar quando html nao tem meta charset', () => {
    const validator = new HtmlCharsetValidator();
    const html = '<!doctype html><html><head><title>Sem charset</title></head></html>';

    assert.match(validator.validate('index.html', html).join('\n'), /exatamente 1/);
  });

  it('deve falhar quando html tem charset duplicado', () => {
    const validator = new HtmlCharsetValidator();
    const html = '<html><head><meta charset="UTF-8"><meta charset="UTF-8"></head></html>';

    assert.match(validator.validate('index.html', html).join('\n'), /encontrado 2/);
  });
});

describe('Utf8SourceScanner', () => {
  it('deve detectar BOM e normalizar arquivo em modo write', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-utf8-'));
    const appDir = path.join(tmp, 'apps');
    fs.mkdirSync(appDir);
    const file = path.join(appDir, 'index.html');
    fs.writeFileSync(
      file,
      Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('<!doctype html><html><head><meta charset="UTF-8"><title>PortfÃ³lio</title></head></html>', 'utf8'),
      ]),
    );

    const scanner = new Utf8SourceScanner({ rootDir: tmp, targets: ['apps'] });
    const report = scanner.scan({ write: true });
    const output = fs.readFileSync(file);

    assert.equal(report.changed.length, 1);
    assert.equal(output[0] === 0xef && output[1] === 0xbb && output[2] === 0xbf, false);
    assert.equal(output.toString('utf8').includes('Portfólio'), true);
  });

  it('deve reportar pendencias no modo check', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-utf8-'));
    const appDir = path.join(tmp, 'apps');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(appDir, 'index.html'), '<html><head><title>PortfÃ³lio</title></head></html>', 'utf8');

    const scanner = new Utf8SourceScanner({ rootDir: tmp, targets: ['apps'] });
    const report = scanner.scan({ check: true });

    assert.equal(report.failures.length, 1);
  });
});
