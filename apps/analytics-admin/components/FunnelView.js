'use strict';

class FunnelView {
  #root;
  #compact;

  constructor(root, compact = false) {
    this.#root = root;
    this.#compact = compact;
  }

  render(steps) {
    if (this.#compact) {
      const maximum = Math.max(1, ...steps.map((step) => step.count));
      const rows = steps.slice(0, 6).map((step) => {
        const row = document.createElement('div');
        row.className = 'compact-funnel-row';
        const label = document.createElement('span');
        label.textContent = step.label;
        const track = document.createElement('div');
        track.className = 'compact-funnel-track';
        const fill = document.createElement('progress');
        fill.className = 'compact-funnel-fill';
        fill.max = maximum;
        fill.value = step.count;
        fill.setAttribute('aria-label', `${step.label}: ${step.count}`);
        track.append(fill);
        const count = document.createElement('strong');
        count.textContent = globalThis.Formatters.integer(step.count);
        row.append(label, track, count);
        return row;
      });
      const container = document.createElement('div');
      container.className = 'compact-funnel';
      container.append(...rows);
      this.#root.replaceChildren(container);
      return;
    }

    const container = document.createElement('div');
    container.className = 'funnel-view';
    steps.forEach((step, index) => {
      const element = document.createElement('article');
      element.className = `funnel-step funnel-step--${index + 1}`;
      const copy = document.createElement('div');
      const label = document.createElement('h3');
      label.textContent = step.label;
      const event = document.createElement('p');
      event.textContent = step.eventName;
      copy.append(label, event);
      const value = document.createElement('div');
      const count = document.createElement('strong');
      count.textContent = globalThis.Formatters.integer(step.count);
      const conversion = document.createElement('small');
      conversion.textContent = `${globalThis.Formatters.percentage(step.conversion)} da etapa anterior`;
      value.append(count, conversion);
      element.append(copy, value);
      container.append(element);
    });
    this.#root.replaceChildren(container);
  }
}

globalThis.FunnelView = FunnelView;
