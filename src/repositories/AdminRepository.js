'use strict';

// =============================================================
// AdminRepository.js — Repositório de operações administrativas.
// Camada: infra
//
// Acessa o banco via service_role (acesso irrestrito ao schema).
// Todas as operações destrutivas exigem UUID válido.
//
// Métodos:
//   getTotais()                  — contagens globais
//   listarUsuarios(filtros)      — profiles paginado
//   criarUsuario(dados)          — cria usuário via Auth Admin API + perfil
//   excluirUsuario(userId)       — apaga via Auth Admin API (cascata FK)
//   criarSubscription(dados)     — cria plano para um usuário
//   listarFinanceiro(filtros)    — subscriptions JOIN profiles
//   atualizarPlano(subId,campos) — PATCH em subscriptions
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

class AdminRepository extends BaseRepository {

  #supabase;

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('AdminRepository');
    this.#supabase = supabase;
  }

  // ── Totais ─────────────────────────────────────────────────

  /**
   * Retorna contagens globais: clientes, profissionais e barbearias.
   * @returns {Promise<{ clientes: number, profissionais: number, barbearias: number }>}
   */
  async getTotais() {
    const [clientes, profissionais, barbearias] = await Promise.all([
      this.#supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client'),
      this.#supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'professional'),
      this.#supabase
        .from('barbershops')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
    ]);

    if (clientes.error)      throw clientes.error;
    if (profissionais.error) throw profissionais.error;
    if (barbearias.error)    throw barbearias.error;

    return {
      clientes:      clientes.count      ?? 0,
      profissionais: profissionais.count ?? 0,
      barbearias:    barbearias.count    ?? 0,
    };
  }

  // ── Usuários ───────────────────────────────────────────────

  /**
   * Lista perfis com paginação e filtro opcional por role.
   * @param {{ role?: string, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarUsuarios({ role = null, limit = 20, offset = 0 } = {}) {
    let query = this.#supabase
      .from('profiles')
      .select('id, full_name, email, role, pro_type, is_active, created_at')
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Cria usuário via Supabase Auth Admin API e faz upsert do perfil.
   * Usa email_confirm: true para pular verificação de e-mail.
   *
   * @param {{
   *   email:     string,
   *   senha:     string,
   *   full_name: string,
   *   role?:     string,
   *   pro_type?: string
   * }} dados
   * @returns {Promise<object>} perfil criado
   */
  async criarUsuario({ email, senha, full_name, role = 'client', pro_type = null }) {
    const { data, error } = await this.#supabase.auth.admin.createUser({
      email,
      password:      senha,
      email_confirm: true,
      user_metadata: { full_name, role, pro_type },
    });

    if (error) throw error;

    const userId = data.user.id;

    const { data: perfil, error: errPerfil } = await this.#supabase
      .from('profiles')
      .upsert(
        { id: userId, full_name, role, pro_type, email, is_active: true },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (errPerfil) throw errPerfil;
    return perfil;
  }

  /**
   * Exclui usuário via Auth Admin API.
   * A FK ON DELETE CASCADE apaga automaticamente profiles e barbershops.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirUsuario(userId) {
    this._validarUuid('userId', userId);
    const { error } = await this.#supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  // ── Planos ─────────────────────────────────────────────────

  /**
   * Cria uma subscription para o usuário.
   * @param {{
   *   userId:    string,
   *   plan_type: 'trial'|'mensal'|'trimestral',
   *   status?:   string,
   *   price?:    number,
   *   ends_at:   string   — ISO 8601
   * }} dados
   * @returns {Promise<object>}
   */
  async criarSubscription({ userId, plan_type, status = 'active', price = 0, ends_at }) {
    this._validarUuid('userId', userId);

    const { data, error } = await this.#supabase
      .from('subscriptions')
      .insert({
        user_id:   userId,
        plan_type,
        status,
        price,
        ends_at,
        platform:  'web',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // ── Financeiro ─────────────────────────────────────────────

  /**
   * Lista subscriptions com dados do perfil do usuário.
   * Ordenado por ends_at ASC para exibir quem expira primeiro.
   *
   * @param {{
   *   status?: string,
   *   limit?:  number,
   *   offset?: number
   * }} filtros
   * @returns {Promise<object[]>}
   */
  async listarFinanceiro({ status = null, limit = 50, offset = 0 } = {}) {
    let query = this.#supabase
      .from('subscriptions')
      .select(`
        id, plan_type, status, price, starts_at, ends_at, platform,
        profiles:user_id ( id, full_name, email, role, pro_type )
      `)
      .order('ends_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Atualiza campos de uma subscription (plan_type, status, price, ends_at).
   * @param {string}  subId  — UUID da subscription
   * @param {object}  campos — campos a atualizar
   * @returns {Promise<object>}
   */
  async atualizarPlano(subId, campos) {
    this._validarUuid('subId', subId);

    const PERMITIDOS = new Set(['plan_type', 'status', 'price', 'ends_at']);
    const update = Object.fromEntries(
      Object.entries(campos).filter(([k]) => PERMITIDOS.has(k))
    );

    if (Object.keys(update).length === 0) {
      throw Object.assign(new Error('Nenhum campo válido para atualizar.'), { status: 400 });
    }

    const { data, error } = await this.#supabase
      .from('subscriptions')
      .update(update)
      .eq('id', subId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = AdminRepository;
