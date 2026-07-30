'use strict';

class FilterBar {
  #root;
  #onChange;

  constructor(root, onChange) {
    this.#root = root;
    this.#onChange = onChange;
  }

  render() {
    this.#root.innerHTML = `
      <form class="filter-bar" data-filter-form>
        <div class="filter-control">
          <label for="filter-range">Período</label>
          <select id="filter-range" name="range">
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="last7">Últimos 7 dias</option>
            <option value="last30">Últimos 30 dias</option>
          </select>
        </div>
        <div class="filter-control">
          <label for="filter-source">Origem</label>
          <select id="filter-source" name="source">
            <option value="all">Todas</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="google">Google</option>
            <option value="organic">Orgânico</option>
            <option value="direct">Direto</option>
          </select>
        </div>
        <div class="filter-control">
          <label for="filter-campaign">Campanha</label>
          <select id="filter-campaign" name="campaign">
            <option value="all">Todas</option>
            <option value="primeiro-mes-gratis">Primeiro mês grátis</option>
            <option value="organico">Orgânico</option>
          </select>
        </div>
      </form>
    `;
    this.#root.querySelector('[data-filter-form]').addEventListener('change', () => {
      this.#onChange?.(this.values());
    });
  }

  values() {
    const form = this.#root.querySelector('[data-filter-form]');
    const values = new FormData(form);
    const presets = { last7: '7d', last30: '30d' };
    return {
      range: globalThis.DateRange?.resolve(presets[values.get('range')] ?? values.get('range')),
      source: values.get('source'),
      campaign: values.get('campaign'),
    };
  }
}

globalThis.FilterBar = FilterBar;
