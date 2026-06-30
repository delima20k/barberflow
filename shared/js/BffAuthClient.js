'use strict';

// =============================================================
// BffAuthClient.js — Cliente HTTP para endpoints de Auth na BFF.
//
// Responsabilidades:
//   - Centralizar todas as chamadas de autenticação para a BFF
//   - Retornar { dados, erro, indisponivel } para tratamento padronizado
//   - Suportar fallback: se `indisponivel=true`, AuthService cai no
//     SupabaseService.signIn() original (sem quebrar login atual)
//   - Timeout de 8s via AbortController
//   - Nunca lança exceção — erros sempre em { erro }
//
// Dependências: nenhuma (fetch nativo do browser)
// =============================================================

class BffAuthClient {

  static #BASE_URL = (() => {
    const { hostname } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3002'
      : 'https://bff.barberflow.live';
  })();

  static #TIMEOUT_MS  = 8_000;
  static #STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  // ── Privados: HTTP ───────────────────────────────────────────────

  /** Lê o access_token do localStorage (salvo pelo SDK Supabase). */
  static #lerToken() {
    try {
      const raw = localStorage.getItem(BffAuthClient.#STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.access_token ?? parsed?.currentSession?.access_token ?? null;
    } catch {
      return null;
    }
  }

  /** Executa fetch com timeout via AbortController. */
  static async #fetchComTimeout(url, options) {
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), BffAuthClient.#TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timerId);
      return res;
    } catch (err) {
      clearTimeout(timerId);
      throw err;
    }
  }

  /**
   * Executa POST na BFF e retorna resposta estruturada.
   * @returns {Promise<{ dados: any, erro: string|null, indisponivel: boolean }>}
   */
  static async #post(path, body, comAuth = false) {
    const url     = `${BffAuthClient.#BASE_URL}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (comAuth) {
      const token = BffAuthClient.#lerToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res  = await BffAuthClient.#fetchComTimeout(url, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { dados: null, erro: json?.error ?? `HTTP ${res.status}`, indisponivel: false };
      }
      return { dados: json?.dados ?? null, erro: null, indisponivel: false };
    } catch (err) {
      const indisponivel = err?.name === 'AbortError' || err?.message?.includes('fetch');
      const erro         = indisponivel ? null : (err?.message ?? 'Erro de rede.');
      return { dados: null, erro, indisponivel };
    }
  }

  // ── Público ──────────────────────────────────────────────────────

  /**
   * Login via BFF.
   * @param {string} email
   * @param {string} senha
   * @returns {Promise<{ dados: { access_token, refresh_token, expires_at, user }|null, erro: string|null, indisponivel: boolean }>}
   */
  static async login(email, senha) {
    return BffAuthClient.#post('/api/auth/login', { email, password: senha });
  }

  /**
   * Renova tokens via refresh_token.
   * @param {string} refreshToken
   * @returns {Promise<{ dados: { access_token, refresh_token, expires_at, user }|null, erro: string|null, indisponivel: boolean }>}
   */
  static async refresh(refreshToken) {
    return BffAuthClient.#post('/api/auth/refresh', { refresh_token: refreshToken });
  }

  /**
   * Logout via BFF (fire-and-forget seguro — não bloqueia UX).
   * @returns {Promise<void>}
   */
  static async logout() {
    const url     = `${BffAuthClient.#BASE_URL}/api/auth/logout`;
    const token   = BffAuthClient.#lerToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      await BffAuthClient.#fetchComTimeout(url, { method: 'POST', headers, body: '{}' });
    } catch {
      // Falha silenciosa — SDK local cuida da limpeza de sessão
    }
  }

  /**
   * Retorna dados do usuário autenticado + perfil da BFF.
   * @returns {Promise<{ dados: { user, perfil }|null, erro: string|null, indisponivel: boolean }>}
   */
  static async me() {
    const url   = `${BffAuthClient.#BASE_URL}/api/auth/me`;
    const token = BffAuthClient.#lerToken();
    if (!token) return { dados: null, erro: 'Sem token de sessão.', indisponivel: false };

    try {
      const res  = await BffAuthClient.#fetchComTimeout(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { dados: null, erro: json?.error ?? `HTTP ${res.status}`, indisponivel: false };
      }
      return { dados: json?.dados ?? null, erro: null, indisponivel: false };
    } catch (err) {
      const indisponivel = err?.name === 'AbortError' || err?.message?.includes('fetch');
      return { dados: null, erro: err?.message ?? 'Erro de rede.', indisponivel };
    }
  }
}
