'use strict';

// =============================================================
// ProfileRepository.js — Repositório de perfis de usuários e favoritos.
// Abstrai todas as queries Supabase das tabelas profiles e favorites.
// Nenhuma lógica de negócio — apenas acesso e persistência de dados.
//
// Dependências: SupabaseService.js
// =============================================================

// Repositório responsável por perfis, favoritos e upload de avatar.
class ProfileRepository {

  // Flag: tabelas opcionais ainda não criadas no banco remoto
  // Marcado como true após primeiro 404, evita spam de queries 404
  static #PRO_LIKES_UNAVAILABLE = false;
  static #FAV_PROS_UNAVAILABLE  = false;

  /** Detecta se o erro é um 404 de tabela inexistente no PostgREST */
  static #is404(error) {
    return (
      error?.status === 404 ||
      error?.statusCode === 404 ||
      String(error?.code ?? '').includes('42P01') ||
      String(error?.message ?? '').toLowerCase().includes('does not exist')
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PERFIL
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca perfil completo por ID de usuário.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  static async getById(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ProfileRepository] userId: ${rId.msg}`);

    const { data, error } = await SupabaseService.profiles()
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza dados do perfil aplicando allowlist de campos.
   * Previne mass assignment (ex: role, plan_type não são alteraáveis pelo usuário).
   * @param {string} userId
   * @param {object} dados — campos a atualizar
   */
  static async update(userId, dados) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ProfileRepository] userId: ${rId.msg}`);

    // Allowlist: apenas campos que o próprio usuário pode alterar
    const camposPermitidos = [
      'full_name', 'phone', 'bio', 'birth_date', 'gender',
      'address', 'zip_code', 'city', 'avatar_path',
    ];
    const { ok, msg, valor: dadosFiltrados } = InputValidator.payload(dados, camposPermitidos);
    if (!ok) throw new TypeError(`[ProfileRepository] ${msg}`);

    // Sanitiza campos de texto livre: remove null-bytes e verifica comprimento
    if ('bio' in dadosFiltrados) {
      const r = InputValidator.textoLivre(dadosFiltrados.bio, 300);
      if (!r.ok) throw new TypeError(`[ProfileRepository] bio: ${r.msg}`);
      dadosFiltrados.bio = r.valor;
    }
    if ('address' in dadosFiltrados) {
      const r = InputValidator.textoLivre(dadosFiltrados.address, 200);
      if (!r.ok) throw new TypeError(`[ProfileRepository] address: ${r.msg}`);
      dadosFiltrados.address = r.valor;
    }

