'use strict';

class PortfolioEmptyState {
  static render(message, variant = 'empty') {
    const el = document.createElement('div');
    el.className = `portfolio-empty portfolio-empty--${variant}`;
    const title = document.createElement('p');
    title.textContent = message;
    el.appendChild(title);
    return el;
  }
}
