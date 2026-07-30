'use strict';

class OfflineState {
  #root;
  #time;

  constructor(root) {
    this.#root = root;
    this.#time = root.querySelector('[data-snapshot-time]');
  }

  show(snapshot) {
    if (!snapshot?.savedAt) return;
    this.#time.dateTime = snapshot.savedAt;
    this.#time.textContent = globalThis.Formatters.dateTime(snapshot.savedAt);
    this.#root.hidden = false;
  }

  hide() {
    this.#root.hidden = true;
  }
}

globalThis.OfflineState = OfflineState;
