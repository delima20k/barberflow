'use strict';

class ExcelExporter {
  static serialize(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const columns = safeRows.length
      ? [...new Set(safeRows.flatMap((row) => Object.keys(row)))]
      : [];
    const header = ExcelExporter.#row(columns);
    const body = safeRows.map((row) => (
      ExcelExporter.#row(columns.map((column) => row[column] ?? ''))
    )).join('');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?mso-application progid="Excel.Sheet"?>',
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
      '<Worksheet ss:Name="Analytics"><Table>',
      header,
      body,
      '</Table></Worksheet></Workbook>',
    ].join('');
  }

  static #row(values) {
    const cells = values.map((value) => (
      `<Cell><Data ss:Type="String">${ExcelExporter.#escape(value)}</Data></Cell>`
    )).join('');
    return `<Row>${cells}</Row>`;
  }

  static #escape(value) {
    return globalThis.SpreadsheetValueSanitizer.sanitize(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}

globalThis.ExcelExporter = ExcelExporter;
