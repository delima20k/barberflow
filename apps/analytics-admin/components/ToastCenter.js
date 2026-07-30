'use strict';

class ToastCenter {
  #root;

  constructor(root) {
    this.#root = root;
  }

  show(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.#root.append(toast);
    globalThis.setTimeout(() => toast.remove(), 4200);
  }
}

globalThis.ToastCenter = ToastCenter;
