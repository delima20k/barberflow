'use strict';

class SpreadsheetValueSanitizer {
  static sanitize(value) {
    const text = String(value ?? '');
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  }
}

globalThis.SpreadsheetValueSanitizer = SpreadsheetValueSanitizer;
