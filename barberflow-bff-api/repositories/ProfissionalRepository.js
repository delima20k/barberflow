'use strict';

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');

/**
 * ProfissionalRepository — Repositório de operações do profissional/barbeiro.
 *
 * Acessa tabelas: barbershop_invites, professional_shop_links, agreements.
 *
 * Camada: infra
 */
class ProfissionalRepository extends BaseRepository {

  /** @param {import('@supabase/supabase-js').SupabaseClient} db */
  constructor(db) {
    super('ProfissionalRepository', db);
  }

  // ── Convites ─────────────────────────────────────────────────────

  /**
   * Lista convites recebidos pelo profissional autenticado.
   * @param {string} profissionalId
   * @returns {Promise<object[]>}
   */
  async buscarPerfilPublico(professionalId) {
    this._uuid('professionalId', professionalId);

    const profile = await this.#buscarProfilePublicoSeguro(professionalId);
    if (!profile?.is_active) return null;

    const professional = await this.#buscarProfessionalPublicoSeguro(professionalId);
    if (!professional?.is_active) return null;

    return this.#montarPerfilPublico(profile, professional);
  }

  async atualizarPerfilPublico(userId, payload) {
    this._uuid('userId', userId);

    const profilePayload = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'birth_date')) profilePayload.birth_date = payload.birth_date;
    if (Object.prototype.hasOwnProperty.call(payload, 'gender')) profilePayload.gender = payload.gender;

    const professionalPayload = {};
    if (Object.prototype.hasOwnProperty.call(payload, 'since_year')) professionalPayload.since_year = payload.since_year;

    if (Object.keys(profilePayload).length > 0) {
      profilePayload.updated_at = new Date().toISOString();
      const { error } = await this._db.from('profiles').update(profilePayload).eq('id', userId);
      if (error) this._throwDbError(error, 'atualizarPerfilPublico.profile');
    }

    if (Object.keys(professionalPayload).length > 0) {
      professionalPayload.updated_at = new Date().toISOString();
      const { error } = await this._db
        .from('professionals')
        .upsert({ id: userId, ...professionalPayload }, { onConflict: 'id' });
      if (error) this._throwDbError(error, 'atualizarPerfilPublico.professional');
    }

    return { id: userId, ...payload };
  }

  async buscarContextoMensagem(professionalId) {
    this._uuid('professionalId', professionalId);
    const perfil = await this.buscarPerfilPublico(professionalId);
    if (!perfil?.barbershop_id || !perfil?.barbershop_owner_id) return null;
    return {
      professional_id: perfil.id,
      professional_name: perfil.full_name,
      barbershop_id: perfil.barbershop_id,
      barbershop_name: perfil.barbershop_name,
      owner_id: perfil.barbershop_owner_id,
    };
  }

  async encontrarConversaDireta(clientId, ownerId) {
    this._uuid('clientId', clientId);
    this._uuid('ownerId', ownerId);

    const { data: clientParts, error: clientError } = await this._db
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', clientId)
      .is('left_at', null)
      .limit(50);
    if (clientError) this._throwDbError(clientError, 'encontrarConversaDireta.client');

    const conversationIds = (clientParts ?? []).map(row => row.conversation_id).filter(Boolean);
    if (conversationIds.length === 0) return null;

    const { data: ownerParts, error: ownerError } = await this._db
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', ownerId)
      .is('left_at', null)
      .in('conversation_id', conversationIds)
      .limit(1);
    if (ownerError) this._throwDbError(ownerError, 'encontrarConversaDireta.owner');

    return ownerParts?.[0]?.conversation_id ?? null;
  }

  async criarConversaDireta(dados) {
    this._uuid('clientId', dados.clientId);
    this._uuid('ownerId', dados.ownerId);

    const { data: conversation, error: conversationError } = await this._db
      .from('chat_conversations')
      .insert({ type: 'direct', created_by: dados.createdBy, metadata: dados.metadata })
      .select('id')
      .single();
    if (conversationError) this._throwDbError(conversationError, 'criarConversaDireta.conversation');

    const { error: participantsError } = await this._db
      .from('chat_participants')
      .insert([
        { conversation_id: conversation.id, user_id: dados.clientId, role: 'member' },
        { conversation_id: conversation.id, user_id: dados.ownerId, role: 'member' },
      ]);
    if (participantsError) this._throwDbError(participantsError, 'criarConversaDireta.participants');

    return conversation.id;
  }

  async buscarRoleUsuario(userId) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) this._throwDbError(error, 'buscarRoleUsuario');
    return data?.role ?? null;
  }

  async listarPortfolioPublico(professionalId, { limit, offset }) {
    this._uuid('professionalId', professionalId);

    const from = offset;
    const to = offset + limit - 1;
    const { data, error, count } = await this._db
      .from('portfolio_images')
      .select('id, title, description, category, storage_path, thumbnail_path, likes_count, views_count, is_featured, updated_at', { count: 'exact' })
      .eq('owner_id', professionalId)
      .eq('owner_type', 'professional')
      .eq('status', 'active')
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) this._throwDbError(error, 'listarPortfolioPublico');

    return { items: data ?? [], total: count ?? 0 };
  }

  async atualizarPortfolioImagem(userId, imageId, payload) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const { data, error } = await this._db
      .from('portfolio_images')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', imageId)
      .eq('owner_id', userId)
      .eq('owner_type', 'professional')
      .neq('status', 'deleted')
      .select('id, title, description, category, storage_path, thumbnail_path, likes_count, views_count, is_featured, updated_at')
      .maybeSingle();
    if (error) this._throwDbError(error, 'atualizarPortfolioImagem');
    return data;
  }

  async removerPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const { data, error } = await this._db
      .from('portfolio_images')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', imageId)
      .eq('owner_id', userId)
      .eq('owner_type', 'professional')
      .neq('status', 'deleted')
      .select('id, storage_path')
      .maybeSingle();
    if (error) this._throwDbError(error, 'removerPortfolioImagem');
    return { deleted: Boolean(data?.id), storage_path: data?.storage_path ?? null };
  }

  // ── Portfolio — gerenciamento próprio ─────────────────────────────

  async curtirPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const current = await this.#buscarPortfolioAtivo(imageId);
    if (!current?.id) return { exists: false, likes_count: 0 };

    const { data: existing, error: existingError } = await this._db
      .from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('content_id', imageId)
      .eq('content_type', 'portfolio_image')
      .limit(1);
    if (existingError) this._throwDbError(existingError, 'curtirPortfolioImagem.exists');

    if (!existing?.length) {
      const { error } = await this._db
        .from('likes')
        .insert({
          user_id: userId,
          content_id: imageId,
          content_type: 'portfolio_image',
        });
      if (error && error.code !== '23505') this._throwDbError(error, 'curtirPortfolioImagem.insert');
    }

    const atualizado = await this.#buscarPortfolioAtivo(imageId);
    return { exists: true, likes_count: atualizado?.likes_count ?? current.likes_count ?? 0 };
  }

  async listarCurtidasPortfolio(userId, imageIds) {
    this._uuid('userId', userId);
    const ids = Array.isArray(imageIds) ? imageIds : [];
    ids.forEach(id => this._uuid('imageId', id));
    if (!ids.length) return [];

    const { data, error } = await this._db
      .from('likes')
      .select('content_id')
      .eq('user_id', userId)
      .eq('content_type', 'portfolio_image')
      .in('content_id', ids);
    if (error) this._throwDbError(error, 'listarCurtidasPortfolio');

    return (data ?? []).map(row => row.content_id).filter(Boolean);
  }

  async descurtirPortfolioImagem(userId, imageId) {
    this._uuid('userId', userId);
    this._uuid('imageId', imageId);

    const current = await this.#buscarPortfolioAtivo(imageId);
    if (!current?.id) return { exists: false, likes_count: 0 };

    const { error } = await this._db
      .from('likes')
      .delete()
      .eq('user_id', userId)
      .eq('content_id', imageId)
      .eq('content_type', 'portfolio_image');
    if (error) this._throwDbError(error, 'descurtirPortfolioImagem.delete');

    const atualizado = await this.#buscarPortfolioAtivo(imageId);
    return { exists: true, likes_count: atualizado?.likes_count ?? current.likes_count ?? 0 };
  }

  async listarMeuPortfolio(userId, { limit = 10, offset = 0 } = {}) {
    this._uuid('userId', userId);
    const from = Number(offset);
    const to   = from + Number(limit) - 1;
    const { data, error, count } = await this._db
      .from('portfolio_images')
      .select('id, title, description, category, storage_path, thumbnail_path, likes_count, views_count, is_featured, updated_at', { count: 'exact' })
      .eq('owner_id', userId)
      .eq('owner_type', 'professional')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) this._throwDbError(error, 'listarMeuPortfolio');
    return { items: data ?? [], total: count ?? 0 };
  }

  async contarPortfolioImagens(userId) {
    this._uuid('userId', userId);
    const { count, error } = await this._db
      .from('portfolio_images')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId)
      .eq('owner_type', 'professional')
      .neq('status', 'deleted');
    if (error) this._throwDbError(error, 'contarPortfolioImagens');
    return count ?? 0;
  }

  async salvarPortfolioImagem(userId, storagePath, thumbnailPath = storagePath) {
    this._uuid('userId', userId);
    const { data, error } = await this._db
      .from('portfolio_images')
      .insert({
        owner_id:    userId,
        owner_type:  'professional',
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        status:      'active',
        created_at:  new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
      .select('id, title, description, category, storage_path, thumbnail_path, likes_count, views_count, is_featured, updated_at')
      .maybeSingle();
    if (error) this._throwDbError(error, 'salvarPortfolioImagem');
    return data;
  }

  async uploadPortfolioImagem(path, buffer, contentType) {
    const { error } = await this._db.storage
      .from('portfolio')
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      this._warn('uploadPortfolioImagem', error);
      this._throwDbError(error, 'uploadPortfolioImagem');
    }
  }

  async removerArquivoPortfolio(storagePath) {
    try {
      await this._db.storage.from('portfolio').remove([storagePath]);
    } catch (err) {
      this._warn('removerArquivoPortfolio', err);
    }
  }

  getPortfolioPublicUrl(path) {
    const baseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    return `${baseUrl}/storage/v1/object/public/portfolio/${path}`;
  }

  async getConvites(profissionalId) {
    this._uuid('profissionalId', profissionalId);

    const { data, error } = await this._db
      .from('barbershop_invites')
      .select('id, commission_pct, message, status, created_at, barbershop:barbershops!barbershop_id(id, name, logo_path, address)')
      .eq('barbeiro_id', profissionalId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      this._warn('getConvites', error);
      this._throwDbError(error, 'getConvites');
    }
    return data ?? [];
  }

  /**
   * Aceita convite: cria vínculo, registra acordo e atualiza status.
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{aceito: true}>}
   */
  async aceitarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);

    // 1. Busca e valida convite
    const { data: invite, error: errGet } = await this._db
      .from('barbershop_invites')
      .select('id, barbershop_id, barbeiro_id, commission_pct, message, status')
      .eq('id', inviteId)
      .eq('barbeiro_id', profissionalId)
      .maybeSingle();

    if (errGet) {
      this._warn('aceitarConvite fetch', errGet);
      this._throwDbError(errGet, 'aceitarConvite fetch');
    }
    if (!invite) throw AppError.notFound('Convite não encontrado.');
    if (invite.status !== 'pendente') throw AppError.conflict('Convite já respondido.');

    // 2. Verifica vínculo existente
    const { data: linkExist } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('professional_id', profissionalId)
      .eq('barbershop_id', invite.barbershop_id)
      .eq('is_active', true)
      .maybeSingle();

    if (linkExist) throw AppError.conflict('Barbeiro já vinculado a esta barbearia.');

    // 3. Cria vínculo
    const { error: errLink } = await this._db
      .from('professional_shop_links')
      .insert({ professional_id: profissionalId, barbershop_id: invite.barbershop_id, is_active: true });

    if (errLink) {
      this._warn('aceitarConvite link', errLink);
      this._throwDbError(errLink, 'aceitarConvite link');
    }

    // 4. Registra acordo financeiro
    const tipo = (invite.message ?? '').startsWith('[Aluguel de Cadeira]')
      ? 'chair_rental'
      : 'percentage';

    const { error: errAgree } = await this._db
      .from('agreements')
      .insert({
        professional_id: profissionalId,
        barbershop_id:   invite.barbershop_id,
        type:            tipo,
        value:           invite.commission_pct,
        is_active:       true,
        valid_from:      new Date().toISOString(),
      });

    if (errAgree) {
      this._warn('aceitarConvite agreement', errAgree);
      this._throwDbError(errAgree, 'aceitarConvite agreement');
    }

    // 5. Marca convite como aceito
    const { error: errUpd } = await this._db
      .from('barbershop_invites')
      .update({ status: 'aceito' })
      .eq('id', inviteId);

    if (errUpd) {
      this._warn('aceitarConvite status', errUpd);
      this._throwDbError(errUpd, 'aceitarConvite status');
    }

    return { aceito: true };
  }

  /**
   * Recusa convite: apenas atualiza status — sem criar vínculo ou acordo.
   * @param {string} profissionalId
   * @param {string} inviteId
   * @returns {Promise<{recusado: true}>}
   */
  async recusarConvite(profissionalId, inviteId) {
    this._uuid('profissionalId', profissionalId);
    this._uuid('inviteId', inviteId);

    // 1. Busca e valida convite
    const { data: invite, error: errGet } = await this._db
      .from('barbershop_invites')
      .select('id, barbeiro_id, status')
      .eq('id', inviteId)
      .eq('barbeiro_id', profissionalId)
      .maybeSingle();

    if (errGet) {
      this._warn('recusarConvite fetch', errGet);
      this._throwDbError(errGet, 'recusarConvite fetch');
    }
    if (!invite) throw AppError.notFound('Convite não encontrado.');
    if (invite.status !== 'pendente') throw AppError.conflict('Convite já respondido.');

    // 2. Marca como recusado
    const { error: errUpd } = await this._db
      .from('barbershop_invites')
      .update({ status: 'recusado' })
      .eq('id', inviteId);

    if (errUpd) {
      this._warn('recusarConvite status', errUpd);
      this._throwDbError(errUpd, 'recusarConvite status');
    }

    return { recusado: true };
  }

  async #montarPerfilPublico(profile, professional) {
    const link = await this.#buscarVinculoAtivo(professional.id);
    const barbershop = link?.barbershop_id ? await this.#buscarBarbeariaAtiva(link.barbershop_id) : null;

    return {
      id: professional.id,
      full_name: profile.full_name,
      avatar_path: professional.avatar_path || profile.avatar_path,
      bio: professional.bio,
      rating_avg: professional.rating_avg,
      rating_count: professional.rating_count,
      birth_date: profile.birth_date,
      gender: profile.gender,
      since_year: professional.since_year,
      barbershop_id: barbershop?.id ?? null,
      barbershop_name: barbershop?.name ?? null,
      barbershop_address: barbershop?.address ?? null,
      barbershop_city: barbershop?.city ?? null,
      barbershop_state: barbershop?.state ?? null,
      barbershop_owner_id: barbershop?.owner_id ?? null,
    };
  }

  async #buscarProfilePublicoSeguro(professionalId) {
    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, avatar_path, birth_date, gender, is_active')
      .eq('id', professionalId)
      .maybeSingle();
    if (!error) return data;
    if (!ProfissionalRepository.#isErroSchemaParcial(error)) {
      this._throwDbError(error, 'buscarPerfilPublico.profile');
    }

    this._warn('buscarPerfilPublico.profile.fallback', error);
    const fallback = await this._db
      .from('profiles')
      .select('id, full_name, avatar_path, is_active')
      .eq('id', professionalId)
      .maybeSingle();
    if (fallback.error) this._throwDbError(fallback.error, 'buscarPerfilPublico.profile.fallback');
    return { ...fallback.data, birth_date: null, gender: null };
  }

  async #buscarProfessionalPublicoSeguro(professionalId) {
    const { data, error } = await this._db
      .from('professionals')
      .select('id, bio, avatar_path, rating_avg, rating_count, since_year, is_active')
      .eq('id', professionalId)
      .maybeSingle();
    if (!error) return data;
    if (!ProfissionalRepository.#isErroSchemaParcial(error)) {
      this._throwDbError(error, 'buscarPerfilPublico.professional');
    }

    this._warn('buscarPerfilPublico.professional.fallback', error);
    const fallback = await this._db
      .from('professionals')
      .select('id, bio, avatar_path, rating_avg, rating_count, is_active')
      .eq('id', professionalId)
      .maybeSingle();
    if (fallback.error) {
      this._warn('buscarPerfilPublico.professional.fallback.final', fallback.error);
      return null;
    }
    return { ...fallback.data, since_year: null };
  }

  async #buscarVinculoAtivo(professionalId) {
    const { data, error } = await this._db
      .from('professional_shop_links')
      .select('barbershop_id, joined_at')
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && !ProfissionalRepository.#isErroSchemaParcial(error)) {
      this._throwDbError(error, 'buscarVinculoAtivo');
    }
    if (error) {
      this._warn('buscarVinculoAtivo.fallback', error);
      const fallback = await this._db
        .from('professional_shop_links')
        .select('barbershop_id')
        .eq('professional_id', professionalId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (fallback.error) {
        this._warn('buscarVinculoAtivo.fallback.final', fallback.error);
        return null;
      }
      return fallback.data;
    }
    return data;
  }

  async #buscarBarbeariaAtiva(barbershopId) {
    const { data, error } = await this._db
      .from('barbershops')
      .select('id, owner_id, name, address, city, state, is_active')
      .eq('id', barbershopId)
      .eq('is_active', true)
      .maybeSingle();
    if (error && !ProfissionalRepository.#isErroSchemaParcial(error)) {
      this._throwDbError(error, 'buscarBarbeariaAtiva');
    }
    if (error) {
      this._warn('buscarBarbeariaAtiva.fallback', error);
      const fallback = await this._db
        .from('barbershops')
        .select('id, owner_id, name, address, city, is_active')
        .eq('id', barbershopId)
        .eq('is_active', true)
        .maybeSingle();
      if (fallback.error) {
        this._warn('buscarBarbeariaAtiva.fallback.final', fallback.error);
        return null;
      }
      return { ...fallback.data, state: null };
    }
    return data;
  }

  async #buscarPortfolioAtivo(imageId) {
    const { data, error } = await this._db
      .from('portfolio_images')
      .select('id, likes_count')
      .eq('id', imageId)
      .eq('status', 'active')
      .maybeSingle();
    if (error) this._throwDbError(error, 'buscarPortfolioAtivo');
    return data;
  }

  static #isErroSchemaParcial(error) {
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? error?.details ?? '');
    return code === '42703'
      || code === '42P01'
      || code === 'PGRST204'
      || code === 'PGRST200'
      || /column .* does not exist/i.test(message)
      || /could not find .* column/i.test(message);
  }
}

module.exports = ProfissionalRepository;
