'use strict';

// =============================================================
// BffApiService.js — Cliente HTTP para a BFF BarberFlow.
//
// Responsabilidades:
//   - Centralizar todas as chamadas HTTP ao BFF (porta 3002 dev /
//     https://bff.berberflow.shop prod)
//   - Retornar { data, total, error } para padronizar tratamento
//   - Endpoints públicos: sem token | Endpoints autenticados: Bearer JWT
//   - Timeout de 8s via AbortController
//   - Nunca lança exceção — erros sempre em { error }
//
// Dependências: nenhuma (fetch nativo do browser)
// =============================================================

class BffApiService {

  static #BASE_URL = (() => {
    const { hostname } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3002'
      : 'https://bff.berberflow.shop';
  })();

  static #TIMEOUT_MS   = 8000;
  static #STORAGE_KEY  = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  // ── HTTP ─────────────────────────────────────────────────────────

  /**
   * Executa GET na BFF com timeout e retorno estruturado.
   * Inclui Authorization Bearer se o usuário estiver autenticado.
   * @param {string}                           path   — ex: '/api/v1/barbearias'
   * @param {Record<string, string|number>}    [params] — query string
   * @returns {Promise<{ data: any, total: number|null, error: Error|null }>}
   */
  static async get(path, params = {}) {
    const url = BffApiService.#buildUrl(path, params);
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        headers: authHeaders,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { data: null, total: null, error: new Error(json?.error ?? `HTTP ${res.status}`) };
      }
      return { data: json?.dados ?? json, total: json?.meta?.total ?? null, error: null };
    } catch (err) {
      return { data: null, total: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa PATCH autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/clientes/localizacao'
   * @param {object} body   — payload JSON
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async patch(path, body) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa POST autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/notificacoes/push-barbeiro'
   * @param {object} body   — payload JSON
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async post(path, body) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  // ── Getter público (usado por GeoService para montar URL da fila offline) ──

  /** @returns {string} URL base da BFF */
  static get baseUrl() { return BffApiService.#BASE_URL; }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Executa fetch com AbortController e timeout configurado.
   * Lança AbortError se o tempo esgotar.
   * @param {string}      url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  static async #fetchComTimeout(url, options) {
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), BffApiService.#TIMEOUT_MS);
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
   * Converte erro de rede/timeout em Error com mensagem amigável.
   * @param {Error} err
   * @returns {Error}
   */
  static #parseErroRede(err) {
    const msg = err?.name === 'AbortError'
      ? 'Timeout: BFF não respondeu a tempo.'
      : (err?.message ?? 'Sem conexão com a BFF.');
    return new Error(msg);
  }

  /**
   * Retorna headers de autenticação se o usuário estiver logado.
   * @returns {Promise<Record<string, string>>}
   */
  static async #authHeaders() {
    const token = await BffApiService.#getTokenAsync();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Prioriza a sessão viva do Supabase SDK e usa localStorage só como fallback.
   * @returns {Promise<string|null>}
   */
  static async #getTokenAsync() {
    try {
      if (typeof SupabaseService !== 'undefined' && typeof SupabaseService.getSession === 'function') {
        const session = await SupabaseService.getSession();
        if (session?.access_token) return session.access_token;
      }
    } catch {
      // Fallback abaixo mantém compatibilidade quando o SDK ainda não carregou.
    }
    return BffApiService.#getToken();
  }

  /**
   * Lê o access_token JWT do localStorage (Supabase).
   * Retorna null se ausente, se não houver expires_at, ou se o token estiver expirado.
   * @returns {string|null}
   */
  static #getToken() {
    try {
      const raw = localStorage.getItem(BffApiService.#STORAGE_KEY);
      if (!raw) return null;
      const parsed    = JSON.parse(raw);
      const token     = parsed?.access_token ?? null;
      const expiresAt = parsed?.expires_at;   // Unix timestamp em segundos
      if (!token) return null;
      // expires_at é obrigatório — sem ele o token é tratado como inválido
      // (protege contra sessões malformadas que não carregam expiração).
      if (!expiresAt) return null;
      // Buffer de 60s para cobrir clock skew entre cliente e servidor + latência de rede
      if (Date.now() / 1000 > expiresAt - 60) return null;
      return token;
    } catch {
      return null;
    }
  }

  /**
   * Retorna true se há um token válido (não expirado) no localStorage.
   * Usado por GeoService e similares para evitar chamadas sem auth.
   * @returns {boolean}
   */
  static temTokenValido() {
    return BffApiService.#getToken() !== null;
  }

  /**
   * Constrói URL com query string a partir de um objeto de parâmetros.
   * @param {string}                          path
   * @param {Record<string, string|number>}   params
   * @returns {string}
   */
  static #buildUrl(path, params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${BffApiService.#BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  }
}
