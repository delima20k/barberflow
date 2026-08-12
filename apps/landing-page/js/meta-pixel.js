'use strict';

class MetaPixelTracker {
  static #PIXEL_ID = '2486237658515097';
  static #SCRIPT_URL = 'https://connect.facebook.net/en_US/fbevents.js';
  static #pixelInitialized = false;
  static #pageViewTracked = false;
  static #scriptRequested = false;
  static #trackedLeadCodes = new Set();

  #root;

  constructor(root = document) {
    this.#root = root;
  }

  init() {
    this.#preparePixel();
    return this;
  }

  trackVoucherStart() {
    return this.#send('trackCustom', 'VoucherStart');
  }

  trackLead(voucherCode) {
    const normalizedCode = String(voucherCode ?? '').trim();
    if (!normalizedCode || MetaPixelTracker.#trackedLeadCodes.has(normalizedCode)) return false;
    if (!this.#send('track', 'Lead')) return false;
    MetaPixelTracker.#trackedLeadCodes.add(normalizedCode);
    return true;
  }

  #preparePixel() {
    this.#ensureQueue();
    this.#requestScript();

    if (!MetaPixelTracker.#pixelInitialized) {
      MetaPixelTracker.#pixelInitialized = this.#send(
        'init',
        MetaPixelTracker.#PIXEL_ID,
      );
    }
    if (MetaPixelTracker.#pixelInitialized && !MetaPixelTracker.#pageViewTracked) {
      MetaPixelTracker.#pageViewTracked = this.#send('track', 'PageView');
    }
  }

  #ensureQueue() {
    if (typeof globalThis.fbq === 'function') return;

    const pixelQueue = (...args) => {
      if (typeof pixelQueue.callMethod === 'function') {
        pixelQueue.callMethod(...args);
        return;
      }
      pixelQueue.queue.push(args);
    };
    pixelQueue.push = pixelQueue;
    pixelQueue.loaded = true;
    pixelQueue.version = '2.0';
    pixelQueue.queue = [];
    globalThis.fbq = pixelQueue;
    if (!globalThis._fbq) globalThis._fbq = pixelQueue;
  }

  #requestScript() {
    if (MetaPixelTracker.#scriptRequested) return;
    if (typeof this.#root?.createElement !== 'function') return;

    try {
      const script = this.#root.createElement('script');
      script.async = true;
      script.src = MetaPixelTracker.#SCRIPT_URL;
      const firstScript = this.#root.getElementsByTagName?.('script')?.[0];
      if (firstScript?.parentNode?.insertBefore) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else {
        this.#root.head?.appendChild?.(script);
      }
      MetaPixelTracker.#scriptRequested = true;
    } catch {
      MetaPixelTracker.#scriptRequested = false;
    }
  }

  #send(command, eventName) {
    if (typeof globalThis.fbq !== 'function') return false;
    try {
      globalThis.fbq(command, eventName);
      return true;
    } catch {
      return false;
    }
  }
}

globalThis.MetaPixelTracker = MetaPixelTracker;
