'use strict';

// =============================================================
// MessageSignalingService.js — Sinalização WebRTC para chat P2P.
//
// RESPONSABILIDADE ÚNICA:
//   Transportar APENAS dados técnicos de negociação WebRTC:
//   offer, answer e ICE candidates.
//   NUNCA transporta conteúdo de mensagem (texto, payload criptografado
//   de mensagem, chave pública de troca de mensagens).
//
// Canal Supabase Realtime:
//   Cada usuário assina o canal 'chat-signal:{userId}' para receber
//   sinais endereçados a ele. O remetente envia para o canal do destinatário.
//
// Protocolo (broadcast payload):
//   { type: 'offer',     from: string, payload: RTCSessionDescription }
//   { type: 'answer',    from: string, payload: RTCSessionDescription }
//   { type: 'candidate', from: string, payload: RTCIceCandidate }
//
// Segurança:
//   - Nenhum campo de mensagem ou chave de aplicação circula por aqui
//   - Canal é broadcast (sem persistência Supabase)
//   - Subscription filtrada por canal dedicado ao userId — não há escuta cruzada
//
// Dependência: SupabaseService (singleton, global de browser)
// =============================================================

class MessageSignalingService {

  /** @type {Map<string, object>} userId → Supabase RealtimeChannel */
  static #canais = new Map();

  // ═══════════════════════════════════════════════════════════
  // Envio de sinais
  // ═══════════════════════════════════════════════════════════

  /**
   * Envia uma offer WebRTC para o destinatário.
   *
   * @param {string}              receiverId — UUID do destinatário
   * @param {string}              senderId   — UUID do remetente
   * @param {RTCSessionDescription} offer
   */
  static async sendOffer(receiverId, senderId, offer) {
    await MessageSignalingService.#enviar(receiverId, {
      type:    'offer',
      from:    senderId,
      payload: offer,
    });
  }

  /**
   * Envia uma answer WebRTC para o remetente original da offer.
   *
   * @param {string}              receiverId — UUID do destinatário (quem enviou a offer)
   * @param {string}              senderId   — UUID do remetente desta answer
   * @param {RTCSessionDescription} answer
   */
  static async sendAnswer(receiverId, senderId, answer) {
    await MessageSignalingService.#enviar(receiverId, {
      type:    'answer',
      from:    senderId,
      payload: answer,
    });
  }

  /**
   * Envia um ICE candidate para o peer.
   *
   * @param {string}          receiverId
   * @param {string}          senderId
   * @param {RTCIceCandidate} candidate
   */
  static async sendIceCandidate(receiverId, senderId, candidate) {
    await MessageSignalingService.#enviar(receiverId, {
      type:    'candidate',
      from:    senderId,
      payload: candidate,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Recepção de sinais
  // ═══════════════════════════════════════════════════════════

  /**
   * Assina o canal de sinalização do usuário para receber offers/answers/candidates.
   * Idempotente: chamadas repetidas com o mesmo userId reutilizam o canal existente.
   *
   * @param {string}   userId
   * @param {Function} callback — ({ type, from, payload }) => void
   */
  static subscribeToSignals(userId, callback) {
    if (MessageSignalingService.#canais.has(userId)) {
      return; // já inscrito; não duplica subscription
    }

    const canal = MessageSignalingService.#obterCanal(`chat-signal:${userId}`);
    if (!canal) return;

    const TIPOS_VALIDOS = new Set(['offer', 'answer', 'candidate']);

    canal
      .on('broadcast', { event: 'signal' }, ({ payload: sinal }) => {
        // Descarta sinais com tipo desconhecido para evitar processamento indevido
        if (!sinal || !TIPOS_VALIDOS.has(sinal.type)) return;
        try { callback(sinal); } catch (_) {}
      })
      .subscribe();

    MessageSignalingService.#canais.set(userId, canal);
  }

  /**
   * Cancela a subscrição do canal de sinalização do usuário.
   *
   * @param {string} userId
   */
  static unsubscribe(userId) {
    const canal = MessageSignalingService.#canais.get(userId);
    if (!canal) return;
    canal.unsubscribe();
    MessageSignalingService.#canais.delete(userId);
  }

  // ═══════════════════════════════════════════════════════════
  // Privado
  // ═══════════════════════════════════════════════════════════

  /**
   * Envia um sinal via broadcast para o canal do destinatário.
   * @param {string} receiverId
   * @param {object} sinal
   */
  static async #enviar(receiverId, sinal) {
    const canal = MessageSignalingService.#obterCanal(`chat-signal:${receiverId}`);
    if (!canal) return;

    await canal.send({
      type:    'broadcast',
      event:   'signal',
      payload: sinal,
    });
  }

  /**
   * Obtém (ou cria) um canal Supabase Realtime pelo nome.
   * Não cria subscription aqui — apenas retorna o objeto de canal.
   *
   * @param {string} nome
   * @returns {object|null} Supabase RealtimeChannel ou null se indisponível
   */
  static #obterCanal(nome) {
    if (typeof SupabaseService === 'undefined') return null;
    const client = SupabaseService.client;
    if (!client?.channel) return null;
    return client.channel(nome, { config: { broadcast: { self: false } } });
  }
}