    const { error } = await SupabaseService.profiles()
      .update({ ...dadosFiltrados, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════════════
  // AVATAR
  // ═══════════════════════════════════════════════════════════

  /**
   * Faz upload de avatar no Storage e atualiza o perfil.
   * Retorna a URL pública com cache-bust.
   * @param {string} userId
   * @param {File|Blob} file — arquivo comprimido pelo chamador
   * @returns {Promise<string>} URL pública
   */
  static async updateAvatar(userId, file) {
    const ext  = file.name
      ? file.name.split('.').pop().toLowerCase().replace('jpg', 'jpeg')
      : 'jpeg';
    const path = `${userId}/avatar.${ext}`;

    const { error: upErr } = await SupabaseService.storageAvatars()
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (upErr) throw upErr;

    await ProfileRepository.update(userId, { avatar_path: path });

    const publicUrl = SupabaseService.getAvatarUrl(path);
    return publicUrl + '?t=' + Date.now();
  }

  // ═══════════════════════════════════════════════════════════
  // FAVORITOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna barbearias favoritas do usuário.
   * Lê de barbershop_interactions onde type='favorite'.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  static async getFavorites(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ProfileRepository] userId: ${rId.msg}`);

    // Etapa 1: buscar IDs das barbearias favoritas do usuário
    const { data: ints, error: e1 } = await SupabaseService.barbershopInteractions()
      .select('barbershop_id')
      .eq('user_id', userId)
      .eq('type', 'favorite');

    if (e1) throw e1;

    const ids = (ints ?? []).map(r => r.barbershop_id).filter(Boolean);
    if (!ids.length) return [];

    // Etapa 2: buscar dados reais das barbearias
    const { data, error: e2 } = await SupabaseService.barbershops()
      .select('id, name, address, is_open, rating_avg, logo_path')
      .in('id', ids);

    if (e2) throw e2;
    return data ?? [];
  }

  /**
   * Alterna favorito de barbearia — delega para BarbershopRepository.
   * Retorna true se adicionado, false se removido.
   * @param {string} userId
   * @param {string} barbershopId
   * @returns {Promise<boolean>}
   */
  static async toggleFavorite(userId, barbershopId) {
    const { data: existing } = await SupabaseService.barbershopInteractions()
      .select('id')
      .eq('user_id', userId)
      .eq('barbershop_id', barbershopId)
      .eq('type', 'favorite')
      .maybeSingle();

    if (existing) {
      await BarbershopRepository.removeInteraction(barbershopId, userId, 'favorite');
      return false;
    }
    await BarbershopRepository.addInteraction(barbershopId, userId, 'favorite');
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // BARBEIROS FAVORITOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna barbeiros favoritos do usuário com dados básicos.
   * Usa 2 queries separadas (IDs → dados) em vez de embed do PostgREST,
   * para evitar 400 quando o cache de schema não reconhece a FK.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  static async getFavoriteBarbers(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ProfileRepository] userId: ${rId.msg}`);

    if (ProfileRepository.#FAV_PROS_UNAVAILABLE) return [];

    // 1. IDs dos barbeiros favoritos
    const { data: favs, error: e1 } = await SupabaseService.favoriteProfessionals()
      .select('professional_id')
      .eq('user_id', userId);

    if (e1) {
      if (ProfileRepository.#is404(e1)) { ProfileRepository.#FAV_PROS_UNAVAILABLE = true; return []; }
      throw e1;
    }
    const ids = (favs ?? []).map(r => r.professional_id).filter(Boolean);
    if (!ids.length) return [];

    // 2. Dados dos profissionais (professionals.id === profiles.id — FK/PK compartilhado)
    const { data: pros, error: e2 } = await SupabaseService.professionals()
      .select('id, avatar_path, rating_avg, specialties')
      .in('id', ids);

    if (e2) throw e2;
    if (!pros?.length) return [];

    // 3. Perfis (nome + avatar_path) — mesmo id usado em professionals
    const { data: profs } = await SupabaseService.profilesPublic()
      .select('id, full_name, avatar_path')
      .in('id', ids);
    const profilesMap = {};
    (profs ?? []).forEach(pr => { profilesMap[pr.id] = pr; });

    return pros.map(p => ({
      ...p,
      profiles: profilesMap[p.id] ?? null,
    }));
  }

  /**
   * Alterna barbeiro favorito.
   * Estratégia à prova de race conditions:
   *  - DELETE-first → retorna linhas afetadas
   *  - Se 0 linhas afetadas → INSERT; se der 23505 (duplicate) considera sucesso
   * @returns {Promise<boolean>} true se adicionado, false se removido
   */
  static async toggleFavoriteBarber(userId, professionalId) {
    // 1. Tenta DELETE com .select() para saber quantas linhas foram afetadas
    const { data: deleted, error: delErr } = await SupabaseService.favoriteProfessionals()
      .delete()
      .eq('user_id', userId)
      .eq('professional_id', professionalId)
      .select();

    if (delErr) throw delErr;
    if (Array.isArray(deleted) && deleted.length > 0) return false;

    // 2. Não existia (ou estava invisível ao usuário) — tenta INSERT
    const { error: insErr } = await SupabaseService.favoriteProfessionals()
      .insert({ user_id: userId, professional_id: professionalId });

    if (insErr) {
      // 23505 = duplicate_key | 409 status | mensagens de duplicata
      // Qualquer uma dessas situações significa "já está favoritado" — trata como sucesso.
      const code    = String(insErr.code    ?? '');
      const status  = Number(insErr.status  ?? 0);
      const message = String(insErr.message ?? '').toLowerCase();
      const isDup   = code === '23505'
                   || status === 409
                   || message.includes('duplicate')
                   || message.includes('conflict')
                   || message.includes('already exists');
      if (!isDup) throw insErr;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // CURTIDAS EM BARBEIROS
  // ═══════════════════════════════════════════════════════════

  /**
   * Alterna curtida em um barbeiro.
   * @returns {Promise<boolean>} true=curtido, false=descurtido
   */
  static async toggleProfessionalLike(userId, professionalId) {
    if (ProfileRepository.#PRO_LIKES_UNAVAILABLE) throw new Error('Tabela professional_likes indisponível. Aplique as migrations pendentes.');

    const { data: existing, error: selErr } = await SupabaseService.professionalLikes()
      .select('id')
      .eq('user_id', userId)
      .eq('professional_id', professionalId)
      .maybeSingle();

    if (selErr) {
      if (ProfileRepository.#is404(selErr)) { ProfileRepository.#PRO_LIKES_UNAVAILABLE = true; }
      throw selErr;
    }

    if (existing) {
      const { error } = await SupabaseService.professionalLikes()
        .delete()
        .eq('user_id', userId)
        .eq('professional_id', professionalId);
      if (error) throw error;
      return false;
    }

    const { error } = await SupabaseService.professionalLikes()
      .insert({ user_id: userId, professional_id: professionalId });
    if (error) throw error;
    return true;
  }

  /**
   * Retorna IDs de barbeiros curtidos pelo usuário.
   * Retorna Set vazio silenciosamente se a tabela não existir no banco.
   * @returns {Promise<Set<string>>}
   */
  static async getUserProfessionalLikes(userId) {
    if (ProfileRepository.#PRO_LIKES_UNAVAILABLE) return new Set();
    const { data, error } = await SupabaseService.professionalLikes()
      .select('professional_id')
      .eq('user_id', userId);
    if (error) {
      if (ProfileRepository.#is404(error)) { ProfileRepository.#PRO_LIKES_UNAVAILABLE = true; return new Set(); }
      throw error;
    }
    return new Set((data ?? []).map(r => r.professional_id));
  }

  /**
   * Retorna IDs de barbeiros favoritados pelo usuário.
   * Retorna Set vazio silenciosamente se a tabela não existir no banco.
   * @returns {Promise<Set<string>>}
   */
  static async getUserProfessionalFavs(userId) {
    if (ProfileRepository.#FAV_PROS_UNAVAILABLE) return new Set();
    const { data, error } = await SupabaseService.favoriteProfessionals()
      .select('professional_id')
      .eq('user_id', userId);
    if (error) {
      if (ProfileRepository.#is404(error)) { ProfileRepository.#FAV_PROS_UNAVAILABLE = true; return new Set(); }
      throw error;
    }
    return new Set((data ?? []).map(r => r.professional_id));
  }

  /**
   * Retorna o rating_count real de um profissional após persistência.
   * Usado para re-sincronizar a UI com o total de curtidas do banco
   * (inclui curtidas de TODOS os usuários).
   * @param {string} professionalId
   * @returns {Promise<number>}
   */
  static async getProfessionalLikeCount(professionalId) {
    const { data, error } = await SupabaseService.professionals()
      .select('rating_count')
      .eq('id', professionalId)
      .maybeSingle();
    if (error) throw error;
    return data?.rating_count ?? 0;
  }

  /**
   * Conta curtidas por profissional diretamente de professional_likes.
   * Não depende de trigger que mantém rating_count em professionals.
   * Usado para restaurar contadores na recarga sem depender do trigger.
   * @param {string[]} professionalIds
   * @returns {Promise<Record<string, number>>} mapa id → contagem
   */
  static async getProfessionalLikeCountsDirect(professionalIds) {
    if (!professionalIds?.length) return {};
    if (ProfileRepository.#PRO_LIKES_UNAVAILABLE) return {};
    const { data, error } = await SupabaseService.professionalLikes()
      .select('professional_id')
      .in('professional_id', professionalIds);
    if (error) {
      if (ProfileRepository.#is404(error)) { ProfileRepository.#PRO_LIKES_UNAVAILABLE = true; }
      return {};
    }
    const counts = {};
    (data ?? []).forEach(({ professional_id }) => {
      counts[professional_id] = (counts[professional_id] ?? 0) + 1;
    });
    return counts;
  }
}
