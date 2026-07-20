'use strict';

class MobileNavigation {
  constructor(root = document) {
    this.root = root;
    this.button = root.querySelector('[data-menu-toggle]');
    this.menu = root.querySelector('[data-mobile-menu]');
    this.handleToggle = this.handleToggle.bind(this);
    this.handleMenuClick = this.handleMenuClick.bind(this);
    this.handleEscape = this.handleEscape.bind(this);
  }

  init() {
    if (!this.button || !this.menu) return this;
    this.button.addEventListener('click', this.handleToggle);
    this.menu.addEventListener('click', this.handleMenuClick);
    document.addEventListener('keydown', this.handleEscape);
    return this;
  }

  handleToggle() {
    this.setOpen(this.button.getAttribute('aria-expanded') !== 'true');
  }

  handleMenuClick(event) {
    if (event.target.closest('a, button')) this.setOpen(false);
  }

  handleEscape(event) {
    if (event.key === 'Escape') this.setOpen(false);
  }

  setOpen(open) {
    this.button.setAttribute('aria-expanded', String(open));
    this.button.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    this.button.title = open ? 'Fechar menu' : 'Abrir menu';
    this.menu.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  }

  destroy() {
    if (!this.button || !this.menu) return;
    this.button.removeEventListener('click', this.handleToggle);
    this.menu.removeEventListener('click', this.handleMenuClick);
    document.removeEventListener('keydown', this.handleEscape);
  }
}

globalThis.MobileNavigation = MobileNavigation;
