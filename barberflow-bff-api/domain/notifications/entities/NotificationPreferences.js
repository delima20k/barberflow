'use strict';

const { Result } = require('../../shared/Result');

class NotificationPreferences {
  #props;

  constructor(props) {
    this.#props = Object.freeze({
      userId: props.userId,
      channelsByCategory: Object.freeze({ ...(props.channelsByCategory ?? {}) }),
      quietHours: props.quietHours ?? null,
      digestByCategory: Object.freeze({ ...(props.digestByCategory ?? {}) }),
    });
    Object.freeze(this);
  }

  static create(props = {}) {
    if (!props.userId) return Result.fail('NotificationPreferences.userId obrigatorio');
    return Result.ok(new NotificationPreferences(props));
  }

  static allowAll(userId) {
    return new NotificationPreferences({ userId });
  }

  get userId() { return this.#props.userId; }
  get quietHours() { return this.#props.quietHours; }

  allows(category, channel) {
    const categoryPrefs = this.#props.channelsByCategory[category];
    if (!categoryPrefs || categoryPrefs[channel] === undefined) return true;
    return categoryPrefs[channel] === true;
  }

  usesDigest(category) {
    return this.#props.digestByCategory[category] === true;
  }

  isQuietHour(now = new Date()) {
    const quiet = this.quietHours;
    if (!quiet?.start || !quiet?.end) return false;
    const minutes = NotificationPreferences.#localMinutes(now, quiet.timezoneOffsetMinutes ?? 0);
    const start = NotificationPreferences.#parseMinutes(quiet.start);
    const end = NotificationPreferences.#parseMinutes(quiet.end);
    if (start === end) return false;
    if (start < end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  static #parseMinutes(value) {
    const [hour, minute] = String(value).split(':').map(Number);
    return (hour * 60) + minute;
  }

  static #localMinutes(date, offsetMinutes) {
    const localMs = date.getTime() + (offsetMinutes * 60_000);
    const local = new Date(localMs);
    return (local.getUTCHours() * 60) + local.getUTCMinutes();
  }
}

module.exports = { NotificationPreferences };
