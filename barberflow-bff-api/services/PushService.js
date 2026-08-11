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
      return { enviados: 0, invalidas: 0, falhas: 0, destinatarios: destinatarioIds.length };
    }

    const isCaminho  = type === 'client_not_seated';
    const isProducao = type === 'production_started';
    let title;
    let body;
    let labelPadrao;
    if (isProducao) {
      // Transição 0→1: cadeira de produção estava vazia e o 1º cliente sentou.
      title       = 'Primeiro cliente na cadeira! ✂️';
      body        = `${clienteNome} sentou na sua cadeira de produção.`;
      labelPadrao = 'Primeiro cliente sentou';
    } else if (isCaminho) {
      title       = 'Cliente a caminho 🚶';
      body        = `${clienteNome} está a caminho da barbearia.`;
      labelPadrao = 'Cliente esta a caminho';
    } else {
      title       = 'Cliente na barbearia! ✅';
      body        = `${clienteNome} confirmou que está na barbearia.`;
      labelPadrao = 'Cliente ja chegou';
    }

    const label       = statusLabel || labelPadrao;
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
        url:         '/',
      },
    });

    const outcome = await this.#enviarPayload(subsUnicas, payload);
    if (professionalId && eventKey && outcome.enviados === 0 && outcome.falhas > 0) {
      await this.#removerDedupPush(professionalId, eventKey);
    }
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

  async #removerDedupPush(userId, dedupeKey) {
    try {
      const builder = this.#supabaseAdmin.from('push_notification_dedup');
      if (typeof builder.delete !== 'function') return;
      const { error } = await builder
        .delete()
        .eq('user_id', userId)
        .eq('dedupe_key', dedupeKey);
      if (error) {
        console.error('[PushService] Erro ao liberar dedup de push falho:', error.message, error.code);
      }
    } catch (err) {
      console.error('[PushService] Erro ao liberar dedup de push falho:', err?.message);
    }
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

  async enviarParaUsuario({
    userId,
    title,
    body,
    data = {},
    priority = 'default',
    icon = '/shared/img/icon-192.png',
    badge = '/shared/img/badge-72.png',
  }) {
    const subs = await this.#listarSubscriptions([userId], null);
    if (!subs.length) return { enviados: 0, invalidas: 0, destinatarios: userId ? 1 : 0 };
    const payload = JSON.stringify({
      title,
      body,
      icon,
      badge,
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
    if (appId) {
      query = typeof query.or === 'function'
        ? query.or(`app_id.eq.${appId},app_id.is.null`)
        : query.eq('app_id', appId);
    }
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
    let falhas = 0;
    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await this.#webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        }, payload);
        enviados++;
      } catch (err) {
        const sc = err?.statusCode;
        if (sc === 410 || sc === 404) {
          invalidas++;
          await this.#supabaseAdmin
            .from('push_subscriptions')
            .update({ is_valid: false })
            .eq('endpoint', sub.endpoint);
          return;
        }
        // Falha de ENVIO (subscription existe, mas o envio falhou). NÃO é
        // "sem subscription" — não pode ser mascarado como NO_SUBSCRIPTION.
        falhas++;
        if (sc === 403 || sc === 401) {
          console.error(
            '[PushService] VAPID REJEITADO (%s): a chave VAPID do servidor NÃO corresponde à applicationServerKey da subscription. Verifique VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (drift de chave).',
            sc, err?.message,
          );
        } else {
          console.error('[PushService] sendNotification falhou:', sc, err?.message);
        }
      }
    }));
    return { enviados, invalidas, falhas };
  }
}

module.exports = PushService;
