'use strict';

const { performance } = require('node:perf_hooks');

const BaseRepository = require('./BaseRepository');
const AppError       = require('../utils/AppError');
const { logger }     = require('../middlewares/logger');
const { CorrelationContext } = require('../observability/CorrelationContext');

/**
 * BarbeariaRepository — Repositório de barbearias para o BFF.
 *
 * Acessa a tabela `barbershops` do Supabase usando service_role_key.
 * Apenas leitura — sem mutações de dados.
 *
 * Camada: infra
 */
class BarbeariaRepository extends BaseRepository {

  /** Campos completos retornados em consultas quando migration aplicada. */
  static #SELECT =
    'id, name, address, city, state, zip_code, neighborhood, latitude, longitude, ' +
    'logo_path, cover_path, is_open, close_reason, ' +
    'rating_avg, rating_count, rating_score, ' +
    'likes_count, dislikes_count, font_key';

  /** Campos do schema inicial — usados em fallback quando colunas opcionais não existem. */
  static #SELECT_SAFE =
    'id, name, address, city, state, zip_code, neighborhood, latitude, longitude, ' +
    'logo_path, cover_path, is_open, rating_avg, rating_count';

  /** Campos seguros para retorno apos atualizar endereco. */
  static #SELECT_ENDERECO =
    'id, owner_id, name, address, city, state, zip_code, neighborhood, ' +
    'latitude, longitude, logo_path, cover_path, is_open';

  /** Campos minimos para operacoes autenticadas da barbearia do owner. */
  static #SELECT_OWNER = 'id, owner_id, name, logo_path, cover_path, is_active';

  /** Ordem de relevância aplicada em todas as listagens. */
  static #ORDER_PADRAO = Object.freeze(['rating_score', 'rating_avg', 'likes_count']);
  static #ORDER_DESTAQUE_SAFE = Object.freeze(['rating_avg', 'rating_count']);

