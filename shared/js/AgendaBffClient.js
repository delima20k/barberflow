'use strict';

// =============================================================
// AgendaBffClient.js — Cliente HTTP para endpoints de agendamentos na BFF.
//
// Responsabilidades:
//   - Centralizar todas as chamadas de agendamentos para a BFF
//   - Retornar { dados, erro, indisponivel } para tratamento padronizado
//   - Suportar fallback: se `indisponivel=true`, ClienteService usa
//     AppointmentRepository (PostgREST direto) como fallback
//   - Timeout de 8s via AbortController
//   - Nunca lança exceção — erros sempre em { erro }
//
// Dependências: nenhuma (fetch nativo do browser)
// =============================================================

class AgendaBffClient {

  static #BASE_URL = (() => {
    const { hostname } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3002'
      : 'https://bff.berberflow.shop';
  })();

  static #TIMEOUT_MS  = 8_000;
  static #STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  // ── Privados: helpers ─────────────────────────────────────────────

  /** Lê o access_token do localStorage (salvo pelo SDK Supabase). */
  static #lerToken() {
    try {
      const raw = localStorage.getItem(AgendaBffClient.#STORAGE_KEY);
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
    const timerId = setTimeout(() => ctrl.abort(), AgendaBffClient.#TIMEOUT_MS);
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
   * Monta headers de autenticação padrão para todas as requisições.
   * @returns {object}
   */
  static #headersAuth() {
    const headers = { 'Content-Type': 'application/json' };
    const token   = AgendaBffClient.#lerToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  /**
   * Processa resposta da BFF e retorna formato padronizado.
   * @returns {Promise<{ dados: any, erro: string|null, indisponivel: boolean }>}
   */
  static async #processar(fetchPromise) {
    try {
      const res  = await fetchPromise;
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

  // ── Privados: métodos HTTP ─────────────────────────────────────────

  static #get(path) {
    const url     = `${AgendaBffClient.#BASE_URL}${path}`;
    const promise = AgendaBffClient.#fetchComTimeout(url, {
      method:  'GET',
      headers: AgendaBffClient.#headersAuth(),
    });
    return AgendaBffClient.#processar(promise);
  }

  static #post(path, body) {
    const url     = `${AgendaBffClient.#BASE_URL}${path}`;
    const promise = AgendaBffClient.#fetchComTimeout(url, {
      method:  'POST',
      headers: AgendaBffClient.#headersAuth(),
      body:    JSON.stringify(body),
    });
    return AgendaBffClient.#processar(promise);
  }

  static #patch(path, body) {
    const url     = `${AgendaBffClient.#BASE_URL}${path}`;
    const promise = AgendaBffClient.#fetchComTimeout(url, {
      method:  'PATCH',
      headers: AgendaBffClient.#headersAuth(),
      body:    JSON.stringify(body),
    });
    return AgendaBffClient.#processar(promise);
  }

  static #del(path) {
    const url     = `${AgendaBffClient.#BASE_URL}${path}`;
    const promise = AgendaBffClient.#fetchComTimeout(url, {
      method:  'DELETE',
      headers: AgendaBffClient.#headersAuth(),
    });
    return AgendaBffClient.#processar(promise);
  }

  // ── Público ───────────────────────────────────────────────────────

  /**
   * Lista os agendamentos do usuário autenticado.
   * @returns {Promise<{ dados: object[]|null, erro: string|null, indisponivel: boolean }>}
   */
  static listar() {
    return AgendaBffClient.#get('/api/agendamentos');
  }

  /**
   * Cria um novo agendamento.
   * @param {{ professional_id: string, barbershop_id: string, service_id: string, scheduled_at: string, duration_min: number, price_charged?: number, notes?: string }} payload
   * @returns {Promise<{ dados: object|null, erro: string|null, indisponivel: boolean }>}
   */
  static criar(payload) {
    return AgendaBffClient.#post('/api/agendamentos', payload);
  }

  /**
   * Atualiza o status de um agendamento.
   * @param {string} id     — UUID do agendamento
   * @param {string} status — novo status (ex: 'confirmed', 'cancelled')
   * @returns {Promise<{ dados: object|null, erro: string|null, indisponivel: boolean }>}
   */
  static atualizarStatus(id, status) {
    return AgendaBffClient.#patch(`/api/agendamentos/${id}`, { status });
  }

  /**
   * Cancela um agendamento.
   * @param {string} id — UUID do agendamento
   * @returns {Promise<{ dados: object|null, erro: string|null, indisponivel: boolean }>}
   */
  static cancelar(id) {
    return AgendaBffClient.#del(`/api/agendamentos/${id}`);
  }
}
