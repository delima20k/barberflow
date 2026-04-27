'use strict';

// =============================================================
// ProfissionalRepository.js — Repositório de profissionais.
// Camada: infra
//
// Tabelas: professionals, chairs, portfolio_images.
// Sem lógica de negócio — apenas acesso e persistência.
// Usa @supabase/supabase-js com service_role key.
// =============================================================

const BaseRepository = require('../infra/BaseRepository');

class ProfissionalRepository extends BaseRepository {

  #supabase;

  static #SELECT_PROFISSIONAL = `
    id, barbershop_id, role, is_active,
    profile:profiles!id(full_name, phone, avatar_path, bio, address, zip_code, city)
  `;

  static #CAMPOS_ATUALIZAVEIS = ['role', 'is_active'];

  /** @param {import('@supabase/supabase-js').SupabaseClient} supabase */
  constructor(supabase) {
    super('ProfissionalRepository');
    this.#supabase = supabase;
  }

  /**
   * Busca profissional pelo ID de perfil.
   * Na tabela professionals, `id` é a FK para profiles.id.
   * @param {string} id — UUID do perfil
   * @returns {Promise<object|null>}
   */
  async getById(id) {
    this._validarUuid('id', id);

    const { data, error } = await this.#supabase
      .from('professionals')
      .select(ProfissionalRepository.#SELECT_PROFISSIONAL)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  }

  /**
   * Lista profissionais de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getByBarbershop(barbershopId) {
    this._validarUuid('barbershopId', barbershopId);

    const { data, error } = await this.#supabase
      .from('professionals')
      .select(ProfissionalRepository.#SELECT_PROFISSIONAL)
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Atualiza dados do profissional (apenas campos da allowlist).
   * @param {string} id
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async update(id, dados) {
    this._validarUuid('id', id);

    const valor = this._validarPayload(dados, ProfissionalRepository.#CAMPOS_ATUALIZAVEIS);

    const { data, error } = await this.#supabase
      .from('professionals')
      .update(valor)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Retorna as cadeiras da barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async getCadeiras(barbershopId) {
    this._validarUuid('barbershopId', barbershopId);

    const { data, error } = await this.#supabase
      .from('chairs')
      .select('id, name, is_active, position')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Retorna as imagens do portfólio de um profissional.
   * @param {string} professionalId
   * @returns {Promise<object[]>}
   */
  async getPortfolio(professionalId) {
    this._validarUuid('professionalId', professionalId);

    const { data, error } = await this.#supabase
      .from('portfolio_images')
      .select('id, image_url, thumbnail_path, caption, created_at')
      .eq('professional_id', professionalId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Adiciona imagem ao portfólio.
   * @param {string} professionalId
   * @param {object} dados — { image_url, thumbnail_path?, caption? }
   * @returns {Promise<object>}
   */
  async addPortfolioImage(professionalId, dados) {
    this._validarUuid('professionalId', professionalId);

    const { data, error } = await this.#supabase
      .from('portfolio_images')
      .insert({
        professional_id: professionalId,
        image_url:       dados.image_url,
        thumbnail_path:  dados.thumbnail_path ?? null,
        caption:         dados.caption        ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Remove imagem do portfólio.
   * @param {string} imageId
   * @param {string} professionalId — verifica ownership
   * @returns {Promise<boolean>}
   */
  async removePortfolioImage(imageId, professionalId) {
    this._validarUuid('imageId', imageId);
    this._validarUuid('professionalId', professionalId);

    const { error } = await this.#supabase
      .from('portfolio_images')
      .delete()
      .eq('id', imageId)
      .eq('professional_id', professionalId);

    if (error) throw error;
    return true;
  }
}

module.exports = ProfissionalRepository;
