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

    const address = [shop.address, [shop.city, shop.state].filter(Boolean).join(' - ')]
      .filter(Boolean)
      .join(' \u2014 ');

    const card = document.createElement('div');
    card.className = 'beiro-workplace-card';
    if (shop.id) card.dataset.barbershopId = shop.id;
    const professionalId = shop.professionalId ?? profile.id ?? null;
    if (professionalId) card.dataset.highlightBarberId = professionalId;

    card.style.setProperty(
      '--beiro-workplace-bg',
      `url("${BarberWorkplaceInfo.#cssUrl(BarberWorkplaceInfo.#resolverImagem(shop))}")`,
    );

    const info = document.createElement('div');
    info.className = 'beiro-workplace-card__info';

    const name = document.createElement('p');
    name.className = 'beiro-workplace-card__name';
    name.textContent = shop.name || 'Barbearia';

    info.appendChild(name);
    if (shop.isOwnerWorkplace) {
      const owner = document.createElement('p');
      owner.className = 'beiro-workplace-card__owner';
      owner.textContent = 'Essa e a barbearia dele';
      info.appendChild(owner);
    }
    if (address) {
      const addr = document.createElement('p');
      addr.className = 'beiro-workplace-card__addr';
      addr.textContent = address;
      info.appendChild(addr);
    }

    const arrow = document.createElement('span');
    arrow.className = 'beiro-workplace-card__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u203A';

    card.append(info, arrow);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'beiro-workplace-message';
    btn.innerHTML = '<span aria-hidden="true">\u{1F4AC}</span><span>Mensagem para a barbearia</span>';
    btn.addEventListener('click', () => this.#onMessage?.(profile));

    this.#el.innerHTML = '';
    this.#el.append(card, btn);
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

  static #resolverImagem(shop = {}) {
    const path = shop.coverPath || shop.logoPath || shop.cover_path || shop.logo_path || shop.coverUrl || shop.logoUrl || '';
    if (!path) return '/shared/img/Logo01.png';
    if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
    if (typeof ApiService !== 'undefined' && ApiService.getLogoUrl) {
      return ApiService.getLogoUrl(path) || '/shared/img/Logo01.png';
    }
    if (typeof SupabaseService !== 'undefined' && SupabaseService.getLogoUrl) {
      return SupabaseService.getLogoUrl(path) || '/shared/img/Logo01.png';
    }
    return path;
  }

  static #cssUrl(url = '') {
    return String(url || '/shared/img/Logo01.png')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }
}
