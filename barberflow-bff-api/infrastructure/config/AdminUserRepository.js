'use strict';

// ============================================================
// AdminUserRepository — consulta da tabela admin_users.
//
// Verifica se um usuário Supabase autenticado possui registro
// ativo na tabela de administradores.
//
// Acesso via service_role (tabela sem policies públicas).
// ============================================================

class AdminUserRepository {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    if (!supabase) throw new TypeError('AdminUserRepository: supabase é obrigatório.');
    this.#db = supabase;
  }

  /**
   * Retorna o registro do admin se user_id + email coincidirem
   * e active = true. Retorna null caso contrário.
   *
   * @param {string} userId — UUID do usuário (req.user.id)
   * @param {string} email  — e-mail do usuário (req.user.email)
   * @returns {Promise<{ id: string, user_id: string, email: string } | null>}
   */
  async findActive(userId, email) {
    if (!userId || !email) return null;

    const { data, error } = await this.#db
      .from('admin_users')
      .select('id, user_id, email')
      .eq('user_id', userId)
      .eq('email', email)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      // Loga apenas o código — nunca o valor dos parâmetros
      throw new Error(`[AdminUserRepository.findActive] ${error.message}`);
    }

    return data ?? null;
  }
}

module.exports = { AdminUserRepository };
