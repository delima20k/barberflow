'use strict';

/**
 * SupabaseUnitOfWork — Coordena operações atômicas via transação RPC do Supabase.
 *
 * Supabase não expõe BEGIN/COMMIT diretamente no JS client.
 * A estratégia é agrupar operações em funções PL/pgSQL chamadas via `.rpc()`.
 * Para casos simples (sem transação), execute as operações sequencialmente
 * e use este objeto apenas como ponto de coleta de repositórios.
 *
 * Uso:
 * ```js
 * await uow.withTransaction(async () => {
 *   await uow.agendamentos.save(agendamento);
 *   await uow.notificacoes.save(notificacao);
 * });
 * ```
 */
class SupabaseUnitOfWork {
  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #client;
  /** @type {Map<string, object>} */
  #repositories = new Map();

  /**
   * @param {{ supabaseClient: import('@supabase/supabase-js').SupabaseClient }} deps
   */
  constructor({ supabaseClient }) {
    if (!supabaseClient) throw new Error('SupabaseUnitOfWork: supabaseClient é obrigatório');
    this.#client = supabaseClient;
  }

  /**
   * Registra um repositório pelo nome para acesso centralizado.
   * @param {string} name
   * @param {object} repository
   */
  register(name, repository) {
    this.#repositories.set(name, repository);
  }

  /**
   * Retorna um repositório registrado.
   * @param {string} name
   * @returns {object}
   */
  get(name) {
    const repo = this.#repositories.get(name);
    if (!repo) throw new Error(`SupabaseUnitOfWork: repositório "${name}" não registrado`);
    return repo;
  }

  /**
   * Executa operações em uma transação via RPC PL/pgSQL.
   * Quando as operações não precisam ser atômicas, use execute() direto.
   *
   * AVISO: Supabase JS client não suporta transações explícitas.
   * Para transações reais, crie uma RPC no banco e chame-a aqui.
   *
   * @param {() => Promise<void>} work
   * @returns {Promise<void>}
   */
  async withTransaction(work) {
    // Por ora executa sequencialmente; substituir por rpc() atômica quando necessário
    await work();
  }

  /**
   * Acesso direto ao cliente Supabase para operações avançadas.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  get client() { return this.#client; }
}

module.exports = { SupabaseUnitOfWork };