  static #ordenar(query) {
    return BarbeariaRepository.#ORDER_PADRAO
      .reduce((q, col) => q.order(col, { ascending: false }), query);
  }

  static #ordenarDestaqueSafe(query) {
    return BarbeariaRepository.#ORDER_DESTAQUE_SAFE
      .reduce((q, col) => q.order(col, { ascending: false }), query);
  }

  static #logSupabaseDiagnostic({ endpoint, repositoryMethod, supabaseDurationMs, rowsReturned, limit, hasError }) {
    const diagnostics = CorrelationContext.diagnostics;
    if (!diagnostics?.enabled) return;

    const payload = {
      endpoint: diagnostics.endpoint ?? endpoint,
      repositoryMethod,
      supabaseDurationMs: Number(supabaseDurationMs.toFixed(2)),
      rowsReturned,
      limit,
      hasError,
      timestamp: new Date().toISOString(),
    };

    CorrelationContext.addDiagnosticTiming({
      component: 'supabase',
      repositoryMethod,
      durationMs: payload.supabaseDurationMs,
      rowsReturned,
      limit,
      hasError,
    });

    logger.info(payload, '[BFF] diagnostico supabase barbearias');
  }

  static #isStorageNotFound(error) {
    return (
      error?.status === 404 ||
      error?.statusCode === 404 ||
      String(error?.code ?? '') === '404' ||
      String(error?.message ?? '').toLowerCase().includes('not found')
    );
  }

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   */
  constructor(db) {
    super('BarbeariaRepository', db);
  }

  // ── Consultas ────────────────────────────────────────────────────

  /**
   * Busca barbearias dentro de um raio geográfico.
   * Tenta PostGIS ST_DWithin via RPC (se migration aplicada);
   * em caso de falha por RPC inexistente, usa bounding-box como fallback.
   *
   * @param {number} lat
   * @param {number} lng
   * @param {number} raioKm
   * @param {number} [limit=50]
   * @returns {Promise<object[]>}
   */
  async getNearby(lat, lng, raioKm, limit = 50) {
    this._coordenada(lat, lng);

    const { data, error } = await this._db.rpc('get_barbershops_nearby', {
      lat,
      lng,
      raio_metros: raioKm * 1000,
      limit_val:   limit,
    });

    if (!error) return data ?? [];

    // RPC indisponível (PostGIS ausente, função inexistente ou outro erro de banco).
    // Registra aviso e mantém disponibilidade via fallback bounding-box.
    // O 500 só é lançado se o fallback também falhar (ver #getNearbyFallback).
    this._warn('getNearby → rpc', error);
    return this.#getNearbyFallback(lat, lng, raioKm, limit);
  }

  /**
   * Fallback bounding-box para quando PostGIS não está disponível.
   * Usa #SELECT_SAFE (colunas do schema inicial) para funcionar mesmo sem migrations opcionais.
   */
  async #getNearbyFallback(lat, lng, raioKm, limit) {
    const latD = raioKm / 111.0;
    const lonD = raioKm / (111.0 * Math.cos(lat * Math.PI / 180));

    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .gte('latitude',  lat - latD).lte('latitude',  lat + latD)
      .gte('longitude', lng - lonD).lte('longitude', lng + lonD)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getNearby (fallback)', error);
      this._throwDbError(error, 'getNearby (fallback)');
    }
    return data ?? [];
  }

  /**
   * Retorna barbearias em destaque ordenadas por avaliação.
   * @param {number} [limit=6]
   * @returns {Promise<object[]>}
   */
  async getFeatured(limit = 6) {
    const started = performance.now();
    const { data, error } = await BarbeariaRepository.#ordenarDestaqueSafe(
      this._db
        .from('barbershops')
        .select(BarbeariaRepository.#SELECT_SAFE)
        .eq('is_active', true),
    ).limit(limit);
    BarbeariaRepository.#logSupabaseDiagnostic({
      endpoint: 'GET /api/v1/barbearias/destaque',
      repositoryMethod: 'BarbeariaRepository.getFeatured',
      supabaseDurationMs: performance.now() - started,
      rowsReturned: Array.isArray(data) ? data.length : 0,
      limit,
      hasError: Boolean(error),
    });

    if (!error) return data ?? [];

    this._warn('getFeatured → fallback', error);
    return this.#getFeaturedFallback(limit);
  }

  /**
   * Fallback com colunas do schema inicial — ativo quando colunas opcionais
   * (rating_score, likes_count, dislikes_count, font_key, close_reason)
   * ainda não foram adicionadas ao projeto Supabase.
   */
  async #getFeaturedFallback(limit) {
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getFeatured (fallback)', error);
      this._throwDbError(error, 'getFeatured (fallback)');
    }
    return data ?? [];
  }

  /**
   * Retorna todas as barbearias ativas ordenadas por popularidade.
   * Tenta SELECT completo; se falhar (coluna ausente), usa #SELECT_SAFE.
   * @param {number} [limit=60]
   * @returns {Promise<object[]>}
   */
  async getAll(limit = 60) {
    const started = performance.now();
    const { data, error } = await BarbeariaRepository.#ordenar(
      this._db
        .from('barbershops')
        .select(BarbeariaRepository.#SELECT)
        .eq('is_active', true),
    ).limit(limit);
    BarbeariaRepository.#logSupabaseDiagnostic({
      endpoint: 'GET /api/v1/barbearias/todas',
      repositoryMethod: 'BarbeariaRepository.getAll',
      supabaseDurationMs: performance.now() - started,
      rowsReturned: Array.isArray(data) ? data.length : 0,
      limit,
      hasError: Boolean(error),
    });

    if (!error) return data ?? [];

    this._warn('getAll → fallback', error);
    return this.#getAllFallback(limit);
  }

  /**
   * Fallback com colunas do schema inicial — ativo quando migrations opcionais
   * ainda não foram aplicadas ao projeto Supabase.
   */
  async #getAllFallback(limit) {
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_SAFE)
      .eq('is_active', true)
      .order('rating_avg',   { ascending: false })
      .order('rating_count', { ascending: false })
      .limit(limit);

    if (error) {
      this._warn('getAll (fallback)', error);
      this._throwDbError(error, 'getAll (fallback)');
    }
    return data ?? [];
  }

  /**
   * Atualiza endereco e coordenadas da barbearia pertencente ao usuario autenticado.
   * @param {string} ownerId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async updateEndereco(ownerId, dados, barbershopId) {
    this._uuid('ownerId', ownerId);
    const payload = this._payload(dados, [
      'address',
      'city',
      'state',
      'zip_code',
      'neighborhood',
      'latitude',
      'longitude',
      'updated_at',
    ]);

    const { data, error } = await this._db
      .from('barbershops')
      .update(payload)
      .eq('owner_id', ownerId)
      .eq('id', barbershopId)
      .select(BarbeariaRepository.#SELECT_ENDERECO)
      .maybeSingle();

    if (error) {
      this._warn('updateEndereco', error);
      this._throwDbError(error, 'updateEndereco');
    }
    return data;
  }

  /**
   * Atualiza preço e mensagem do plano mensal da barbearia do owner autenticado.
   * Fallback gracioso: se as colunas ainda não existem no banco remoto
   * (migration 20260530000001 pendente), retorna os valores recebidos sem errar.
   * @param {string} ownerId
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async updateMensalidade(ownerId, dados) {
    this._uuid('ownerId', ownerId);
    const barbershopId = dados?.barbershop_id ?? null;
    if (barbershopId) this._uuid('barbershop_id', barbershopId);
    const payload = this._payload(dados, ['monthly_plan_price', 'monthly_plan_message', 'updated_at']);

    const monthly_plan_price   = dados.monthly_plan_price   ?? null;
    const monthly_plan_message = dados.monthly_plan_message ?? null;

    let query = this._db
      .from('barbershops')
      .update(payload)
      .eq('owner_id', ownerId);
    if (barbershopId) query = query.eq('id', barbershopId);

    // Sem .select()/.single(): PostgREST retorna 204 mesmo para 0 linhas afetadas,
    // eliminando PGRST116 que o .single() lançava e não era capturado pelo fallback.
    const { error } = await query;

    if (error) {
      if (BarbeariaRepository.#ehColunasMensalidadeInexistentes(error)) {
        // Migration pendente — colunas não existem. Faz update seguro só com updated_at
        // para manter o realtime funcionando, e devolve os valores de entrada.
        this._warn('updateMensalidade', 'colunas monthly_plan_* ausentes (migration pendente) — fallback gracioso');
        let safeQuery = this._db
          .from('barbershops')
          .update({ updated_at: new Date().toISOString() })
          .eq('owner_id', ownerId);
        if (barbershopId) safeQuery = safeQuery.eq('id', barbershopId);
        try { await safeQuery; } catch (_) {}
        return { monthly_plan_price, monthly_plan_message };
      }
      this._warn('updateMensalidade', error);
      this._throwDbError(error, 'updateMensalidade');
    }

    return { monthly_plan_price, monthly_plan_message };
  }

  /**
   * Detecta o erro de coluna inexistente para monthly_plan_price / monthly_plan_message.
   * Codigo 42703 = undefined_column no PostgreSQL; PGRST204 = schema cache miss no PostgREST.
   * @param {object} error
   * @returns {boolean}
   */
  static #ehColunasMensalidadeInexistentes(error) {
    if (!error) return false;
    const code = String(error.code ?? '');
    const msg  = [
      error.message,
      error.details,
      error.hint,
    ].filter(Boolean).join(' ').toLowerCase();
    return (
      code === '42703' || code === 'PGRST204' || msg.includes('schema cache')
    ) && (
      msg.includes('monthly_plan') || msg.includes('monthly_plan_price') || msg.includes('monthly_plan_message')
    );
  }

  /**
   * Busca a barbearia ativa pertencente ao owner autenticado.
   * @param {string} ownerId
   * @returns {Promise<object|null>}
   */
  async getAtivaPorOwner(ownerId) {
    this._uuid('ownerId', ownerId);
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_OWNER)
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      this._warn('getAtivaPorOwner', error);
      this._throwDbError(error, 'getAtivaPorOwner');
    }
    return data ?? null;
  }

  /**
   * Busca a barbearia pertencente ao owner autenticado, independente de is_active.
   * Usado para operacoes de gestao do proprio perfil (upload de imagem, etc.).
   * Usa limit(1) para tolerar owners com mais de um registro na tabela.
   * @param {string} ownerId
   * @returns {Promise<object|null>}
   */
  async getPorOwner(ownerId) {
    this._uuid('ownerId', ownerId);
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_OWNER)
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      this._warn('getPorOwner', error);
      this._throwDbError(error, 'getPorOwner');
    }
    return data ?? null;
  }

  async getAtivaPorId(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    const { data, error } = await this._db
      .from('barbershops')
      .select(BarbeariaRepository.#SELECT_OWNER)
      .eq('id', barbershopId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this._warn('getAtivaPorId', error);
      this._throwDbError(error, 'getAtivaPorId');
    }
    return data ?? null;
  }

  /**
   * Dados públicos mínimos para o card de compartilhamento (Open Graph).
   * Usado pela rota pública /b/:id — sem auth. Apenas barbearias ativas.
   * @param {string} id
   * @returns {Promise<{id,name,city,state,logo_path,cover_path}|null>}
   */
  async getPublicShareData(id) {
    this._uuid('id', id);
    const { data, error } = await this._db
      .from('barbershops')
      .select('id, name, city, state, logo_path, cover_path')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this._warn('getPublicShareData', error);
      this._throwDbError(error, 'getPublicShareData');
    }
    return data ?? null;
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
    this._uuid('createdBy', dados.createdBy);

    const { data: conversation, error: conversationError } = await this._db
      .from('chat_conversations')
      .insert({
        type: 'direct',
        created_by: dados.createdBy,
        metadata: dados.metadata ?? null,
      })
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

  async getProfessionalIdsAtivos(barbershopId) {
    this._uuid('barbershopId', barbershopId);
    const { data, error } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);

    if (error) {
      this._warn('getProfessionalIdsAtivos', error);
      this._throwDbError(error, 'getProfessionalIdsAtivos');
    }
    return (data ?? []).map(row => row.professional_id).filter(Boolean);
  }

  async getProfilesByIds(profileIds) {
    const ids = Array.isArray(profileIds) ? [...new Set(profileIds.filter(Boolean))] : [];
    ids.forEach(id => this._uuid('profileIds[]', id));
    if (!ids.length) return [];

    const { data, error } = await this._db
      .from('profiles')
      .select('id, full_name, avatar_path')
      .in('id', ids);

    if (error) {
      this._warn('getProfilesByIds', error);
      this._throwDbError(error, 'getProfilesByIds');
    }
    return data ?? [];
  }

  async listarPortfolioAgregado(barbershopId, professionalIds, { limit, offset }) {
    this._uuid('barbershopId', barbershopId);
    const ids = Array.isArray(professionalIds) ? [...new Set(professionalIds.filter(Boolean))] : [];
    ids.forEach(id => this._uuid('professionalIds[]', id));
    if (!ids.length) return { items: [], total: 0 };

    const from = offset;
    const to = offset + limit - 1;
    const professionalFilter = `and(owner_type.eq.professional,owner_id.in.(${ids.join(',')}))`;
    const legacyFilter = `and(owner_type.eq.barbershop,owner_id.eq.${barbershopId})`;

    const { data, error, count } = await this._db
      .from('portfolio_images')
      .select('id, owner_id, owner_type, title, description, category, storage_path, thumbnail_path, likes_count, views_count, is_featured, updated_at', { count: 'exact' })
      .or(`${professionalFilter},${legacyFilter}`)
      .eq('status', 'active')
      .order('is_featured', { ascending: false })
      .order('likes_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) this._throwDbError(error, 'listarPortfolioAgregado');
    return { items: data ?? [], total: count ?? 0 };
  }

  async listarInteracoesPortfolio(imageIds) {
    const ids = Array.isArray(imageIds) ? [...new Set(imageIds.filter(Boolean))] : [];
    ids.forEach(id => this._uuid('imageIds[]', id));
    if (!ids.length) return new Map();

    const { data: mensagens, error } = await this._db
      .from('portfolio_messages')
      .select('id, portfolio_image_id, sender_id, body, created_at')
      .in('portfolio_image_id', ids)
      .order('created_at', { ascending: true });
    if (error) this._throwDbError(error, 'listarInteracoesPortfolio.mensagens');

    const senderIds = [...new Set((mensagens ?? []).map(msg => msg.sender_id).filter(Boolean))];
    let perfis = [];
    if (senderIds.length) {
      const perfisResult = await this._db
        .from('profiles')
        .select('id, full_name, avatar_path')
        .in('id', senderIds);
      if (perfisResult.error) this._throwDbError(perfisResult.error, 'listarInteracoesPortfolio.profiles');
      perfis = perfisResult.data ?? [];
    }

    const perfilMap = new Map(perfis.map(perfil => [perfil.id, perfil]));
    const grouped = new Map(ids.map(id => [id, []]));
    for (const msg of mensagens ?? []) {
      const perfil = perfilMap.get(msg.sender_id) ?? {};
      grouped.get(msg.portfolio_image_id)?.push({
        id: msg.id,
        body: msg.body ?? '',
        createdAt: msg.created_at ?? null,
        sender: {
          id: msg.sender_id ?? null,
          nome: perfil.full_name ?? 'Usuário',
          avatarUrl: perfil.avatar_path ? BarbeariaRepository.#avatarUrl(perfil.avatar_path) : null,
        },
      });
    }
    return grouped;
  }

  /**
   * Busca barbearia ativa para gestao por profissional vinculado.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<object|null>}
   */
  async getAtivaVinculada(barbershopId, professionalId) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('professionalId', professionalId);

    const temVinculo = await this.profissionalTemVinculoAtivo(barbershopId, professionalId);
    if (!temVinculo) return null;

    const { data, error } = await this._db
      .from('barbershops')
      .select('id, owner_id, name, slug, address, city, state, zip_code, neighborhood, latitude, longitude, logo_path, cover_path, is_open, close_reason, font_key, whatsapp, founded_year, rating_avg, rating_count, rating_score, likes_count, dislikes_count, is_active, updated_at')
      .eq('id', barbershopId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this._warn('getAtivaVinculada', error);
      this._throwDbError(error, 'getAtivaVinculada');
    }

    return data ?? null;
  }

  /**
   * Busca barbeiros elegíveis para convite da barbearia.
   * Exclui: o próprio dono, já vinculados à barbearia, com convite pendente.
   * @param {string} barbershopId
   * @param {string} ownerId
   * @param {string} busca — filtro parcial por full_name ou phone (ILIKE)
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async buscarBarbeirosDisponiveis(barbershopId, ownerId, busca, limit) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('ownerId', ownerId);

    const { data: linked } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);
    const excluidos = new Set((linked ?? []).map(r => r.professional_id));

    const { data: pending } = await this._db
      .from('barbershop_invites')
      .select('barbeiro_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'pendente');
    (pending ?? []).forEach(r => excluidos.add(r.barbeiro_id));

    // Barbeiros que recusaram — aparecem na busca, mas marcados com recusou:true
    const { data: recusados } = await this._db
      .from('barbershop_invites')
      .select('barbeiro_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'recusado');
    const recusadoSet = new Set((recusados ?? []).map(r => r.barbeiro_id));

    excluidos.add(ownerId);

    let query = this._db
      .from('profiles')
      .select('id, full_name, avatar_path, phone, updated_at')
      .eq('role', 'professional')
      // Inclui barbeiros legados (pro_type=null) registrados antes da migração de pro_type
      .or('pro_type.eq.barbeiro,pro_type.is.null')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(limit + excluidos.size + 10);

    if (busca) {
      // Remove vírgulas e parênteses para não quebrar o parser de filtro do PostgREST
      const safe = busca.replace(/[,()]/g, '').trim();
      if (safe) {
        query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }
    }

    const { data, error } = await query;
    if (error) this._throwDbError(error, 'buscarBarbeirosDisponiveis');

    return (data ?? [])
      .filter(p => !excluidos.has(p.id))
      .slice(0, limit)
      .map(p => ({ ...p, recusou: recusadoSet.has(p.id) }));
  }

  /**
   * Envia convites em massa para barbeiros, re-verificando elegibilidade no servidor.
   * @param {string}   barbershopId
   * @param {string[]} professionalIds
   * @param {number}   commissionPct
   * @param {string}   message
   * @returns {Promise<number>} quantidade de convites inseridos
   */
  async enviarConvites(barbershopId, professionalIds, commissionPct, message) {
    this._uuid('barbershopId', barbershopId);

    const { data: linked } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);

    const { data: pending } = await this._db
      .from('barbershop_invites')
      .select('barbeiro_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'pendente');

    const jaExcluidos = new Set([
      ...(linked  ?? []).map(r => r.professional_id),
      ...(pending ?? []).map(r => r.barbeiro_id),
    ]);

    const rows = professionalIds
      .filter(id => !jaExcluidos.has(id))
      .map(id => ({
        barbershop_id:  barbershopId,
        barbeiro_id:    id,
        commission_pct: commissionPct,
        message,
        status:         'pendente',
      }));

    if (!rows.length) {
      throw AppError.conflict('Nenhum barbeiro elegível para convite (já vinculados ou pendentes).');
    }

    const { error } = await this._db.from('barbershop_invites').insert(rows);
    if (error) {
      this._warn('enviarConvites', error);
      this._throwDbError(error, 'enviarConvites');
    }
    return rows.length;
  }

  /**
   * Salva arquivo processado no bucket publico de barbearias.
   * @param {string} path
   * @param {Buffer} buffer
   * @param {string} contentType
   * @returns {Promise<void>}
   */
  async uploadImagemBarbearia(path, buffer, contentType) {
    const { error } = await this._db.storage
      .from('barbershops')
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      this._warn('uploadImagemBarbearia', error);
      this._throwDbError(error, 'uploadImagemBarbearia');
    }
  }

  /**
   * Remove arquivo antigo do bucket publico de barbearias.
   * @param {string} path
   * @returns {Promise<void>}
   */
  async removerImagemBarbearia(path) {
    if (!path) return;

    const { error } = await this._db.storage
      .from('barbershops')
      .remove([path]);

    if (!error || BarbeariaRepository.#isStorageNotFound(error)) return;

    this._warn('removerImagemBarbearia', error);
    this._throwDbError(error, 'removerImagemBarbearia');
  }

  /**
   * Remove variantes antigas de logo/capa, mantendo somente o arquivo atual.
   * @param {string} shopId
   * @param {'logo.webp'|'cover.webp'} arquivoAtual
   * @returns {Promise<void>}
   */
  async removerVariantesImagemBarbearia(shopId, arquivoAtual) {
    this._uuid('shopId', shopId);
    if (!['logo.webp', 'cover.webp'].includes(arquivoAtual)) {
      throw new TypeError('arquivo atual invalido');
    }

    const { data, error } = await this._db.storage
      .from('barbershops')
      .list(shopId);

    if (error) {
      if (BarbeariaRepository.#isStorageNotFound(error)) return;
      this._warn('removerVariantesImagemBarbearia.list', error);
      this._throwDbError(error, 'removerVariantesImagemBarbearia.list');
    }

    const base = arquivoAtual.split('.')[0];
    const remover = (data ?? [])
      .map(item => item?.name)
      .filter(name => new RegExp(`^${base}\\.(?:jpe?g|png|webp)$`, 'i').test(String(name ?? '')))
      .filter(name => name !== arquivoAtual)
      .map(name => `${shopId}/${name}`);

    if (remover.length === 0) return;

    const { error: removeError } = await this._db.storage
      .from('barbershops')
      .remove([...new Set(remover)]);

    if (!removeError || BarbeariaRepository.#isStorageNotFound(removeError)) return;

    this._warn('removerVariantesImagemBarbearia.remove', removeError);
    this._throwDbError(removeError, 'removerVariantesImagemBarbearia.remove');
  }

  /**
   * Atualiza o path de logo/capa da barbearia pelo seu id primario.
   * @param {string} shopId
   * @param {'logo_path'|'cover_path'} campo
   * @param {string} path
   * @param {string} updatedAt
   * @returns {Promise<object>}
   */
  async updateImagem(shopId, campo, path, updatedAt) {
    this._uuid('shopId', shopId);
    if (!['logo_path', 'cover_path'].includes(campo)) {
      throw new TypeError('campo de imagem invalido');
    }

    const { data, error } = await this._db
      .from('barbershops')
      .update({ [campo]: path, updated_at: updatedAt })
      .eq('id', shopId)
      .select(BarbeariaRepository.#SELECT_OWNER)
      .single();

    if (error) {
      this._warn('updateImagem', error);
      this._throwDbError(error, 'updateImagem');
    }
    return data;
  }

  /**
   * Atualiza a imagem ativa da barbearia e limpa o outro campo de imagem.
   * @param {string} shopId
   * @param {'logo_path'|'cover_path'} campo
   * @param {string} path
   * @param {'logo_path'|'cover_path'} campoLimpar
   * @param {string} updatedAt
   * @returns {Promise<object>}
   */
  async updateImagemUnica(shopId, campo, path, campoLimpar, updatedAt) {
    this._uuid('shopId', shopId);
    if (!['logo_path', 'cover_path'].includes(campo) || !['logo_path', 'cover_path'].includes(campoLimpar) || campo === campoLimpar) {
      throw new TypeError('campos de imagem invalidos');
    }

    const { data, error } = await this._db
      .from('barbershops')
      .update({ [campo]: path, [campoLimpar]: null, updated_at: updatedAt })
      .eq('id', shopId)
      .select(BarbeariaRepository.#SELECT_OWNER)
      .single();

    if (error) {
      this._warn('updateImagemUnica', error);
      this._throwDbError(error, 'updateImagemUnica');
    }
    return data;
  }

  /**
   * Monta URL publica do bucket barbershops.
   * @param {string} path
   * @returns {string}
   */
  getBarbershopPublicUrl(path) {
    const baseUrl = String(process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    return `${baseUrl}/storage/v1/object/public/barbershops/${path}`;
  }

  /**
   * Retorna barbeiros aceitos (vínculos ativos) + convites pendentes/recusados.
   * @param {string} barbershopId
   * @returns {Promise<{aceitos: object[], convites: object[]}>}
   */
  async getEquipeComStatus(barbershopId) {
    this._uuid('barbershopId', barbershopId);

    const { data: links, error: errLinks } = await this._db
      .from('professional_shop_links')
      .select('professional_id, joined_at')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);

    if (errLinks) {
      this._warn('getEquipeComStatus links', errLinks);
      this._throwDbError(errLinks, 'getEquipeComStatus links');
    }

    const aceitos = [];
    if (links?.length) {
      const ids = links.map(l => l.professional_id);

      const { data: perfis } = await this._db
        .from('profiles')
        .select('id, full_name, avatar_path')
        .in('id', ids);

      const { data: acordos } = await this._db
        .from('agreements')
        .select('professional_id, type, value')
        .eq('barbershop_id', barbershopId)
        .eq('is_active', true)
        .in('professional_id', ids);

      const perfilMap = Object.fromEntries((perfis ?? []).map(p => [p.id, p]));
      const acordoMap = Object.fromEntries((acordos ?? []).map(a => [a.professional_id, a]));

      for (const link of links) {
        aceitos.push({
          professional_id: link.professional_id,
          joined_at:       link.joined_at,
          profile:         perfilMap[link.professional_id] ?? null,
          agreement:       acordoMap[link.professional_id] ?? null,
        });
      }
    }

    const { data: invites, error: errInv } = await this._db
      .from('barbershop_invites')
      .select('id, barbeiro_id, commission_pct, message, status, created_at')
      .eq('barbershop_id', barbershopId)
      .in('status', ['pendente', 'recusado'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (errInv) {
      this._warn('getEquipeComStatus invites', errInv);
      this._throwDbError(errInv, 'getEquipeComStatus invites');
    }

    const convites = [];
    if (invites?.length) {
      const barIds = [...new Set(invites.map(i => i.barbeiro_id))];
      const { data: barPerfis } = await this._db
        .from('profiles')
        .select('id, full_name, avatar_path')
        .in('id', barIds);

      const barPerfilMap = Object.fromEntries((barPerfis ?? []).map(p => [p.id, p]));
      const ativosIds = new Set(aceitos.map(a => a.professional_id));
      const seen = new Set();
      for (const inv of invites) {
        if (ativosIds.has(inv.barbeiro_id)) continue; // já está em Parceiros Ativos — não duplicar
        if (seen.has(inv.barbeiro_id)) continue;      // mantém só o mais recente (já ordenado por created_at DESC)
        seen.add(inv.barbeiro_id);
        convites.push({ ...inv, profile: barPerfilMap[inv.barbeiro_id] ?? null });
      }
    }

    return { aceitos, convites };
  }

  /**
   * Lista status operacional dos barbeiros vinculados a uma barbearia.
   * Ausência de presença persistida é normalizada como is_available=false.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  async listarStatusBarbeiros(barbershopId) {
    this._uuid('barbershopId', barbershopId);

    const { data: links, error: linksError } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('is_active', true);

    if (linksError) this._throwDbError(linksError, 'listarStatusBarbeiros.links');

    const ids = [...new Set((links || []).map(link => link.professional_id).filter(Boolean))];
    if (!ids.length) return [];

    const [{ data: perfis, error: perfisError }, { data: presencas, error: presencasError }] = await Promise.all([
      this._db
        .from('profiles')
        .select('id, full_name')
        .in('id', ids),
      this._db
        .from('professional_barbershop_presence')
        .select('barbershop_id, professional_id, is_available, updated_at, updated_by')
        .eq('barbershop_id', barbershopId)
        .in('professional_id', ids),
    ]);

    if (perfisError) this._throwDbError(perfisError, 'listarStatusBarbeiros.perfis');
    if (presencasError) this._throwDbError(presencasError, 'listarStatusBarbeiros.presencas');

    const perfilMap = new Map((perfis || []).map(item => [item.id, item]));
    const presencaMap = new Map((presencas || []).map(item => [item.professional_id, item]));

    return ids.map(professionalId => {
      const presenca = presencaMap.get(professionalId) || {};
      const perfil = perfilMap.get(professionalId) || {};
      return {
        barbershop_id: barbershopId,
        professional_id: professionalId,
        professional_name: perfil.full_name || 'Barbeiro',
        is_available: presenca.is_available === true,
        updated_at: presenca.updated_at || null,
        updated_by: presenca.updated_by || null,
      };
    });
  }

  /**
   * Atualiza o status operacional do profissional autenticado na barbearia.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @param {boolean} isAvailable
   * @returns {Promise<object>}
   */
  async atualizarMeuStatusBarbeiro(barbershopId, professionalId, isAvailable) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('professionalId', professionalId);

    const temVinculo = await this.profissionalTemVinculoAtivo(barbershopId, professionalId);
    if (!temVinculo) throw AppError.forbidden('Profissional sem vinculo ativo com a barbearia.');

    const payload = {
      barbershop_id: barbershopId,
      professional_id: professionalId,
      is_available: isAvailable === true,
      updated_at: new Date().toISOString(),
      updated_by: professionalId,
    };

    const { data, error } = await this._db
      .from('professional_barbershop_presence')
      .upsert(payload, { onConflict: 'barbershop_id,professional_id' })
      .select('barbershop_id, professional_id, is_available, updated_at, updated_by')
      .single();

    if (error) this._throwDbError(error, 'atualizarMeuStatusBarbeiro');
    return data;
  }

  /**
   * Dispensa barbeiro: desativa vínculo e acordo.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<{dispensado: true}>}
   */
  async dispensarBarbeiro(barbershopId, professionalId) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('professionalId', professionalId);

    const { error: errLink } = await this._db
      .from('professional_shop_links')
      .update({ is_active: false })
      .eq('barbershop_id', barbershopId)
      .eq('professional_id', professionalId)
      .eq('is_active', true);

    if (errLink) {
      this._warn('dispensarBarbeiro link', errLink);
      this._throwDbError(errLink, 'dispensarBarbeiro link');
    }

    const { error: errAgree } = await this._db
      .from('agreements')
      .update({ is_active: false, valid_until: new Date().toISOString() })
      .eq('barbershop_id', barbershopId)
      .eq('professional_id', professionalId)
      .eq('is_active', true);

    if (errAgree) {
      this._warn('dispensarBarbeiro agreement', errAgree);
      this._throwDbError(errAgree, 'dispensarBarbeiro agreement');
    }

    return { dispensado: true };
  }

  /**
   * Cancela convite pendente (DELETE da linha).
   * @param {string} barbershopId
   * @param {string} inviteId
   * @returns {Promise<{cancelado: true}>}
   */
  async cancelarConvite(barbershopId, inviteId) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('inviteId', inviteId);

    const { data: inv, error: errGet } = await this._db
      .from('barbershop_invites')
      .select('id, status')
      .eq('id', inviteId)
      .eq('barbershop_id', barbershopId)
      .maybeSingle();

    if (errGet) {
      this._warn('cancelarConvite fetch', errGet);
      this._throwDbError(errGet, 'cancelarConvite fetch');
    }
    if (!inv) throw AppError.notFound('Convite não encontrado.');
    if (inv.status !== 'pendente') throw AppError.conflict('Só convites pendentes podem ser cancelados.');

    const { error: errDel } = await this._db
      .from('barbershop_invites')
      .delete()
      .eq('id', inviteId)
      .eq('barbershop_id', barbershopId);

    if (errDel) {
      this._warn('cancelarConvite delete', errDel);
      this._throwDbError(errDel, 'cancelarConvite delete');
    }

    return { cancelado: true };
  }

  /**
   * Verifica se o profissional possui vinculo ativo com a barbearia.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<boolean>}
   */
  async profissionalTemVinculoAtivo(barbershopId, professionalId) {
    this._uuid('barbershopId', barbershopId);
    this._uuid('professionalId', professionalId);

    const { data, error } = await this._db
      .from('professional_shop_links')
      .select('professional_id')
      .eq('barbershop_id', barbershopId)
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      this._warn('profissionalTemVinculoAtivo', error);
      this._throwDbError(error, 'profissionalTemVinculoAtivo');
    }

    return Boolean(data?.professional_id);
  }

  /**
   * Conta stories ainda ativos (não expirados) do profissional na barbearia.
   * Janela de 24h por vídeo: a cota só libera quando o vídeo expira/é excluído.
   * @param {string} ownerId
   * @param {string} barbershopId
   * @returns {Promise<number>}
   */
  async contarStoriesAtivos(ownerId, barbershopId) {
    this._uuid('ownerId', ownerId);
    this._uuid('barbershopId', barbershopId);

    const agora = new Date().toISOString();

    const { count, error } = await this._db
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId)
      .eq('barbershop_id', barbershopId)
      .gt('expires_at', agora);

    if (error) {
      this._warn('contarStoriesAtivos', error);
      this._throwDbError(error, 'contarStoriesAtivos');
    }

    return count ?? 0;
  }

  /**
   * Salva metadados de story. Midia fica no storage.
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async salvarStory(payload) {
    const { data, error } = await this._db
      .from('stories')
      .insert(payload)
      .select('id, owner_id, barbershop_id, storage_path, thumbnail_path, media_type, expires_at, created_at, media_id')
      .single();

    if (error) {
      this._warn('salvarStory', error);
      this._throwDbError(error, 'salvarStory');
    }

    return data;
  }

  /**
   * Lista stories ativos de uma barbearia com path do media_files para URL assinada.
   * @param {string} barbershopId
   * @returns {Promise<Array>}
   */
  async listarStoriesAtivos(barbershopId, viewerId = null) {
    this._uuid('barbershopId', barbershopId);
    const agora = new Date().toISOString();
    const { data, error } = await this._db
      .from('stories')
      .select('id, owner_id, barbershop_id, storage_path, thumbnail_path, media_type, views_count, created_at, expires_at, media_id, media_files!stories_media_id_fkey(path, public_url, status, media_variants(name, storage_path))')
      .eq('barbershop_id', barbershopId)
      .gt('expires_at', agora)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      logger.error(
        { code: error.code, message: error.message, details: error.details, hint: error.hint, correlationId: CorrelationContext.correlationId, op: 'listarStoriesAtivos' },
        '[BarbeariaRepository] listarStoriesAtivos: query com join media_files falhou; tentando fallback sem join',
      );
      return this.#listarStoriesAtivosSemMediaJoin(barbershopId, agora, viewerId);
    }

    return this.#enriquecerStories(data ?? [], viewerId);
  }

  async #listarStoriesAtivosSemMediaJoin(barbershopId, agora, viewerId) {
    const { data, error } = await this._db
      .from('stories')
      .select('id, owner_id, barbershop_id, storage_path, thumbnail_path, media_type, views_count, created_at, expires_at, media_id')
      .eq('barbershop_id', barbershopId)
      .gt('expires_at', agora)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) this._throwDbError(error, 'listarStoriesAtivos:fallback');
    return this.#enriquecerStories(data ?? [], viewerId);
  }

  async #enriquecerStories(stories, viewerId = null, knownShopMap = null) {
    if (!stories.length) return [];

    const shopIds = knownShopMap
      ? []
      : [...new Set(stories.map(s => s.barbershop_id).filter(Boolean))];
    const ownerIds = [...new Set(stories.map(s => s.owner_id).filter(Boolean))];
    const storyIds = stories.map(s => s.id).filter(Boolean);

    const { data: shops, error: shopsError } = shopIds.length
      ? await this._db.from('barbershops').select('id, name, logo_path, owner_id').in('id', shopIds)
      : { data: [], error: null };
    if (shopsError) this._warn('enriquecerStories:shops', shopsError);

    const { data: posters, error: postersError } = ownerIds.length
      ? await this._db.from('profiles').select('id, full_name, avatar_path').in('id', ownerIds)
      : { data: [], error: null };
    if (postersError) this._warn('enriquecerStories:posters', postersError);

    const likedSet = viewerId ? await this.#likedStorySet(viewerId, storyIds) : new Set();
    const shopMap = knownShopMap ?? new Map((shops ?? []).map(shop => [shop.id, shop]));
    const posterMap = new Map((posters ?? []).map(profile => [profile.id, profile]));

    return stories.map(story => {
      const shop = shopMap.get(story.barbershop_id) ?? null;
      const poster = posterMap.get(story.owner_id) ?? null;
      const tipoAutor = shop?.owner_id && story.owner_id === shop.owner_id ? 'barbearia' : 'parceiro';
      return {
        ...story,
        likes_count: Math.max(0, Number(story.likes_count ?? 0)),
        user_liked: likedSet.has(story.id),
        can_delete: Boolean(viewerId && story.owner_id === viewerId),
        tipo_autor: tipoAutor,
        shop_name: shop?.name ?? null,
        shop_logo_path: shop?.logo_path ?? null,
        shop_owner_id: shop?.owner_id ?? null,
        poster_name: poster?.full_name ?? null,
        poster_avatar_path: poster?.avatar_path ?? null,
        thumb_storage_path: story.media_files?.media_variants?.find(v => v.name === 'thumb')?.storage_path ?? null,
        video_storage_path: story.media_files?.media_variants?.find(v => v.name === 'video_480p')?.storage_path ?? null,
        processing_status: story.media_files?.status ?? null,
      };
    });
  }

  async #likedStorySet(userId, storyIds) {
    if (!userId || !storyIds.length) return new Set();
    const { data, error } = await this._db
      .from('likes')
      .select('content_id')
      .eq('user_id', userId)
      .eq('content_type', 'story')
      .in('content_id', storyIds);
    if (error) {
      this._warn('likedStorySet', error);
      return new Set();
    }
    return new Set((data ?? []).map(row => row.content_id));
  }

  /**
   * Verifica se um media_files pertence ao owner e está no contexto correto.
   * Impede que media_id de outros usuários sejam associados a stories.
   * @param {string} mediaId
   * @param {string} ownerId
   * @param {string} contexto
   * @returns {Promise<boolean>}
   */
  async existeMediaPorIdEOwner(mediaId, ownerId, contexto) {
    this._uuid('mediaId', mediaId);
    this._uuid('ownerId', ownerId);
    const { count, error } = await this._db
      .from('media_files')
      .select('id', { count: 'exact', head: true })
      .eq('id', mediaId)
      .eq('owner_id', ownerId)
      .eq('contexto', contexto)
      .neq('status', 'reserved');

    if (error) {
      this._warn('existeMediaPorIdEOwner', error);
      this._throwDbError(error, 'existeMediaPorIdEOwner');
    }

    return (count ?? 0) > 0;
  }

  static #avatarUrl(avatarPath) {
    const base = process.env.SUPABASE_URL ?? '';
    if (!base || !avatarPath) return null;
    return `${base}/storage/v1/object/public/avatars/${avatarPath}`;
  }

  /**
   * Retorna stories ativos agrupados por barbearia, ordenados pelo mais recente.
   * Usado no feed da home — traz somente barbearias que postaram stories.
   *
   * Query em 2 passos (sem JOIN cross-table complexo):
   *   1. stories (com media_files join) — filtra expires_at, ordena desc
   *   2. barbershops — 1 query .in() para os IDs únicos detectados
   *
   * Complexidade: O(N) linhas de stories + 1 query de barbershops.
   * Não usa N+1 por barbearia.
   *
   * @param {number} [maxShops=8] — número máximo de barbearias no feed
   * @returns {Promise<Array<{shop: object, stories: object[]}>>}
   */
  async #queryFeedStories(limite, agora) {
    const { data, error } = await this._db
      .from('stories')
      .select(
        'id, owner_id, barbershop_id, storage_path, thumbnail_path, media_type, ' +
        'views_count, created_at, expires_at, media_id, ' +
        'media_files!stories_media_id_fkey(path, public_url, status, media_variants(name, storage_path))',
      )
      .gt('expires_at', agora)
      .order('created_at', { ascending: false })
      .limit(limite);

    if (!error) return data ?? [];

    logger.error(
      { code: error.code, message: error.message, details: error.details, hint: error.hint, correlationId: CorrelationContext.correlationId, op: 'listarFeedStoriesAgrupados' },
      '[BarbeariaRepository] listarFeedStoriesAgrupados: query com join media_files falhou; tentando fallback sem join',
    );

    const { data: fallback, error: fallbackError } = await this._db
      .from('stories')
      .select('id, owner_id, barbershop_id, storage_path, thumbnail_path, media_type, views_count, created_at, expires_at, media_id')
      .gt('expires_at', agora)
      .order('created_at', { ascending: false })
      .limit(limite);

    if (fallbackError) this._throwDbError(fallbackError, 'listarFeedStoriesAgrupados:fallback');
    return fallback ?? [];
  }

  async listarFeedStoriesAgrupados(maxShops = 8, viewerId = null) {
    const agora = new Date().toISOString();

    // Traz stories suficientes para cobrir maxShops barbearias
    // (margem * 10 cobre o caso de 1 barbearia dominar os primeiros resultados)
    const limite = maxShops * 10 + 10;

    const stories = await this.#queryFeedStories(limite, agora);

    if (!stories?.length) return [];

    // Identifica barbershop_ids únicos preservando a ordem do story mais recente
    const seenIds = new Set();
    const barbershopIds = [];
    for (const s of stories) {
      if (s.barbershop_id && !seenIds.has(s.barbershop_id)) {
        seenIds.add(s.barbershop_id);
        barbershopIds.push(s.barbershop_id);
        if (barbershopIds.length >= maxShops) break;
      }
    }

    if (!barbershopIds.length) return [];

    // 1 query para buscar nome e logo de todas as barbearias detectadas
    // Filtra apenas barbearias ativas: evita cards de barbearias inativas (ex: parceiros
    // com barbearia auto-criada mas desativada que postaram stories com barbershop_id errado)
    const { data: shops, error: shopsError } = await this._db
      .from('barbershops')
      .select('id, name, logo_path, owner_id')
      .eq('is_active', true)
      .in('id', barbershopIds);

    if (shopsError) this._warn('listarFeedStoriesAgrupados:shops', shopsError);

    const shopMap = new Map((shops ?? []).map(s => [s.id, s]));

    // Agrupa stories apenas de barbearias ATIVAS (que estão no shopMap)
    // Barbearias inativas (ex: auto-criadas para parceiros) são ignoradas
    const grouped = new Map();
    for (const story of stories) {
      if (!shopMap.has(story.barbershop_id)) continue;
      const arr = grouped.get(story.barbershop_id) ?? [];
      if (arr.length < 10) {
        arr.push(story);
        grouped.set(story.barbershop_id, arr);
      }
    }

    const enriched = await this.#enriquecerStories([...grouped.values()].flat(), viewerId, shopMap);
    const enrichedByShop = new Map();
    for (const story of enriched) {
      const arr = enrichedByShop.get(story.barbershop_id) ?? [];
      arr.push(story);
      enrichedByShop.set(story.barbershop_id, arr);
    }

    return barbershopIds
      .filter(id => shopMap.has(id) && (enrichedByShop.get(id) ?? []).length > 0)
      .map(id => ({
        shop: shopMap.get(id),
        stories: (enrichedByShop.get(id) ?? []).sort(BarbeariaRepository.#storyHighlightSort),
      }));
  }

  static #storyHighlightSort(a, b) {
    const likesDiff = Number(b.likes_count ?? 0) - Number(a.likes_count ?? 0);
    if (likesDiff !== 0) return likesDiff;
    return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
  }

  // ── Cleanup R2 — Stories ─────────────────────────────────────

  /**
   * Retorna stories expirados com paths necessários para limpeza.
   * Usa margem de segurança (margemMinutos) para evitar conflito com operações em andamento.
   * @param {number} batchSize
   * @param {number} [margemMinutos=5]
   * @param {boolean} [somenteSemMediaId=false] — true: legados (media_id IS NULL)
   * @returns {Promise<{id: string, media_id: string|null, storage_path: string, media_files: object|null}[]>}
   */
  async listarStoriesExpirados(batchSize, margemMinutos = 5, somenteSemMediaId = false) {
    const limite = new Date(Date.now() - margemMinutos * 60 * 1000).toISOString();
    let query = this._db.from('stories')
      .select('id, media_id, storage_path, media_files!stories_media_id_fkey(id, path)')
      .lt('expires_at', limite)
      .limit(batchSize);
    if (somenteSemMediaId) {
      query = query.is('media_id', null);
    } else {
      query = query.not('media_id', 'is', null);
    }
    const { data, error } = await query;
    if (error) {
      this._warn('listarStoriesExpirados', error);
      this._throwDbError(error, 'listarStoriesExpirados');
    }
    return data ?? [];
  }

  /**
   * Bulk delete de story rows após limpeza concluída.
   * @param {string[]} ids
   */
  async excluirStoriesPorIds(ids) {
    if (!ids || ids.length === 0) return;
    const { error } = await this._db.from('stories').delete().in('id', ids);
    if (error) {
      this._warn('excluirStoriesPorIds', error);
      this._throwDbError(error, 'excluirStoriesPorIds');
    }
  }

  /**
   * Busca um story validando owner + barbershop para autorização de exclusão manual.
   * @param {string} storyId
   * @param {string} ownerId
   * @param {string} barbershopId
   * @returns {Promise<object|null>}
   */
  async buscarStoryPorIdEOwner(storyId, ownerId, barbershopId) {
    const { data, error } = await this._db.from('stories')
      .select('id, media_id, storage_path, media_files!stories_media_id_fkey(id, path)')
      .eq('id', storyId)
      .eq('owner_id', ownerId)
      .eq('barbershop_id', barbershopId)
      .single();
    if (error?.code === 'PGRST116') return null;
    if (error) {
      this._warn('buscarStoryPorIdEOwner', error);
      this._throwDbError(error, 'buscarStoryPorIdEOwner');
    }
    return data ?? null;
  }

  async buscarStoryPorMediaIdEOwner(mediaId, ownerId) {
    const { data, error } = await this._db.from('stories')
      .select('id, media_id, owner_id, barbershop_id, storage_path, media_files!stories_media_id_fkey(id, path)')
      .eq('media_id', mediaId)
      .eq('owner_id', ownerId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      this._warn('buscarStoryPorMediaIdEOwner', error);
      this._throwDbError(error, 'buscarStoryPorMediaIdEOwner');
    }
    return data ?? null;
  }

  async buscarStoryAtivoPorMediaId(mediaId) {
    const { data, error } = await this._db.from('stories')
      .select('id, media_id, likes_count')
      .eq('media_id', mediaId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      this._warn('buscarStoryAtivoPorMediaId', error);
      this._throwDbError(error, 'buscarStoryAtivoPorMediaId');
    }
    return data ?? null;
  }

  async buscarLikeStory(userId, storyId) {
    const { data, error } = await this._db.from('likes')
      .select('id')
      .eq('user_id', userId)
      .eq('content_type', 'story')
      .eq('content_id', storyId)
      .maybeSingle();
    if (error) {
      this._warn('buscarLikeStory', error);
      this._throwDbError(error, 'buscarLikeStory');
    }
    return data ?? null;
  }

  async adicionarLikeStory(userId, storyId) {
    const { error } = await this._db.from('likes').insert({
      user_id: userId,
      content_id: storyId,
      content_type: 'story',
    });
    if (error && error.code !== '23505') {
      this._warn('adicionarLikeStory', error);
      this._throwDbError(error, 'adicionarLikeStory');
    }
  }

  async removerLikeStory(userId, storyId) {
    const { error } = await this._db.from('likes')
      .delete()
      .eq('user_id', userId)
      .eq('content_type', 'story')
      .eq('content_id', storyId);
    if (error) {
      this._warn('removerLikeStory', error);
      this._throwDbError(error, 'removerLikeStory');
    }
  }

  async sincronizarLikesStory(storyId) {
    const { count, error } = await this._db.from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('content_type', 'story')
      .eq('content_id', storyId);
    if (error) {
      this._warn('sincronizarLikesStory:count', error);
      this._throwDbError(error, 'sincronizarLikesStory:count');
    }

    const likesCount = count ?? 0;
    const { error: updateError } = await this._db.from('stories')
      .update({ likes_count: likesCount })
      .eq('id', storyId);
    if (updateError) {
      this._warn('sincronizarLikesStory:update', updateError);
      this._throwDbError(updateError, 'sincronizarLikesStory:update');
    }

    return likesCount;
  }

  /**
   * Deleta um único story por id (após limpeza do storage).
   * @param {string} storyId
   */
  async excluirStoryPorId(storyId) {
    const { error } = await this._db.from('stories').delete().eq('id', storyId);
    if (error) {
      this._warn('excluirStoryPorId', error);
      this._throwDbError(error, 'excluirStoryPorId');
    }
  }

  /**
   * Conta outros stories que referenciam o mesmo media_id.
   * Impede hard-delete de media_files quando há compartilhamento.
   * @param {string} mediaId
   * @param {string} excluindoStoryId — story que está sendo excluído (ignorar na contagem)
   * @returns {Promise<number>}
   */
  async contarOutrasReferencias(mediaId, excluindoStoryId) {
    const { count, error } = await this._db.from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('media_id', mediaId)
      .neq('id', excluindoStoryId);
    if (error) {
      this._warn('contarOutrasReferencias', error);
      this._throwDbError(error, 'contarOutrasReferencias');
    }
    return count ?? 0;
  }
}

module.exports = BarbeariaRepository;
