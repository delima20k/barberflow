'use strict';

class ScrollAnimationController {
  constructor(root = document) {
    this.elements = [...root.querySelectorAll('.reveal')];
    this.hero = root.querySelector('#hero');
    this.floatingCta = root.querySelector('[data-mobile-cta]');
    this.ctaBlockers = [...root.querySelectorAll('[data-floating-cta-hide]')];
    this.activeCtaBlockers = new Set();
    this.heroIsVisible = true;
    this.observer = null;
    this.heroObserver = null;
    this.ctaBlockerObserver = null;
  }

  init() {
    this.initFloatingCta();

    if (!('IntersectionObserver' in globalThis) || this.prefersReducedMotion()) {
      this.revealAll();
      return this;
    }

    this.observer = new IntersectionObserver(
      (entries) => this.handleEntries(entries),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
    );
    this.elements.forEach((element) => this.observer.observe(element));
    return this;
  }

  initFloatingCta() {
    if (!this.hero || !this.floatingCta) return;

    if (!('IntersectionObserver' in globalThis)) {
      this.floatingCta.classList.add('is-visible');
      return;
    }

    this.heroObserver = new IntersectionObserver(
      ([entry]) => {
        this.heroIsVisible = entry.isIntersecting;
        this.updateFloatingCta();
      },
      { threshold: 0.2 }
    );
    this.heroObserver.observe(this.hero);

    this.ctaBlockerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.activeCtaBlockers.add(entry.target);
          } else {
            this.activeCtaBlockers.delete(entry.target);
          }
        });
        this.updateFloatingCta();
      },
      { rootMargin: '-8% 0px -8% 0px', threshold: 0.05 }
    );
    this.ctaBlockers.forEach((element) => this.ctaBlockerObserver.observe(element));
  }

  updateFloatingCta() {
    const shouldShow = !this.heroIsVisible && this.activeCtaBlockers.size === 0;
    this.floatingCta?.classList.toggle('is-visible', shouldShow);
  }

  prefersReducedMotion() {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  handleEntries(entries) {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      this.observer?.unobserve(entry.target);
    });
  }

  revealAll() {
    this.elements.forEach((element) => element.classList.add('is-visible'));
  }

  destroy() {
    this.observer?.disconnect();
    this.heroObserver?.disconnect();
    this.ctaBlockerObserver?.disconnect();
    this.activeCtaBlockers.clear();
    this.observer = null;
    this.heroObserver = null;
    this.ctaBlockerObserver = null;
  }
}

globalThis.ScrollAnimationController = ScrollAnimationController;
