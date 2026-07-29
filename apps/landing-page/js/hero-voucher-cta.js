'use strict';

class HeroVoucherCta {
  #secondPulseTimer;
  #labelIndex;

  constructor(button) {
    this.button = button;
    this.labels = ['Gerar voucher', 'Testar agora'];
    this.#labelIndex = 0;
    this.handleAnimationIteration = this.handleAnimationIteration.bind(this);
  }

  init() {
    if (!this.button || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return this;
    }

    this.button.addEventListener('animationiteration', this.handleAnimationIteration);
    this.startTextCycle();
    return this;
  }

  handleAnimationIteration(event) {
    if (event.animationName !== 'hero-voucher-pulse') return;
    this.startTextCycle();
  }

  startTextCycle() {
    clearTimeout(this.#secondPulseTimer);
    this.setLabel(0);
    this.#secondPulseTimer = setTimeout(() => this.setLabel(1), 1300);
  }

  setLabel(index) {
    this.#labelIndex = index;
    this.button.textContent = this.labels[this.#labelIndex];
  }

  destroy() {
    clearTimeout(this.#secondPulseTimer);
    this.button?.removeEventListener('animationiteration', this.handleAnimationIteration);
  }
}

globalThis.HeroVoucherCta = HeroVoucherCta;
