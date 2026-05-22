'use strict';

class PageSection {
  #rootElement;
  #dependencies;
  #eventBus;
  #state;
  #initialized = false;
  #cleanups = new Set();
  #timers = new Set();
  #observers = new Set();

  constructor(rootElement, dependencies = {}) {
    if (!rootElement) throw new Error('PageSection requer rootElement.');
    if (!dependencies.eventBus) throw new Error('PageSection requer eventBus injetado.');

    this.#rootElement = rootElement;
    this.#dependencies = { ...dependencies };
    this.#eventBus = dependencies.eventBus;
    this.#state = { ...(dependencies.initialState ?? {}) };
  }

  get rootElement() {
    return this.#rootElement;
  }

  get dependencies() {
    return { ...this.#dependencies };
  }

  get state() {
    return { ...this.#state };
  }

  get initialized() {
    return this.#initialized;
  }

  init() {
    if (this.#initialized) return;
    this.#initialized = true;
    this.render(this.state);
  }

  render(_state) {}

  update(partialState = {}) {
    if (!partialState || typeof partialState !== 'object' || Array.isArray(partialState)) {
      throw new Error('PageSection.update requer estado parcial valido.');
    }
    this.#state = { ...this.#state, ...partialState };
    this.render(this.state);
  }

  destroy() {
    this.#cleanups.forEach(cleanup => cleanup());
    this.#cleanups.clear();

    this.#timers.forEach(timer => {
      if (timer.type === 'interval') clearInterval(timer.id);
      if (timer.type === 'timeout') clearTimeout(timer.id);
    });
    this.#timers.clear();

    this.#observers.forEach(observer => observer.disconnect());
    this.#observers.clear();
    this.#initialized = false;
  }

  on(eventName, handler) {
    const unsubscribe = this.#eventBus.on(eventName, handler);
    this.#cleanups.add(unsubscribe);
    return unsubscribe;
  }

  emit(eventName, payload) {
    this.#eventBus.emit(eventName, payload);
  }

  listen(target, eventName, handler, options = undefined) {
    if (!target || typeof target.addEventListener !== 'function' ||
        typeof target.removeEventListener !== 'function') {
      throw new Error('PageSection.listen requer alvo DOM removivel.');
    }
    if (typeof handler !== 'function') throw new Error('PageSection.listen requer handler valido.');

    target.addEventListener(eventName, handler, options);
    const cleanup = target.removeEventListener.bind(target, eventName, handler, options);
    this.#cleanups.add(cleanup);
    return cleanup;
  }

  every(handler, delayMs) {
    if (typeof handler !== 'function') throw new Error('PageSection.every requer handler valido.');
    const timer = { type: 'interval', id: setInterval(handler, delayMs) };
    this.#timers.add(timer);
    return timer.id;
  }

  after(handler, delayMs) {
    if (typeof handler !== 'function') throw new Error('PageSection.after requer handler valido.');
    const timer = { type: 'timeout', id: setTimeout(handler, delayMs) };
    this.#timers.add(timer);
    return timer.id;
  }

  observe(observer, target, options) {
    if (!observer || typeof observer.observe !== 'function' ||
        typeof observer.disconnect !== 'function') {
      throw new Error('PageSection.observe requer observer desconectavel.');
    }
    observer.observe(target, options);
    this.#observers.add(observer);
    return observer;
  }
}
