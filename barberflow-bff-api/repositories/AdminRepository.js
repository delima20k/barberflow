'use strict';

// =============================================================
// AdminRepository.js — Repositório de operações administrativas.
// Camada: repositories
//
// Acessa o banco via service_role (acesso irrestrito ao schema).
// Todas as operações destrutivas exigem UUID válido.
//
// Métodos:
//   getTotais()                  — contagens globais
//   listarUsuarios(filtros)      — profiles paginado
//   criarUsuario(dados)          — cria via Auth Admin API + perfil
//   excluirUsuario(userId)       — apaga via Auth Admin API (cascata FK)
//   criarSubscription(dados)     — cria plano para um usuário
//   listarFinanceiro(filtros)    — subscriptions JOIN profiles
//   atualizarPlano(subId,campos) — PATCH em subscriptions
// =============================================================

const BaseRepository = require('./BaseRepository');

class AdminRepository extends BaseRepository {

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   */
  constructor(db) {
    super('AdminRepository', db);
  }

  // ── Totais ─────────────────────────────────────────────────

  /**
   * Retorna contagens globais: clientes, profissionais e barbearias.
   * @returns {Promise<{ clientes: number, profissionais: number, barbearias: number }>}
   */
  async getTotais() {
    const [clientes, profissionais, barbearias] = await Promise.all([
      this._db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
      this._db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'professional'),
      this._db.from('barbershops').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    if (clientes.error)      this._throwDbError(clientes.error,      'getTotais/clientes');
    if (profissionais.error) this._throwDbError(profissionais.error, 'getTotais/profissionais');
    if (barbearias.error)    this._throwDbError(barbearias.error,    'getTotais/barbearias');

    return {
      clientes:      clientes.count      ?? 0,
      profissionais: profissionais.count ?? 0,
      barbearias:    barbearias.count    ?? 0,
    };
  }

  // ── Usuários ───────────────────────────────────────────────

  /**
   * Lista perfis com paginação e filtro opcional por role.
   * @param {{ role?: string|null, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarUsuarios({ role = null, limit = 20, offset = 0 } = {}) {
    let query = this._db
      .from('profiles')
      .select('id, full_name, email, role, pro_type, is_active, created_at')
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (role) query = query.eq('role', role);

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'listarUsuarios');
    return data ?? [];
  }

  /**
   * Cria usuário via Supabase Auth Admin API e faz upsert do perfil.
   * email_confirm: true para pular verificação de e-mail.
   *
   * @param {{ email: string, senha: string, full_name: string, role?: string, pro_type?: string|null }} dados
   * @returns {Promise<object>} perfil criado
   */
  async criarUsuario({ email, senha, full_name, role = 'client', pro_type = null }) {
    const { data, error } = await this._db.auth.admin.createUser({
      email,
      password:      senha,
      email_confirm: true,
      user_metadata: { full_name, role, pro_type },
    });

    if (error) this._throwDbError(error, 'criarUsuario/auth');

    const userId = data.user.id;

    const { data: perfil, error: errPerfil } = await this._db
      .from('profiles')
      .upsert(
        { id: userId, full_name, role, pro_type, email, is_active: true },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (errPerfil) this._throwDbError(errPerfil, 'criarUsuario/perfil');
    return perfil;
  }

  /**
   * Exclui usuário via Auth Admin API.
   * A FK ON DELETE CASCADE apaga automaticamente profiles e barbershops.
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async excluirUsuario(userId) {
    this._uuid('userId', userId);
    const { error } = await this._db.auth.admin.deleteUser(userId);
    if (error) this._throwDbError(error, 'excluirUsuario');
  }

  // ── Planos ─────────────────────────────────────────────────

  /**
   * Cria uma subscription para o usuário.
   * @param {{ userId: string, plan_type: string, status?: string, price?: number, ends_at: string }} dados
   * @returns {Promise<object>}
   */
  async criarSubscription({ userId, plan_type, status = 'active', price = 0, ends_at }) {
    this._uuid('userId', userId);

    const { data, error } = await this._db
      .from('subscriptions')
      .insert({ user_id: userId, plan_type, status, price, ends_at, platform: 'web' })
      .select()
      .single();

    if (error) this._throwDbError(error, 'criarSubscription');
    return data;
  }

  // ── Financeiro ─────────────────────────────────────────────

  /**
   * Lista subscriptions com dados do perfil.
   * Ordenado por ends_at ASC (quem expira primeiro aparece primeiro).
   * @param {{ status?: string|null, limit?: number, offset?: number }} filtros
   * @returns {Promise<object[]>}
   */
  async listarFinanceiro({ status = null, limit = 50, offset = 0 } = {}) {
    let query = this._db
      .from('subscriptions')
      .select(`
        id, plan_type, status, price, starts_at, ends_at, platform,
        profiles:user_id ( id, full_name, email, role, pro_type )
      `)
      .order('ends_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'listarFinanceiro');
    return data ?? [];
  }

  /**
   * Atualiza campos de uma subscription (plan_type, status, price, ends_at).
   * @param {string} subId   — UUID da subscription
   * @param {object} campos  — campos a atualizar
   * @returns {Promise<object>}
   */
  async atualizarPlano(subId, campos) {
    this._uuid('subId', subId);

    const PERMITIDOS = new Set(['plan_type', 'status', 'price', 'ends_at']);
    const update = Object.fromEntries(
      Object.entries(campos).filter(([k]) => PERMITIDOS.has(k))
    );

    if (Object.keys(update).length === 0) {
      const AppError = require('../utils/AppError');
      throw AppError.badRequest('Nenhum campo válido para atualizar.');
    }

    const { data, error } = await this._db
      .from('subscriptions')
      .update(update)
      .eq('id', subId)
      .select()
      .single();

    if (error) this._throwDbError(error, 'atualizarPlano');
    return data;
  }
}

module.exports = AdminRepository;
