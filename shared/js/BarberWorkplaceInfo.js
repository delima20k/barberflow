'use strict';

class BarberWorkplaceInfo {
  #el;
  #onMessage;

  constructor(el, onMessage) {
    this.#el = el;
    this.#onMessage = onMessage;
  }

  render(profile = {}) {
    if (!this.#el) return;
    const shop = profile.barbershop;
    if (!shop?.id && !shop?.name) {
      this.reset();
      return;
    }

    this.#el.innerHTML = '';
    this.#el.appendChild(this.#row('🏢', shop.name || 'Barbearia'));

    const address = [shop.address, [shop.city, shop.state].filter(Boolean).join(' - ')]
      .filter(Boolean)
      .join(' — ');
    if (address) this.#el.appendChild(this.#row('📍', address));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'beiro-workplace-message';
    btn.innerHTML = '<span aria-hidden="true">💬</span><span>Mensagem para a barbearia</span>';
    btn.addEventListener('click', () => this.#onMessage?.(profile));
    this.#el.appendChild(btn);
    this.#el.hidden = false;
  }

  reset() {
    if (!this.#el) return;
    this.#el.textContent = '';
    this.#el.hidden = true;
  }

  #row(iconValue, labelValue) {
    const row = document.createElement('p');
    row.className = 'beiro-workplace-row';

    const icon = document.createElement('span');
    icon.className = 'beiro-section-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconValue;

    const label = document.createElement('span');
    label.textContent = labelValue;

    row.append(icon, label);
    return row;
  }
}
