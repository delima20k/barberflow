'use strict';

class DateRange {
  static resolve(preset, now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === '7d') {
      start.setDate(start.getDate() - 6);
    } else if (preset === '30d') {
      start.setDate(start.getDate() - 29);
    }

    return Object.freeze({ start, end });
  }

  static contains(dateValue, range) {
    const timestamp = new Date(dateValue).getTime();
    return timestamp >= range.start.getTime() && timestamp <= range.end.getTime();
  }
}

globalThis.DateRange = DateRange;
