'use strict';

// =============================================================
// MessageService — Comentários de stories.
//
// Responsabilidades:
//   - Envio/leitura de comentários de stories (story_comments)
//   - Apagar comentários
//
// Mensagens diretas entre usuários foram migradas para P2P E2E.
// Ver: P2PMessageConnectionService.js, MessageCryptoService.js
// =============================================================

class MessageService {

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
      return { ok: true, data: [], error: null };
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
}
