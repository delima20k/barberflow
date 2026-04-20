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
   * Retorna barbearias favoritas do usuário com dados básicos.
   * @param {string} userId
   * @returns {Promise<object[]>}
   */
  static async getFavorites(userId) {
    const rId = InputValidator.uuid(userId);
    if (!rId.ok) throw new TypeError(`[ProfileRepository] userId: ${rId.msg}`);

    const { data, error } = await SupabaseService.favorites()
      .select('barbershop_id, barbershops(id, name, address, is_open, rating_avg, logo_path)')
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? []).map(r => r.barbershops).filter(Boolean);
  }

  /**
   * Alterna favorito — adiciona se não existir, remove se já existir.
   * Retorna true se adicionado, false se removido.
   * @param {string} userId
   * @param {string} barbershopId
   * @returns {Promise<boolean>}
   */
  static async toggleFavorite(userId, barbershopId) {
    const { data: existing } = await SupabaseService.favorites()
      .select('id')
      .eq('user_id', userId)
      .eq('barbershop_id', barbershopId)
      .maybeSingle();

    if (existing) {
      const { error } = await SupabaseService.favorites()
        .delete()
        .eq('user_id', userId)
        .eq('barbershop_id', barbershopId);
      if (error) throw error;
      return false; // removido
    }

    const { error } = await SupabaseService.favorites()
      .insert({ user_id: userId, barbershop_id: barbershopId });
    if (error) throw error;
    return true; // adicionado
  }
}
