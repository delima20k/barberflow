'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class ExportFixture {
  static load() {
    const context = vm.createContext({ globalThis: {} });
    const root = path.resolve(__dirname, '..');
    ['utils/SpreadsheetValueSanitizer.js', 'utils/CsvExporter.js', 'utils/ExcelExporter.js']
      .forEach((relativePath) => vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
      ));
    return context.globalThis;
  }
}

describe('Exporters', () => {
  it('deve escapar CSV e produzir SpreadsheetML valido', () => {
    const { CsvExporter, ExcelExporter } = ExportFixture.load();
    const rows = [{ event: 'cta_click', description: 'Botao, principal' }];

    const csv = CsvExporter.serialize(rows);
    const excel = ExcelExporter.serialize(rows);

    assert.match(csv, /"Botao, principal"/);
    assert.match(excel, /<Workbook/);
    assert.match(excel, /cta_click/);
    assert.doesNotMatch(excel, /undefined|\[object Object\]/);
  });

  it('deve neutralizar formulas em todos os formatos exportados', () => {
    const { CsvExporter, ExcelExporter } = ExportFixture.load();
    const rows = [{ source: '=HYPERLINK("https://example.test")', medium: '+cmd' }];

    const csv = CsvExporter.serialize(rows);
    const excel = ExcelExporter.serialize(rows);

    assert.match(csv, /'=HYPERLINK/);
    assert.match(csv, /'\+cmd/);
    assert.match(excel, /'=HYPERLINK/);
    assert.match(excel, /'\+cmd/);
  });
});
