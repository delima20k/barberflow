'use strict';

class BarberSinceInfo {
  #el;

  constructor(el) {
    this.#el = el;
  }

  render(profile = {}) {
    if (!this.#el) return;
    const year = Number(profile.sinceYear ?? profile.since_year);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1950 || year > currentYear) {
      this.reset();
      return;
    }

    this.#el.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'beiro-section-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2702';

    const text = document.createElement('span');
    text.textContent = `Desde ${year}`;

    this.#el.append(icon, text);
    this.#el.hidden = false;
  }

  reset() {
    if (!this.#el) return;
    this.#el.textContent = '';
    this.#el.hidden = true;
  }
}
