'use strict';

class AdminRouter {
  static #ROUTES = Object.freeze({
    dashboard: 'Dashboard',
    funnel: 'Funil',
    sessions: 'Sessões',
  });

  #onRoute;
  #handler;

  constructor(onRoute) {
    this.#onRoute = onRoute;
    this.#handler = () => this.resolve();
  }

  start() {
    globalThis.addEventListener('hashchange', this.#handler);
    this.resolve();
  }

  resolve() {
    const requested = globalThis.location.hash.replace('#', '');
    const route = Object.hasOwn(AdminRouter.#ROUTES, requested) ? requested : 'dashboard';
    if (requested !== route) globalThis.history.replaceState(null, '', `#${route}`);
    this.#onRoute?.(route, AdminRouter.#ROUTES[route]);
  }

  destroy() {
    globalThis.removeEventListener('hashchange', this.#handler);
  }
}

globalThis.AdminRouter = AdminRouter;
