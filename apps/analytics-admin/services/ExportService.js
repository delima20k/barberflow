'use strict';

class ExportService {
  #document;
  #url;

  constructor(documentRef = document, urlApi = globalThis.URL) {
    this.#document = documentRef;
    this.#url = urlApi;
  }

  csv(rows) {
    this.#download(
      globalThis.CsvExporter.serialize(rows),
      'analytics-sessoes.csv',
      'text/csv;charset=utf-8',
    );
  }

  excel(rows) {
    this.#download(
      globalThis.ExcelExporter.serialize(rows),
      'analytics-sessoes.xls',
      'application/vnd.ms-excel;charset=utf-8',
    );
  }

  #download(content, filename, type) {
    const blobUrl = this.#url.createObjectURL(new Blob([content], { type }));
    const link = this.#document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    this.#url.revokeObjectURL(blobUrl);
  }
}

globalThis.ExportService = ExportService;
