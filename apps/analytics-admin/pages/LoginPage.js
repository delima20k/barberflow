'use strict';

class LoginPage {
  #root;
  #auth;
  #onSuccess;
  #form;
  #error;

  constructor(root, authService, onSuccess) {
    this.#root = root;
    this.#auth = authService;
    this.#onSuccess = onSuccess;
    this.#form = root.querySelector('[data-login-form]');
    this.#error = root.querySelector('[data-login-error]');
    if (globalThis.AdminConfig.isDemo()) {
      this.#form.elements.email.value = 'demo@analytics.local';
      this.#form.elements.password.value = 'analytics-demo';
    }
    this.#form.addEventListener('submit', (event) => this.#submit(event));
  }

  show() {
    this.#root.hidden = false;
    this.#root.querySelector('input')?.focus();
  }

  hide() {
    this.#root.hidden = true;
  }

  async #submit(event) {
    event.preventDefault();
    const submit = this.#form.querySelector('[type="submit"]');
    const data = new FormData(this.#form);
    submit.disabled = true;
    submit.textContent = 'Entrando...';
    this.#error.hidden = true;

    const result = await this.#auth.signIn(data.get('email'), data.get('password'));
    submit.disabled = false;
    submit.textContent = 'Entrar no painel';
    if (!result.ok) {
      this.#error.textContent = result.message;
      this.#error.hidden = false;
      return;
    }
    this.#onSuccess?.();
  }
}

globalThis.LoginPage = LoginPage;
