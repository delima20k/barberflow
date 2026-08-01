'use strict';

class AuthService {
  static #DEMO_EMAIL = 'demo@analytics.local';
  static #DEMO_PASSWORD = 'analytics-demo';
  static #DEMO_SESSION_KEY = 'analytics_admin_demo_session';

  #client;
  #storage;

  constructor(
    client = null,
    storage = globalThis.sessionStorage,
    config = globalThis.AdminConfig,
  ) {
    this.#client = client;
    this.#storage = storage;
    this.config = config;
  }

  async signIn(email, password) {
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const normalizedPassword = String(password ?? '');

    if (this.config?.isDemo?.()) {
      const accepted = (
        normalizedEmail === AuthService.#DEMO_EMAIL
        && normalizedPassword === AuthService.#DEMO_PASSWORD
      );
      if (!accepted) {
        return { ok: false, message: 'Use as credenciais de demonstração informadas.' };
      }

      this.#storage?.setItem(
        AuthService.#DEMO_SESSION_KEY,
        JSON.stringify({ email: normalizedEmail, role: 'demo_admin' }),
      );
      return { ok: true, user: { email: normalizedEmail, role: 'demo_admin' } };
    }

    if (!this.#client?.auth) {
      return { ok: false, message: 'Supabase Analytics ainda não configurado.' };
    }

    const { data, error } = await this.#client.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    if (error) return { ok: false, message: 'Não foi possível entrar.' };
    if (!await this.#isAllowedAdmin()) {
      await this.#client.auth.signOut();
      return { ok: false, message: 'Usuário sem acesso ao Analytics.' };
    }
    return { ok: true, user: data.user };
  }

  async isAuthenticated() {
    if (this.config?.isDemo?.()) {
      return Boolean(this.#storage?.getItem(AuthService.#DEMO_SESSION_KEY));
    }
    if (!this.#client?.auth) return false;
    const { data } = await this.#client.auth.getSession();
    return Boolean(data?.session) && this.#isAllowedAdmin();
  }

  async currentUser() {
    if (this.config?.isDemo?.()) {
      const value = this.#storage?.getItem(AuthService.#DEMO_SESSION_KEY);
      return value ? JSON.parse(value) : null;
    }
    const { data } = await this.#client?.auth?.getUser?.() ?? {};
    return data?.user ?? null;
  }

  async signOut() {
    this.#storage?.removeItem(AuthService.#DEMO_SESSION_KEY);
    if (!this.config?.isDemo?.()) await this.#client?.auth?.signOut?.();
  }

  async #isAllowedAdmin() {
    const { data, error } = await this.#client
      .schema('analytics')
      .rpc('is_analytics_admin');
    return !error && data === true;
  }
}

globalThis.AuthService = AuthService;
