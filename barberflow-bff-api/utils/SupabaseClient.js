'use strict';

const { createClient } = require('@supabase/supabase-js');

/**
 * SupabaseClient — Singleton lazy do cliente Supabase para o BFF.
 *
 * Lido na primeira chamada a getInstance(). Usa service_role_key para
 * queries backend (bypassa RLS). Sessão desabilitada — sem cookies.
 *
 * Reutilizável por todos os repositórios do BFF via injeção no construtor.
 */
class SupabaseClient {

  /** @type {import('@supabase/supabase-js').SupabaseClient|null} */
  static #instancia = null;

  /**
   * Retorna a instância singleton do cliente Supabase.
   * Cria na primeira chamada usando variáveis de ambiente.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  static getInstance() {
    if (SupabaseClient.#instancia) return SupabaseClient.#instancia;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        '[SupabaseClient] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.',
      );
    }

    SupabaseClient.#instancia = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    return SupabaseClient.#instancia;
  }

  /** Reseta o singleton (uso exclusivo em testes). */
  static _resetar() {
    SupabaseClient.#instancia = null;
  }
}

module.exports = SupabaseClient;
