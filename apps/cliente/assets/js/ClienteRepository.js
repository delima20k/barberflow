'use strict';

// =============================================================
// ClienteRepository.js — Acesso a dados do cliente (role='client').
// Abstrai queries da tabela profiles com filtro explícito de role.
// Nenhuma lógica de negócio — apenas persistência e leitura.
//
// Dependências: ApiService.js, InputValidator.js,
//               ProfileRepository.js, AppointmentRepository.js
// =============================================================

class ClienteRepository {

  // Campos retornados nas leituras de perfil
  static #SELECT_PERFIL =
    'id,full_name,phone,avatar_path,address,zip_code,birth_date,gender,is_active,created_at';

  // Allowlist de campos que o cliente pode atualizar
  static #CAMPOS_EDITAVEIS = [
    'full_name', 'phone', 'address', 'zip_code', 'birth_date', 'gender',
  ];

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca perfil de um cliente pelo UUID do usuário.
   * Rejeita se o role não for 'client' (linha não encontrada → erro).
   * @param {string} userId
   * @returns {Promise<object>}
   */
  static async getById(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] userId: ${rId.msg}`);

    const { data, error } = await ApiService.from('profiles')
      .select(ClienteRepository.#SELECT_PERFIL)
      .eq('id', userId)
      .eq('role', 'client')
      .single();

    if (error) throw error;
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Atualiza dados editáveis do cliente.
   * Aplica allowlist para prevenir mass assignment.
   * @param {string} userId
   * @param {object} dados — campos a atualizar (apenas da allowlist)
   * @returns {Promise<void>}
   */
  static async update(userId, dados) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] userId: ${rId.msg}`);

    const { ok, msg, valor: dadosFiltrados } =
      InputValidator.payload(dados, ClienteRepository.#CAMPOS_EDITAVEIS);
    if (!ok) throw new TypeError(`[ClienteRepository] ${msg}`);

    // Sanitiza campos de texto livre
    for (const campo of ['full_name', 'address']) {
      if (campo in dadosFiltrados) {
        const max = campo === 'address' ? 200 : 100;
        const r = InputValidator.textoLivre(dadosFiltrados[campo], max);
        if (!r.ok) throw new TypeError(`[ClienteRepository] ${campo}: ${r.msg}`);
        dadosFiltrados[campo] = r.valor;
      }
    }

    const { error } = await ApiService.from('profiles')
      .update({ ...dadosFiltrados, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('role', 'client');

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════
  // DOMÍNIO — delega para repositórios especializados
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna barbearias favoritas do cliente.
   * Delega para ProfileRepository para evitar duplicação de queries.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  static async getFavoritos(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] userId: ${rId.msg}`);
    return ProfileRepository.getFavorites(userId);
  }

  /**
   * Retorna histórico de agendamentos futuros do cliente.
   * Delega para AppointmentRepository.
   * @param {string} userId
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  static async getHistorico(userId, limit = 20) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ClienteRepository] userId: ${rId.msg}`);
    return AppointmentRepository.getByCliente(userId, limit);
  }
}
