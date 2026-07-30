'use strict';

class MetricGrid {
  static #DEFINITIONS = Object.freeze([
    ['visitorsOnline', 'Visitantes online agora', 'integer', true],
    ['visitorsToday', 'Visitantes hoje', 'integer'],
    ['visitorsYesterday', 'Visitantes ontem', 'integer'],
    ['activeSessions', 'Sessões ativas', 'integer'],
    ['endedSessions', 'Sessões encerradas', 'integer'],
    ['averageTimeSeconds', 'Tempo médio', 'duration'],
    ['conversionRate', 'Taxa de conversão', 'percentage', true],
    ['ctaClicks', 'Cliques no CTA', 'integer'],
    ['emailStarted', 'Emails digitados', 'integer'],
    ['emailSubmitted', 'Emails enviados', 'integer'],
    ['registrations', 'Cadastros', 'integer'],
    ['emailConfirmed', 'Emails confirmados', 'integer'],
    ['firstLogins', 'Primeiros logins', 'integer'],
  ]);

  #root;

  constructor(root) {
    this.#root = root;
  }

  render(metrics) {
    const cards = MetricGrid.#DEFINITIONS.map(([key, label, format, highlight]) => {
      const card = document.createElement('article');
      card.className = `metric-card${highlight ? ' metric-card--highlight' : ''}`;
      const title = document.createElement('span');
      title.textContent = label;
      const value = document.createElement('strong');
      value.textContent = globalThis.Formatters?.[format]?.(metrics[key]) ?? metrics[key] ?? 0;
      card.append(title, value);
      return card;
    });
    this.#root.replaceChildren(...cards);
  }
}

globalThis.MetricGrid = MetricGrid;
