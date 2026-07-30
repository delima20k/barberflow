'use strict';

class AppShell {
  #shell;
  #sidebar;
  #menuButton;
  #title;

  constructor(shell) {
    this.#shell = shell;
    this.#sidebar = shell.querySelector('[data-sidebar]');
    this.#menuButton = shell.querySelector('[data-menu-toggle]');
    this.#title = shell.querySelector('[data-page-title]');
    this.#menuButton.addEventListener('click', () => this.toggleMenu());
    this.#shell.querySelectorAll('[data-nav-link]').forEach((link) => {
      link.addEventListener('click', () => this.closeMenu());
    });
  }

  show() {
    this.#shell.hidden = false;
  }

  hide() {
    this.#shell.hidden = true;
  }

  setPage(page, title) {
    this.#title.textContent = title;
    this.#shell.querySelectorAll('[data-page]').forEach((element) => {
      element.hidden = element.dataset.page !== page;
    });
    this.#shell.querySelectorAll('[data-nav-link]').forEach((link) => {
      if (link.dataset.navLink === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  toggleMenu() {
    const open = this.#sidebar.classList.toggle('is-open');
    this.#menuButton.setAttribute('aria-expanded', String(open));
    this.#menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  }

  closeMenu() {
    this.#sidebar.classList.remove('is-open');
    this.#menuButton.setAttribute('aria-expanded', 'false');
    this.#menuButton.setAttribute('aria-label', 'Abrir menu');
  }
}

globalThis.AppShell = AppShell;
