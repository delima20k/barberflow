'use strict';

class CsvExporter {
  static serialize(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const lines = [
      columns.map(CsvExporter.#escape).join(','),
      ...rows.map((row) => columns
        .map((column) => CsvExporter.#escape(row[column] ?? ''))
        .join(',')),
    ];
    return `\uFEFF${lines.join('\r\n')}`;
  }

  static #escape(value) {
    const text = globalThis.SpreadsheetValueSanitizer.sanitize(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }
}

globalThis.CsvExporter = CsvExporter;
