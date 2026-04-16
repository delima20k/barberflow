'use strict';

// =============================================================
// MessageService — Camada de dados para mensagens e comentários
//
// Responsabilidades:
//   - Envio/leitura de mensagens diretas (direct_messages)
//   - Envio/leitura de comentários de stories (story_comments)
//   - Marcar mensagens como lidas
//   - Subscrição Realtime (recebimento de mensagens)
//   - Fallback MOCK automático quando Supabase indisponível
//
// Uso:
//   await MessageService.enviarMensagem(recipientId, 'Olá!')
//   await MessageService.enviarComentarioStory(storyId, ownerId, 'Incrível!')
// =============================================================

class MessageService {

  // ─── Estado ──────────────────────────────────────────────────
  static #realtimeChannel = null;
  static #inboxCallbacks  = new Set();

  // ─── Mock de fallback ────────────────────────────────────────
  static #MOCK_INBOX = [];

  // ─── Helpers privados ────────────────────────────────────────

  /** Retorna o cliente Supabase (pode ser null se não disponível). */
  static get #sb() {
    try { return SupabaseService.client; } catch { return null; }
  }

  /** ID do usuário autenticado (null em modo demo). */
  static async #uid() {
    try {
      const { user } = await SupabaseService.getUser();
      return user?.id ?? null;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MENSAGENS DIRETAS
  // ═══════════════════════════════════════════════════════════

  /**
   * Envia uma mensagem direta para outro usuário.
   *
   * @param {string}      recipientId  - UUID do destinatário
   * @param {string}      content      - texto da mensagem
   * @param {string|null} storyRefId   - UUID do story de origem (opcional)
   * @returns {{ ok: boolean, data: object|null, error: string|null }}
   */
  static async enviarMensagem(recipientId, content, storyRefId = null) {
    if (!recipientId || !content?.trim()) {
      return { ok: false, data: null, error: 'Dados inválidos' };
    }

    const sb  = MessageService.#sb;
    const uid = await MessageService.#uid();

    // Fallback MOCK — modo offline/demo
    if (!sb || !uid) {
      const mock = {
        id:           crypto.randomUUID(),
        sender_id:    'demo',
        recipient_id: recipientId,
        content:      content.trim(),
        is_read:      false,
        story_ref_id: storyRefId,
        created_at:   new Date().toISOString(),
      };
      MessageService.#MOCK_INBOX.push(mock);
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await sb
      .from('direct_messages')
      .insert({
        sender_id:    uid,
        recipient_id: recipientId,
        content:      content.trim(),
        is_read:      false,
        story_ref_id: storyRefId ?? null,
      })
      .select()
      .single();

    if (error) {
      console.warn('[MessageService] enviarMensagem:', error.message);
      return { ok: false, data: null, error: error.message };
    }

    return { ok: true, data, error: null };
  }

  /**
   * Busca o histórico de uma conversa paginada (mais recentes primeiro).
   *
   * @param {string} otherUserId - UUID do interlocutor
   * @param {number} limit
   * @param {number} offset
   * @returns {{ ok: boolean, data: Array, error: string|null }}
   */
  static async buscarConversa(otherUserId, limit = 50, offset = 0) {
    const sb  = MessageService.#sb;
    const uid = await MessageService.#uid();

    if (!sb || !uid) {
      const mock = MessageService.#MOCK_INBOX.filter(
        m => m.sender_id === otherUserId || m.recipient_id === otherUserId,
      );
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await sb
      .from('direct_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${uid},recipient_id.eq.${otherUserId}),` +
        `and(sender_id.eq.${otherUserId},recipient_id.eq.${uid})`,
      )
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.warn('[MessageService] buscarConversa:', error.message);
      return { ok: false, data: [], error: error.message };
    }

    return { ok: true, data: data ?? [], error: null };
  }

  /**
   * Marca todas as mensagens de um remetente como lidas.
   *
   * @param {string} senderId - UUID do remetente
   * @returns {{ ok: boolean }}
   */
  static async marcarLido(senderId) {
    const sb  = MessageService.#sb;
    const uid = await MessageService.#uid();
    if (!sb || !uid) return { ok: true };

    const { error } = await sb
      .from('direct_messages')
      .update({ is_read: true })
      .eq('sender_id',    senderId)
      .eq('recipient_id', uid)
      .eq('is_read',      false);

    if (error) console.warn('[MessageService] marcarLido:', error.message);
    return { ok: !error };
  }

  // ═══════════════════════════════════════════════════════════
  // COMENTÁRIOS DE STORY
  // ═══════════════════════════════════════════════════════════

  /**
   * Envia um comentário em um story.
   *
   * @param {string} storyId    - UUID do story
   * @param {string} ownerId    - UUID do dono do story (recipient)
   * @param {string} content    - texto do comentário
   * @returns {{ ok: boolean, data: object|null, error: string|null }}
   */
  static async enviarComentarioStory(storyId, ownerId, content) {
    if (!storyId || !ownerId || !content?.trim()) {
      return { ok: false, data: null, error: 'Dados inválidos' };
    }

    const sb  = MessageService.#sb;
    const uid = await MessageService.#uid();

    if (!sb || !uid) {
      const mock = {
        id:           crypto.randomUUID(),
        story_id:     storyId,
        sender_id:    'demo',
        recipient_id: ownerId,
        content:      content.trim(),
        created_at:   new Date().toISOString(),
      };
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await sb
      .from('story_comments')
      .insert({
        story_id:     storyId,
        sender_id:    uid,
        recipient_id: ownerId,
        content:      content.trim(),
      })
      .select()
      .single();

    if (error) {
      console.warn('[MessageService] enviarComentarioStory:', error.message);
      return { ok: false, data: null, error: error.message };
    }

    return { ok: true, data, error: null };
  }

  /**
   * Busca comentários de um story (apenas se ainda ativo).
   *
   * @param {string} storyId
   * @param {number} limit
   * @returns {{ ok: boolean, data: Array, error: string|null }}
   */
  static async buscarComentariosStory(storyId, limit = 30) {
    if (!storyId) return { ok: false, data: [], error: 'storyId inválido' };

    const sb = MessageService.#sb;

    if (!sb) return { ok: true, data: [], error: null };

    // Verifica se story ainda está ativo antes de buscar
    const { data: story } = await sb
      .from('stories')
      .select('id, expires_at')
      .eq('id', storyId)
      .single();

    if (!story || new Date(story.expires_at) < new Date()) {
      return { ok: true, data: [], error: null }; // story expirado → sem comentários
    }

    const { data, error } = await sb
      .from('story_comments')
      .select(`
        id,
        content,
        created_at,
        sender_id,
        profiles!story_comments_sender_id_fkey (
          full_name,
          avatar_url
        )
      `)
      .eq('story_id', storyId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.warn('[MessageService] buscarComentariosStory:', error.message);
      return { ok: false, data: [], error: error.message };
    }

    return { ok: true, data: data ?? [], error: null };
  }

  /**
   * Apaga um comentário (próprio ou como dono do story).
   *
   * @param {string} commentId
   * @returns {{ ok: boolean }}
   */
  static async apagarComentario(commentId) {
    const sb = MessageService.#sb;
    if (!sb) return { ok: true };

    const { error } = await sb
      .from('story_comments')
      .delete()
      .eq('id', commentId);

    if (error) console.warn('[MessageService] apagarComentario:', error.message);
    return { ok: !error };
  }

  // ═══════════════════════════════════════════════════════════
  // REALTIME — Recebimento de mensagens em tempo real
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia escuta em tempo real de novas mensagens diretas.
   * O callback recebe o objeto message inserido.
   *
   * @param {Function} callback - (message: object) => void
   */
  static async iniciarRealtime(callback) {
    if (typeof callback === 'function') {
      MessageService.#inboxCallbacks.add(callback);
    }

    if (MessageService.#realtimeChannel) return; // já inscrito

    const sb  = MessageService.#sb;
    const uid = await MessageService.#uid();
    if (!sb || !uid) return;

    MessageService.#realtimeChannel = sb
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'direct_messages',
          filter: `recipient_id=eq.${uid}`,
        },
        payload => {
          MessageService.#inboxCallbacks.forEach(cb => {
            try { cb(payload.new); } catch (e) { console.warn(e); }
          });
        },
      )
      .subscribe();
  }

  /**
   * Remove um callback específico de escuta Realtime.
   * Se não houver mais callbacks, cancela a subscrição.
   *
   * @param {Function} callback
   */
  static pararRealtime(callback) {
    if (callback) MessageService.#inboxCallbacks.delete(callback);

    if (MessageService.#inboxCallbacks.size === 0 && MessageService.#realtimeChannel) {
      MessageService.#realtimeChannel.unsubscribe();
      MessageService.#realtimeChannel = null;
    }
  }
}
