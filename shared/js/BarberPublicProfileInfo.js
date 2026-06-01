'use strict';

class BarberPublicProfileInfo {
  #el;

  constructor(el) {
    this.#el = el;
  }

  render(profile = {}) {
    if (!this.#el) return;
    this.#el.innerHTML = '';

    const rows = [];
    const birthDate = profile.birthDate ?? profile.birth_date;
    const gender = profile.gender;

    if (birthDate) rows.push(this.#row('📅', this.#formatDate(birthDate)));
    if (gender) rows.push(this.#row('👤', this.#formatGender(gender)));

    if (rows.length === 0) {
      this.reset();
      return;
    }

    rows.forEach(row => this.#el.appendChild(row));
    this.#el.hidden = false;
  }

  reset() {
    if (!this.#el) return;
    this.#el.textContent = '';
    this.#el.hidden = true;
  }

  #row(iconValue, labelValue) {
    const row = document.createElement('span');
    row.className = 'beiro-info-row';

    const icon = document.createElement('span');
    icon.className = 'beiro-section-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconValue;

    const label = document.createElement('span');
    label.textContent = labelValue;

    row.append(icon, label);
    return row;
  }

  #formatDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  #formatGender(value) {
    return {
      masculino: 'Masculino',
      feminino: 'Feminino',
      outro: 'Outro',
      prefiro_nao_informar: 'Prefiro nao informar',
      nao_informar: 'Prefiro nao informar',
    }[value] || value;
  }
}
