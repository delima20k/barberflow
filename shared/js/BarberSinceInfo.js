'use strict';

class BarberSinceInfo {
  #el;

  constructor(el) {
    this.#el = el;
  }

  render(profile = {}) {
    if (!this.#el) return;
    const year = Number(profile.sinceYear ?? profile.since_year);
    if (!Number.isInteger(year) || year < 1950) {
      this.reset();
      return;
    }

    this.#el.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'beiro-section-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✂';

    const text = document.createElement('span');
    text.textContent = `Cortando desde ${year}`;

    this.#el.append(icon, text);
    this.#el.hidden = false;
  }

  reset() {
    if (!this.#el) return;
    this.#el.textContent = '';
    this.#el.hidden = true;
  }
}
