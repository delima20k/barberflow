'use strict';

// =============================================================
// BffApiService.js — Cliente HTTP para a BFF BarberFlow.
//
// Responsabilidades:
//   - Centralizar todas as chamadas HTTP ao BFF (porta 3002 dev /
//     https://bff.barberflow.app prod)
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
      : 'https://bff.barberflow.app';
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
    const url     = BffApiService.#buildUrl(path, params);
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), BffApiService.#TIMEOUT_MS);

    try {
      const res  = await fetch(url, {
        signal:  ctrl.signal,
        headers: BffApiService.#authHeaders(),
      });
      clearTimeout(timerId);

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          data:  null,
          total: null,
          error: new Error(json?.error ?? `HTTP ${res.status}`),
        };
      }

      return {
        data:  json?.dados ?? json,
        total: json?.meta?.total ?? null,
        error: null,
      };
    } catch (err) {
      clearTimeout(timerId);
      const msg = err?.name === 'AbortError'
        ? 'Timeout: BFF não respondeu a tempo.'
        : (err?.message ?? 'Sem conexão com a BFF.');
      return { data: null, total: null, error: new Error(msg) };
    }
  }

  /**
   * Executa PATCH autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/clientes/localizacao'
   * @param {object} body   — payload JSON
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async patch(path, body) {
    const url     = `${BffApiService.#BASE_URL}${path}`;
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), BffApiService.#TIMEOUT_MS);

    try {
      const res  = await fetch(url, {
        method:  'PATCH',
        signal:  ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...BffApiService.#authHeaders(),
        },
        body: JSON.stringify(body),
      });
      clearTimeout(timerId);

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { data: null, error: new Error(json?.error ?? `HTTP ${res.status}`) };
      }

      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      clearTimeout(timerId);
      const msg = err?.name === 'AbortError'
        ? 'Timeout: BFF não respondeu a tempo.'
        : (err?.message ?? 'Sem conexão com a BFF.');
      return { data: null, error: new Error(msg) };
    }
  }

  // ── Getter público (usado por GeoService para montar URL da fila offline) ──

  /** @returns {string} URL base da BFF */
  static get baseUrl() { return BffApiService.#BASE_URL; }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Retorna headers de autenticação se o usuário estiver logado.
   * @returns {Record<string, string>}
   */
  static #authHeaders() {
    const token = BffApiService.#getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Lê o access_token JWT do localStorage (Supabase).
   * @returns {string|null}
   */
  static #getToken() {
    try {
      const raw = localStorage.getItem(BffApiService.#STORAGE_KEY);
      return raw ? (JSON.parse(raw)?.access_token ?? null) : null;
    } catch {
      return null;
    }
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
