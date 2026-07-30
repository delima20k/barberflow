'use strict';

class Formatters {
  static integer(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
      .format(Number(value) || 0);
  }

  static percentage(value) {
    return `${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(Number(value) || 0)}%`;
  }

  static duration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60);
    const remainder = Math.round(total % 60);
    return `${minutes}min ${String(remainder).padStart(2, '0')}s`;
  }

  static dateTime(value) {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  static time(value) {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
}

globalThis.Formatters = Formatters;
