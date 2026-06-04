'use strict';

// =============================================================
// ConversationListService.js — Camada: application
//
// Orquestra o carregamento da lista de conversas unificada:
//   1. BFF → conversas ativas com última mensagem e unread count
//   2. Supabase → batch de perfis dos peers (avatar, nome, role)
//   3. ProfileRepository → favoritos como quick-start cards
//
// Regras de role:
//   - cliente:      inicia conversa com profissionais/barbearias
//   - profissional: inicia conversa com clientes e outros profissionais
//
// Dependências: ConversationRepository.js, ProfileRepository.js,
//               UserRepository.js, SupabaseService.js, LoggerService.js
// =============================================================

class ConversationListService {

  // Tipos de perfil que cada role pode contatar
  static #ALLOWED_TARGETS = {
    cliente:      new Set(['professional']),
    profissional: new Set(['client', 'professional']),
  };

  /**
   * Carrega conversas + favoritos sem conversa para o usuário logado.
   *
   * @param {string} role        — 'cliente' | 'profissional'
   * @param {string} localUserId — UUID do usuário logado
   * @returns {Promise<{ conversas: ConvItem[], favoritos: FavItem[] }>}
   *
   * ConvItem: { id, convId, peerId, nome, sub, avatar, badge, hora, preview }
   * FavItem:  { peerId, nome, sub, avatar }
   */
  static async carregar(role, localUserId) {
    if (!localUserId) return { conversas: [], favoritos: [] };

    // 1. Lista conversas da BFF
    const { data: convData, error: convErr } = await ConversationRepository.listar();
    if (convErr) LoggerService.warn('[ConversationListService] listar falhou:', convErr?.message);

    const rawItems = convData?.items ?? [];

    // 2. Coleta IDs dos peers para batch lookup de perfil
    const peerIds = [...new Set(
      rawItems.flatMap(c => c.otherParticipantIds ?? []).filter(Boolean)
    )];

    const profilesMap = peerIds.length > 0
      ? await ConversationListService.#buscarPerfis(peerIds)
      : new Map();

    // 3. Mapeia conversas para ConvItem
    const conversas = rawItems.map(item => {
      const peerId  = (item.otherParticipantIds ?? [])[0] ?? null;
      const perfil  = peerId ? (profilesMap.get(peerId) ?? {}) : {};
      const nome    = perfil.full_name ?? 'Usuário';
      const avatarPath = perfil.avatar_path ?? null;

      return {
        id:      peerId,           // usado pelo MessagesWidget como convId legacy
        convId:  item.id,          // UUID real da conversa no banco
        peerId,
        nome,
        sub:     ConversationListService.#labelRole(perfil.role),
        avatar:  avatarPath ? ApiService.getAvatarUrl(avatarPath) : null,
        badge:   ConversationListService.#unreadCountParaUsuario(item, localUserId),
        hora:    item.lastMessage?.createdAt
                   ? ConversationListService.#formatarHora(item.lastMessage.createdAt)
                   : '',
        preview: item.lastMessage?.body ?? '',
      };
    });

    // 4. Carrega favoritos para quick-start cards
    const favoritosCards = await ConversationListService.#carregarFavoritos(
      role, localUserId, conversas
    );

    return { conversas, favoritos: favoritosCards };
  }

  /**
   * Busca usuários para o autocomplete de nova conversa.
   * Aplica filtro por role conforme o usuário logado.
   *
   * @param {string}       termo  — texto digitado
   * @param {string}       role   — 'cliente' | 'profissional'
   * @param {AbortSignal}  signal — cancela busca anterior
   * @returns {Promise<{ data: object[], error: Error|null }>}
   */
  static async buscar(termo, role, signal = undefined) {
    if (!termo || termo.length < 1) return { data: [], error: null };
    const termoSeguro = InputValidator.escaparFiltroPostgREST(termo);
    return UserRepository.buscarUsuarios(termoSeguro, { limit: 10, offset: 0, signal });
  }

  // ── Privados ──────────────────────────────────────────────

  static async #buscarPerfis(ids) {
    try {
      const { data, error } = await SupabaseService.client
        .from('profiles')
        .select('id, full_name, avatar_path, role')
        .in('id', ids);
      if (error) throw error;
      const map = new Map();
      (data ?? []).forEach(p => map.set(p.id, p));
      return map;
    } catch (e) {
      LoggerService.warn('[ConversationListService] buscarPerfis falhou:', e?.message);
      return new Map();
    }
  }

  static async #carregarFavoritos(role, localUserId, conversasExistentes) {
    const convPeerIds = new Set(conversasExistentes.map(c => c.peerId).filter(Boolean));
    const cards = [];

    try {
      if (role === 'cliente') {
        // Barbearias favoritas
        const shops = await ProfileRepository.getFavorites(localUserId).catch(() => []);
        for (const shop of shops ?? []) {
          if (!shop.owner_id || convPeerIds.has(shop.owner_id)) continue;
          cards.push({
            peerId: shop.owner_id,
            nome:   shop.name ?? 'Barbearia',
            sub:    'Barbearia',
            avatar: shop.logo_path ? ApiService.getLogoUrl(shop.logo_path) : null,
          });
        }
        // Barbeiros favoritos
        const barbers = await ProfileRepository.getFavoriteBarbers(localUserId).catch(() => []);
        for (const b of barbers ?? []) {
          if (!b.id || convPeerIds.has(b.id)) continue;
          cards.push({
            peerId: b.id,
            nome:   b.full_name ?? 'Barbeiro',
            sub:    'Barbeiro',
            avatar: b.avatar_path ? ApiService.getAvatarUrl(b.avatar_path) : null,
          });
        }
      }
    } catch (e) {
      LoggerService.warn('[ConversationListService] carregarFavoritos falhou:', e?.message);
    }

    return cards;
  }

  static #labelRole(role) {
    const mapa = {
      professional: '✂️ Profissional',
      client:       '👤 Cliente',
    };
    return mapa[role] ?? '💬 Mensagem';
  }

  static #unreadCountParaUsuario(item, localUserId) {
    if (!item?.lastMessage) return 0;
    if (item.lastMessage?.senderId === localUserId) return 0;
    return Math.max(0, Number(item.unreadCount ?? 0));
  }

  static #formatarHora(isoString) {
    try {
      const d = new Date(isoString);
      const agora = new Date();
      const diffDias = Math.floor((agora - d) / 86400000);
      if (diffDias === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (diffDias === 1) return 'ontem';
      if (diffDias < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' });
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
  }
}
