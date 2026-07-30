'use strict';

class AnalyticsAdminApp {
  #client;
  #auth;
  #repository;
  #metrics;
  #snapshot;
  #realtime;
  #presence;
  #toast;
  #offline;
  #shell;
  #login;
  #dashboard;
  #funnel;
  #sessions;
  #filterBar;
  #router;
  #events = [];
  #sessionData = [];
  #filters = {};
  #loadingPromise = null;
  #unsubscribeRealtime = () => {};
  #unsubscribePresence = () => {};

  constructor(documentRef = document) {
    this.document = documentRef;
  }

  async init() {
    this.#client = await globalThis.SupabaseClientFactory.create(
      globalThis.AdminConfig,
      this.document,
    );
    this.#compose();
    this.#applyEnvironment();
    this.#registerServiceWorker();
    if (await this.#auth.isAuthenticated()) {
      await this.#openAdmin();
    } else {
      this.#shell.hide();
      this.#login.show();
    }
  }

  #compose() {
    this.#auth = new globalThis.AuthService(this.#client);
    this.#repository = new globalThis.AnalyticsRepository(this.#client);
    this.#metrics = new globalThis.MetricsService();
    this.#snapshot = new globalThis.SnapshotService();
    this.#realtime = new globalThis.RealtimeAnalyticsService(this.#client);
    this.#presence = new globalThis.PresenceService(this.#client);
    this.#toast = new globalThis.ToastCenter(this.document.querySelector('[data-toast-region]'));
    this.#offline = new globalThis.OfflineState(this.document.querySelector('[data-offline-state]'));
    this.#shell = new globalThis.AppShell(this.document.querySelector('[data-admin-shell]'));
    this.#login = new globalThis.LoginPage(
      this.document.querySelector('[data-page="login"]'),
      this.#auth,
      () => this.#openAdmin(),
    );
    this.#dashboard = new globalThis.DashboardPage(
      this.document.querySelector('[data-page="dashboard"]'),
      this.#metrics,
    );
    this.#funnel = new globalThis.FunnelPage(
      this.document.querySelector('[data-page="funnel"]'),
      this.#metrics,
    );
    this.#sessions = new globalThis.SessionsPage(
      this.document.querySelector('[data-page="sessions"]'),
      new globalThis.ExportService(),
    );
    this.#filterBar = new globalThis.FilterBar(
      this.document.querySelector('[data-global-filter-bar]'),
      (filters) => {
        this.#filters = filters;
        this.#applyFilters();
      },
    );
    this.#filterBar.render();
    this.#filters = this.#filterBar.values();
    this.#router = new globalThis.AdminRouter((route, title) => {
      this.#shell.setPage(route, title);
    });
    this.document.querySelector('[data-sign-out]')
      .addEventListener('click', () => this.#signOut());
    this.document.querySelector('[data-refresh]')
      .addEventListener('click', () => this.#load(true));
    globalThis.addEventListener('online', () => this.#handleConnection());
    globalThis.addEventListener('offline', () => this.#handleConnection());
  }

  #applyEnvironment() {
    const isDemo = globalThis.AdminConfig.isDemo();
    this.document.querySelectorAll('[data-demo-only]').forEach((element) => {
      element.hidden = !isDemo;
    });
    this.document.querySelectorAll('[data-environment-label]').forEach((element) => {
      element.textContent = isDemo ? 'Demonstração' : 'Conectado';
    });
  }

  async #openAdmin() {
    this.#login.hide();
    this.#shell.show();
    this.#router.start();
    await this.#load();
    this.#connectRealtime();
  }

  #load(showFeedback = false) {
    if (this.#loadingPromise) return this.#loadingPromise;
    this.#loadingPromise = this.#performLoad(showFeedback)
      .finally(() => {
        this.#loadingPromise = null;
      });
    return this.#loadingPromise;
  }

  async #performLoad(showFeedback) {
    try {
      const [events, sessions] = await Promise.all([
        this.#repository.events(),
        this.#repository.sessions(),
      ]);
      this.#applyData(events, sessions);
      const snapshot = this.#snapshot.save({ events, sessions });
      if (navigator.onLine) this.#offline.hide();
      else this.#offline.show(snapshot);
      if (showFeedback) this.#toast.show('Dados atualizados.');
    } catch {
      const snapshot = this.#snapshot.load();
      if (snapshot?.payload) {
        this.#applyData(snapshot.payload.events ?? [], snapshot.payload.sessions ?? []);
        this.#offline.show(snapshot);
      } else {
        this.#toast.show('Não foi possível carregar os dados.');
      }
    }
  }

  #applyData(events, sessions) {
    this.#events = events;
    this.#sessionData = sessions;
    this.#applyFilters();
  }

  #applyFilters() {
    const events = this.#metrics.filter(this.#events, this.#filters);
    const sessions = this.#metrics.filterSessions(this.#sessionData, this.#filters);
    const comparisonFilters = {
      ...this.#filters,
      range: globalThis.DateRange.resolve('yesterday'),
    };
    const comparisonEvents = this.#metrics.filter(this.#events, comparisonFilters);
    this.#dashboard.setData(events, sessions, comparisonEvents);
    this.#funnel.setData(events);
    this.#sessions.setData(sessions);
  }

  #connectRealtime() {
    this.#unsubscribeRealtime = this.#realtime.subscribe((event) => {
      this.#toast.show(globalThis.AnalyticsEventCatalog.label(event.event_name));
      this.#load();
    });
    this.#unsubscribePresence = this.#presence.subscribeAdmin((count) => {
      this.#dashboard.setOnlineCount(count);
    });
  }

  #handleConnection() {
    if (navigator.onLine) {
      this.#offline.hide();
      this.#load();
      return;
    }
    const snapshot = this.#snapshot.load();
    if (snapshot) this.#offline.show(snapshot);
  }

  async #signOut() {
    this.#unsubscribeRealtime();
    this.#unsubscribePresence();
    await this.#auth.signOut();
    this.#router.destroy();
    this.#shell.hide();
    this.#login.show();
  }

  async #registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        await registration.update();
        const reloadKey = `analytics_admin_sw_reloaded:${globalThis.AdminConfig.buildVersion}`;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (sessionStorage.getItem(reloadKey)) return;
          sessionStorage.setItem(reloadKey, '1');
          globalThis.location.reload();
        });
      } catch {
        this.#toast?.show('O modo offline não pôde ser ativado.');
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AnalyticsAdminApp().init().catch(() => {
    document.querySelector('[data-login-error]').hidden = false;
    document.querySelector('[data-login-error]').textContent = (
      'Não foi possível iniciar o Analytics Admin.'
    );
  });
});

globalThis.AnalyticsAdminApp = AnalyticsAdminApp;
