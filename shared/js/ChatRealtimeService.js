'use strict';

// =============================================================
// ChatRealtimeService.js — Camada: infra
//
// Dono ÚNICO da assinatura do canal privado de chat `chat.{uid}`
// no Supabase Realtime (broadcast). Recebe os eventos canônicos do
// BFF e os converte em CustomEvents `chatflow:*` no document, que
// alimentam tanto a lista (UniversalChatPage) quanto a conversa
// aberta (ChatModal) — independente de haver modal aberto.
//
// SRP: apenas transporte realtime → eventos de domínio. Sem DOM de UI.
// Idempotente: uma única assinatura por uid.
//
// Dependências: SupabaseService.js
// =============================================================

class ChatRealtimeService {
  static #canal = null;
  static #uid   = null;

  static EVENT_MESSAGE_CREATED   = 'events.v1.chat.message_created';
  static EVENT_CONVERSATION_READ = 'events.v1.chat.conversation_read';

  /**
   * Assina o canal privado `chat.{uid}`. Idempotente: se já assinado
   * para o mesmo uid, não faz nada.
   * @param {string} uid — UUID do usuário logado
   */
  static iniciar(uid) {
    if (!uid || typeof SupabaseService === 'undefined' || !SupabaseService.client) return;
    if (ChatRealtimeService.#canal && ChatRealtimeService.#uid === uid) return;
    ChatRealtimeService.parar();
    ChatRealtimeService.#uid = uid;

    try {
      ChatRealtimeService.#canal = SupabaseService.client
        .channel(`chat.${uid}`, { config: { private: true } })
        .on('broadcast', { event: ChatRealtimeService.EVENT_MESSAGE_CREATED }, envelope => {
          ChatRealtimeService.#onMensagemCriada(envelope?.payload ?? envelope);
        })
        .on('broadcast', { event: ChatRealtimeService.EVENT_CONVERSATION_READ }, envelope => {
          ChatRealtimeService.#onConversaLida(envelope?.payload ?? envelope);
        })
        .subscribe();
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[ChatRealtimeService] assinatura falhou:', err?.message || err);
      }
    }
  }

  /** Cancela a assinatura e limpa o estado. */
  static parar() {
    if (ChatRealtimeService.#canal && typeof SupabaseService !== 'undefined') {
      try { SupabaseService.client.removeChannel(ChatRealtimeService.#canal); } catch { /* ignora */ }
    }
    ChatRealtimeService.#canal = null;
    ChatRealtimeService.#uid   = null;
  }

  // ── Privados ────────────────────────────────────────────────

  static #onMensagemCriada(payload) {
    const msg = payload?.message;
    if (!msg?.conversationId) return;
    // Detail enriquecido: preserva o contrato da lista (convId/preview/createdAt)
    // e adiciona o que o ChatModal precisa (messageId/senderId/body/sender).
    document.dispatchEvent(new CustomEvent('chatflow:mensagem-nova', {
      detail: {
        convId:    msg.conversationId,
        messageId: msg.id ?? null,
        senderId:  msg.senderId ?? null,
        preview:   msg.body ?? '',
        body:      msg.body ?? '',
        sender:    msg.sender ?? null,
        createdAt: msg.createdAt ?? null,
      },
    }));
  }

  static #onConversaLida(payload) {
    const conversationId = payload?.conversationId;
    if (!conversationId) return;
    document.dispatchEvent(new CustomEvent('chatflow:conversa-lida', {
      detail: { convId: conversationId, conversationId },
    }));
  }
}

if (typeof window !== 'undefined') window.ChatRealtimeService = ChatRealtimeService;
