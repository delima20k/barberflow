'use strict';

// =============================================================
// UserRepository.js — Acesso a dados de usuários via Supabase
// Camada: infra
//
// Responsabilidade ÚNICA: busca de usuários e favoritos direto
// no Supabase via ApiService.rpc() / ApiService.from().
// Substitui as chamadas a /api/users/* do BackendApiService.
//
// Dependências: ApiService.js, InputValidator.js
//
// Uso:
//   const { data, total, error } =
//     await UserRepository.buscarUsuarios('alan', { limit: 20, offset: 0 });
//
//   const { data, error } =
//     await UserRepository.getFavoritosModal(barbershopId, professionalId);
// =============================================================

class UserRepository {

  // ── Constantes ────────────────────────────────────────────
  static #LIMITE_MAX  = 50;
  static #LIMITE_PAD  = 20;
  static #UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // ─────────────────────────────────────────────────────────
  // PUBLIC: buscarUsuarios()
  //
  // Busca usuários por nome ou e-mail via RPC search_users.
  // Fallback automático para query direta quando RPC não existe.
  //
  // @param {string}      termo
  // @param {object}      [opts]
  // @param {number}      [opts.limit=20]
  // @param {number}      [opts.offset=0]
  // @param {AbortSignal} [opts.signal]   — cancelamento via AbortController
  // @returns {Promise<{ data: object[], total: number, error: Error|null }>}
  // ─────────────────────────────────────────────────────────
  static async buscarUsuarios(termo, { limit = UserRepository.#LIMITE_PAD, offset = 0, signal } = {}) {
    const term = typeof termo === 'string' ? termo.trim() : '';
    const lim  = Math.min(Math.max(1, Number(limit)  || UserRepository.#LIMITE_PAD), UserRepository.#LIMITE_MAX);
    const off  = Math.max(0, Number(offset) || 0);

    const { data, error } = await ApiService.rpc('search_users', {
      p_term:   term,
      p_role:   null,
      p_limit:  lim,
      p_offset: off,
    }, signal);

    if (error) {
      if (UserRepository.#ehRpcInexistente(error)) {
        return UserRepository.#buscarFallback(term, lim, off, signal);
      }
      return { data: [], total: 0, error };
    }

    const rows  = Array.isArray(data) ? data : [];
    const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
    const itens = rows.map(UserRepository.#mapPerfil);
    return { data: itens, total, error: null };
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: getFavoritosModal()
  //
  // Retorna perfis de quem favoritou a barbearia ou o barbeiro.
  // Via RPC get_clientes_favoritos_modal (UNION das duas tabelas).
  //
  // @param {string} barbershopId
  // @param {string} professionalId
  // @returns {Promise<{ data: object[], error: Error|null }>}
  // ─────────────────────────────────────────────────────────
  static async getFavoritosModal(barbershopId, professionalId) {
    UserRepository.#validarUuid(barbershopId,   'barbershopId');
    UserRepository.#validarUuid(professionalId, 'professionalId');

    const { data, error } = await ApiService.rpc('get_clientes_favoritos_modal', {
      p_barbershop_id:   barbershopId,
      p_professional_id: professionalId,
    });

    if (error) {
      if (UserRepository.#ehRpcInexistente(error)) {
        return UserRepository.#favoritosFallback(barbershopId, professionalId);
      }
      return { data: [], error };
    }

    const itens = (Array.isArray(data) ? data : []).map(UserRepository.#mapPerfil);
    return { data: itens, error: null };
  }

  // ── Privados ─────────────────────────────────────────────

  /**
   * Fallback para buscarUsuarios quando RPC search_users não existe.
   * 1ª tentativa: buscar_perfis_por_nome (SECURITY DEFINER, bypass de RLS).
   * Último recurso: query direta em profiles (sujeita a RLS).
   */
  static async #buscarFallback(term, limit, offset, signal) {
    const pLimite = Math.min(offset + limit, UserRepository.#LIMITE_MAX);

    const { data: rpcData, error: rpcError } = await ApiService.rpc(
      'buscar_perfis_por_nome',
      { p_termo: term, p_limite: pLimite },
      signal,
    );

    if (!rpcError) {
      const pagina = (Array.isArray(rpcData) ? rpcData : []).slice(offset, offset + limit);
      const itens  = pagina.map(UserRepository.#mapPerfil);
      return { data: itens, total: itens.length, error: null };
    }

    // AbortError: não tentar query direta — a requisição foi cancelada intencionalmente
    if (rpcError.name === 'AbortError' || !UserRepository.#ehRpcInexistente(rpcError)) {
      return { data: [], total: 0, error: rpcError };
    }

    // Último recurso: query direta (pode ser restrita por RLS)
    const { data, error } = await ApiService.from('profiles')
      .select('id,full_name,email,avatar_path,updated_at')
      .ilike('full_name', `%${term}%`)
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return { data: [], total: 0, error };
    const itens = (data ?? []).map(UserRepository.#mapPerfil);
    return { data: itens, total: itens.length, error: null };
  }

  /**
   * Fallback para getFavoritosModal quando RPC get_clientes_favoritos_modal não existe.
   * Duas queries diretas (barbershop_interactions + favorite_professionals).
   */
  static async #favoritosFallback(barbershopId, professionalId) {
    const ids = new Set();

    // Apenas quem favoritou este profissional específico
    const { data: profFavs } = await ApiService.from('favorite_professionals')
      .select('user_id')
      .eq('professional_id', professionalId);
    (profFavs ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });

    if (!ids.size) return { data: [], error: null };

    const { data, error } = await ApiService.from('profiles')
      .select('id,full_name,email,avatar_path,updated_at')
      .in('id', [...ids])
      .order('full_name');

    if (error) return { data: [], error };
    const itens = (data ?? []).map(UserRepository.#mapPerfil);
    return { data: itens, error: null };
  }

  /** Normaliza qualquer row de perfil retornado por RPC ou query direta. */
  static #mapPerfil(row) {
    return {
      id:          row.id,
      full_name:   row.full_name   ?? null,
      email:       row.email       ?? null,
      avatar_path: row.avatar_path ?? null,
      updated_at:  row.updated_at  ?? null,
    };
  }

  /**
   * Verifica se o erro indica que a RPC não existe no banco.
   * Códigos: PGRST202 (PostgREST) ou 42883 (PostgreSQL UNDEFINED_FUNCTION).
   */
  static #ehRpcInexistente(error) {
    if (!error) return false;
    const code = String(error.code ?? '');
    const msg  = String(error.message ?? '').toLowerCase();
    return code === 'PGRST202' || code === '42883'
      || msg.includes('could not find the function')
      || msg.includes('does not exist');
  }

  /**
   * Lança TypeError se o valor não for um UUID válido.
   */
  static #validarUuid(value, campo) {
    if (typeof value !== 'string' || !UserRepository.#UUID_RE.test(value)) {
      throw new TypeError(`[UserRepository] ${campo} deve ser um UUID válido. Recebido: "${value}"`);
    }
  }
}
