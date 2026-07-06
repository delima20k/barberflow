'use strict';

/**
 * PushService (BFF) — Envia Web Push notifications a subscriptions de usuários.
 *
 * Método principal:
 *   enviarAoBarbeiro({ professionalId, ownerId, entradaId, barbershopId, type, clienteNome })
 *     → Busca subscriptions válidas do app profissional em push_subscriptions,
 *       envia push via VAPID para cada uma e invalida subscriptions expiradas (410/404).
 *
 * Camada: application
 * Dependências injetadas via construtor (testabilidade).
 */
class PushService {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabaseAdmin;

  /** @type {import('web-push')} */
  #webpush;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
   * @param {import('web-push')} webpush
   */
  constructor(supabaseAdmin, webpush) {
    this.#supabaseAdmin = supabaseAdmin;
    this.#webpush       = webpush;
  }

  // ── Público ──────────────────────────────────────────────────────

  /**
   * Envia Web Push ao barbeiro.
   *
   * @param {{
   *   professionalId: string,
   *   ownerId?:       string|null,
   *   entradaId:      string,
   *   barbershopId:   string,
   *   type:           'client_not_seated' | 'client_at_shop',
   *   clienteNome:    string,
   *   eventId?:       string,
   *   dedupeKey?:     string,
   * }} params
   * @returns {Promise<{ enviados: number, invalidas: number, destinatarios: number }>}
   */
  async enviarAoBarbeiro({
    professionalId,
    ownerId = null,
    entradaId,
    barbershopId,
    type,
    clienteNome,
    eventId,
    dedupeKey,
    statusLabel,
    cadeira,
    cliente,
  }) {
    const destinatarioIds = [...new Set([professionalId, ownerId].filter(Boolean))];
    const subsUnicas = await this.#listarSubscriptions(destinatarioIds, 'profissional');

    if (!subsUnicas.length) {
      console.warn('[PushService] Nenhuma subscription válida para destinatarios:', destinatarioIds.join(','));
      return { enviados: 0, invalidas: 0, destinatarios: destinatarioIds.length };
    }

    const isCaminho = type === 'client_not_seated';
    const title     = isCaminho
      ? 'Cliente a caminho 🚶'
      : 'Cliente na barbearia! ✅';
    const body      = isCaminho
      ? `${clienteNome} está a caminho da barbearia.`
      : `${clienteNome} confirmou que está na barbearia.`;

    const label       = statusLabel || (isCaminho ? 'Cliente esta a caminho' : 'Cliente ja chegou');
    const cadeiraNome = cadeira || 'Cadeira de producao';
    const eventKey    = dedupeKey || eventId || PushService.#eventId(entradaId, type);

    // Idempotência real: registra o eventKey ANTES de enviar, ancorado no
    // professionalId (sempre presente). Se já foi enviado (23505), não
    // reenvia — evita push duplicado enquanto o cliente permanece
    // aguardando (2ª aba, reload, retry, etc).
    if (professionalId) {
      const duplicado = await this.#registrarDedupPush(professionalId, eventKey);
      if (duplicado) {
        return { enviados: 0, invalidas: 0, destinatarios: destinatarioIds.length, duplicate: true };
      }
    }

    const payload = JSON.stringify({
      title,
      body,
      icon:  '/shared/img/icon-192.png',
      badge: '/shared/img/badge-72.png',
      tag:   PushService.#notificationTag(eventKey),
      requireInteraction: true,
      data: {
        pushType:    type,
        entradaId,
        barbershopId,
        eventId:     eventKey,
        dedupeKey:   eventKey,
        clienteNome,
        statusLabel: label,
        cadeira:     cadeiraNome,
        destino:     'profissional',
        cliente:     cliente ?? { id: null, nome: clienteNome },
        url:         '/profissional/',
      },
    });

    const outcome = await this.#enviarPayload(subsUnicas, payload);
    return { ...outcome, destinatarios: destinatarioIds.length };
  }

  static #eventId(entradaId, type) {
    return `queue:${entradaId}:${type}`;
  }

  static #notificationTag(eventKey) {
    return `chegada-${String(eventKey).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  }

  /**
   * Registra (userId, dedupeKey) em push_notification_dedup antes do envio.
   * Mesmo padrão de ProfessionalPaymentRepository.registrarWebhookEvento:
   * violação de unicidade (23505) = já enviado, não é erro.
   * @returns {Promise<boolean>} true se já existia (duplicado)
   */
  async #registrarDedupPush(userId, dedupeKey) {
    const { error } = await this.#supabaseAdmin
      .from('push_notification_dedup')
      .insert({ user_id: userId, dedupe_key: dedupeKey });
    if (error?.code === '23505') return true;
    if (error) {
      console.error('[PushService] Erro ao registrar dedup de push:', error.message, error.code);
      return false; // fail-open: não bloqueia envio se a checagem falhar
    }
    return false;
  }

  async enviarMensagemChat({ userId, conversationId, messageId, senderId }) {
    const subs = await this.#listarSubscriptions([userId], null);
    if (!subs.length) return { enviados: 0, invalidas: 0, destinatarios: userId ? 1 : 0 };
    const payload = JSON.stringify({
      title: 'Nova mensagem',
      body: 'Voce recebeu uma mensagem no BarberFlow.',
      icon: '/shared/img/icon-192.png',
      badge: '/shared/img/badge-72.png',
      tag: `chat-${conversationId}`,
      data: {
        pushType: 'chat_message',
        conversationId,
        messageId,
        senderId,
        url: '/cliente/',
      },
    });
    const outcome = await this.#enviarPayload(subs, payload);
    return { ...outcome, destinatarios: userId ? 1 : 0 };
  }

  async enviarParaUsuario({ userId, title, body, data = {}, priority = 'default' }) {
    const subs = await this.#listarSubscriptions([userId], null);
    if (!subs.length) return { enviados: 0, invalidas: 0, destinatarios: userId ? 1 : 0 };
    const payload = JSON.stringify({
      title,
      body,
      icon: '/shared/img/icon-192.png',
      badge: '/shared/img/badge-72.png',
      tag: data.tag ?? `notification-${data.notificationId ?? userId}`,
      requireInteraction: priority === 'high',
      data: {
        ...data,
        pushType: data.pushType ?? 'notification',
      },
    });
    const outcome = await this.#enviarPayload(subs, payload);
    return { ...outcome, destinatarios: userId ? 1 : 0 };
  }

  async #listarSubscriptions(userIds, appId) {
    const ids = [...new Set((userIds ?? []).filter(Boolean))];
    if (!ids.length) return [];
    let query = this.#supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('is_valid', true);
    if (appId) query = query.eq('app_id', appId);
    query = ids.length === 1 ? query.eq('user_id', ids[0]) : query.in('user_id', ids);
    const { data: subs, error } = await query;
    if (error) console.error('[PushService] Erro ao buscar subscriptions:', error.message, error.code);
    const endpoints = new Set();
    return (subs ?? []).filter(sub => {
      if (!sub?.endpoint || endpoints.has(sub.endpoint)) return false;
      endpoints.add(sub.endpoint);
      return true;
    });
  }

  async #enviarPayload(subscriptions, payload) {
    let enviados = 0;
    let invalidas = 0;
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await this.#webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        }, payload);
        enviados++;
      } catch (err) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          invalidas++;
          await this.#supabaseAdmin
            .from('push_subscriptions')
            .update({ is_valid: false })
            .eq('endpoint', sub.endpoint);
          return;
        }
        console.error('[PushService] sendNotification falhou:', err?.statusCode, err?.message);
      }
    }));
    return { enviados, invalidas };
  }
}

module.exports = PushService;
