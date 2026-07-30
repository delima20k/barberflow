'use strict';

class SnapshotService {
  static #KEY = 'analytics_admin_last_snapshot';
  #storage;

  constructor(storage = globalThis.localStorage) {
    this.#storage = storage;
  }

  save(payload) {
    const lastSnapshot = {
      savedAt: new Date().toISOString(),
      payload,
    };
    this.#storage?.setItem(SnapshotService.#KEY, JSON.stringify(lastSnapshot));
    return lastSnapshot;
  }

  load() {
    const value = this.#storage?.getItem(SnapshotService.#KEY);
    if (!value) return null;
    try {
      const lastSnapshot = JSON.parse(value);
      return lastSnapshot?.savedAt ? lastSnapshot : null;
    } catch {
      return null;
    }
  }

  clear() {
    this.#storage?.removeItem(SnapshotService.#KEY);
  }
}

globalThis.SnapshotService = SnapshotService;
