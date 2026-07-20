'use strict';

class FaqAccordion {
  constructor(root) {
    this.root = root;
    this.questions = [...(root?.querySelectorAll('[data-faq-question]') ?? [])];
    this.handleClick = this.handleClick.bind(this);
  }

  init() {
    this.root?.addEventListener('click', this.handleClick);
    return this;
  }

  handleClick(event) {
    const question = event.target.closest('[data-faq-question]');
    if (!question || !this.root.contains(question)) return;

    const shouldOpen = question.getAttribute('aria-expanded') !== 'true';
    this.closeAll();
    if (shouldOpen) this.setExpanded(question, true);
  }

  closeAll() {
    this.questions.forEach((question) => this.setExpanded(question, false));
  }

  setExpanded(question, expanded) {
    const answer = document.getElementById(question.getAttribute('aria-controls'));
    const icon = question.querySelector('[aria-hidden="true"]');
    question.setAttribute('aria-expanded', String(expanded));
    if (answer) answer.hidden = !expanded;
    if (icon) icon.textContent = expanded ? '−' : '+';
  }

  destroy() {
    this.root?.removeEventListener('click', this.handleClick);
  }
}

globalThis.FaqAccordion = FaqAccordion;
