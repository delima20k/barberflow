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

  /** ID do usuário autenticado (null em modo demo). */
  static async #uid() {
    try {
      const user = await SupabaseService.getUser();
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
    // Valida recipientId como UUID
    if (!InputValidator.uuid(recipientId).ok) {
      return { ok: false, data: null, error: 'Destinatário inválido' };
    }
    // Valida e sanitiza conteúdo — previne XSS e limita tamanho
    const check = InputValidator.textoLivre(content, 2000, true);
    if (!check.ok) {
      return { ok: false, data: null, error: check.msg ?? 'Mensagem inválida' };
    }
    const safeContent = check.valor;

    const uid = await MessageService.#uid();

    // Fallback MOCK — modo offline/demo
    if (!uid) {
      const mock = {
        id:           crypto.randomUUID(),
        sender_id:    'demo',
        recipient_id: recipientId,
        content:      safeContent,
        is_read:      false,
        story_ref_id: storyRefId,
        created_at:   new Date().toISOString(),
      };
      MessageService.#MOCK_INBOX.push(mock);
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await SupabaseService.directMessages()
      .insert({
        sender_id:    uid,
        recipient_id: recipientId,
        content:      safeContent,
        is_read:      false,
        story_ref_id: storyRefId ?? null,
      })
      .select()
      .single();

    if (error) {
      LoggerService.warn('[MessageService] enviarMensagem:', error.message);
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
    if (!InputValidator.uuid(otherUserId).ok) {
      return { ok: false, data: [], error: 'Interlocutor inválido' };
    }

    const uid = await MessageService.#uid();

    if (!uid) {
      const mock = MessageService.#MOCK_INBOX.filter(
        m => m.sender_id === otherUserId || m.recipient_id === otherUserId,
      );
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await SupabaseService.directMessages()
      .select('*')
      .or(
        `and(sender_id.eq.${uid},recipient_id.eq.${otherUserId}),` +
        `and(sender_id.eq.${otherUserId},recipient_id.eq.${uid})`,
      )
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      LoggerService.warn('[MessageService] buscarConversa:', error.message);
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
    if (!InputValidator.uuid(senderId).ok) return { ok: false };
    const uid = await MessageService.#uid();
    if (!uid) return { ok: true };

    const { error } = await SupabaseService.directMessages()
      .update({ is_read: true })
      .eq('sender_id',    senderId)
      .eq('recipient_id', uid)
      .eq('is_read',      false);

    if (error) LoggerService.warn('[MessageService] marcarLido:', error.message);
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
    // Valida IDs como UUIDs e conteúdo
    if (!InputValidator.uuid(storyId).ok || !InputValidator.uuid(ownerId).ok) {
      return { ok: false, data: null, error: 'Dados inválidos' };
    }
    const check = InputValidator.textoLivre(content, 1000, true);
    if (!check.ok) {
      return { ok: false, data: null, error: check.msg ?? 'Comentário inválido' };
    }
    const safeContent = check.valor;

    const uid = await MessageService.#uid();

    if (!uid) {
      const mock = {
        id:           crypto.randomUUID(),
        story_id:     storyId,
        sender_id:    'demo',
        recipient_id: ownerId,
        content:      safeContent,
        created_at:   new Date().toISOString(),
      };
      return { ok: true, data: mock, error: null };
    }

    const { data, error } = await SupabaseService.storyComments()
      .insert({
        story_id:     storyId,
        sender_id:    uid,
        recipient_id: ownerId,
        content:      safeContent,
      })
      .select()
      .single();

    if (error) {
      LoggerService.warn('[MessageService] enviarComentarioStory:', error.message);
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
    if (!InputValidator.uuid(storyId).ok) return { ok: false, data: [], error: 'storyId inválido' };

    const { data: story } = await SupabaseService.stories()
      .select('id, expires_at')
      .eq('id', storyId)
      .single();

    if (!story || new Date(story.expires_at) < new Date()) {
      return { ok: true, data: [], error: null }; // story expirado → sem comentários
    }

    const { data, error } = await SupabaseService.storyComments()
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
      LoggerService.warn('[MessageService] buscarComentariosStory:', error.message);
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
    if (!InputValidator.uuid(commentId).ok) return { ok: false };
    const { error } = await SupabaseService.storyComments()
      .delete()
      .eq('id', commentId);

    if (error) LoggerService.warn('[MessageService] apagarComentario:', error.message);
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

    const uid = await MessageService.#uid();
    if (!uid) return;

    MessageService.#realtimeChannel = SupabaseService.channel('inbox-realtime')
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
            try { cb(payload.new); } catch (e) { LoggerService.warn('[MessageService] inbox callback:', e); }
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
