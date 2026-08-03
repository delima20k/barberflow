'use strict';

class PlanDeck {
  constructor(root, motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')) {
    this.root = root;
    this.cards = Array.from(root?.querySelectorAll('[data-plan-card]') ?? []);
    this.motionQuery = motionQuery;
    this.frontIndex = 0;
    this.isSwitching = false;

    this.handleCardClick = this.handleCardClick.bind(this);
    this.handleCardKeydown = this.handleCardKeydown.bind(this);
    this.handleAnimationEnd = this.handleAnimationEnd.bind(this);
  }

  init() {
    if (!this.root || this.cards.length < 2) return this;

    this.cards.forEach((card, index) => {
      card.addEventListener('click', this.handleCardClick);
      card.addEventListener('keydown', this.handleCardKeydown);
      card.dataset.planIndex = String(index);
    });
    this.root.addEventListener('animationend', this.handleAnimationEnd);
    this.syncCards();
    return this;
  }

  activate(index) {
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex)
      || nextIndex < 0
      || nextIndex >= this.cards.length
      || nextIndex === this.frontIndex
      || this.isSwitching) {
      return this;
    }

    const previousIndex = this.frontIndex;
    this.frontIndex = nextIndex;
    this.syncCards();

    if (this.motionQuery?.matches) return this;

    this.isSwitching = true;
    this.root.classList.add('is-switching');
    this.cards[previousIndex].classList.add('is-front-leaving');
    this.cards[nextIndex].classList.add('is-back-entering');
    return this;
  }

  destroy() {
    this.cards.forEach((card) => {
      card.removeEventListener('click', this.handleCardClick);
      card.removeEventListener('keydown', this.handleCardKeydown);
    });
    this.root?.removeEventListener('animationend', this.handleAnimationEnd);
    this.finishSwitch();
  }

  handleCardClick(event) {
    this.activate(event.currentTarget.dataset.planIndex);
  }

  handleCardKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    this.activate(event.currentTarget.dataset.planIndex);
  }

  handleAnimationEnd(event) {
    if (!this.isSwitching || event.target !== this.cards[this.frontIndex]) return;
    this.finishSwitch();
  }

  syncCards() {
    this.cards.forEach((card, index) => {
      const isFront = index === this.frontIndex;
      card.classList.toggle('is-front', isFront);
      card.classList.toggle('is-back', !isFront);
      card.setAttribute('aria-pressed', String(isFront));
      card.setAttribute('aria-label', `${card.dataset.planName ?? 'Plano'}${isFront ? ', em destaque' : ', selecionar para ver em destaque'}`);
    });
  }

  finishSwitch() {
    this.isSwitching = false;
    this.root?.classList.remove('is-switching');
    this.cards.forEach((card) => {
      card.classList.remove('is-front-leaving', 'is-back-entering');
    });
  }
}

globalThis.PlanDeck = PlanDeck;
