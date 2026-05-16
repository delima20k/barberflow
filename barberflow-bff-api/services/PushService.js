'use strict';

/**
 * PushService (BFF) — Envia Web Push notifications a subscriptions de usuários.
 *
 * Método principal:
 *   enviarAoBarbeiro({ professionalId, entradaId, barbershopId, type, clienteNome })
 *     → Busca subscriptions válidas do barbeiro em push_subscriptions,
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
   *   entradaId:      string,
   *   barbershopId:   string,
   *   type:           'client_not_seated' | 'client_at_shop',
   *   clienteNome:    string,
   * }} params
   * @returns {Promise<{ enviados: number, invalidas: number }>}
   */
  async enviarAoBarbeiro({ professionalId, entradaId, barbershopId, type, clienteNome }) {
    const { data: subs } = await this.#supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id',  professionalId)
      .eq('app_id',   'profissional')
      .eq('is_valid', true);

    if (!subs?.length) return { enviados: 0, invalidas: 0 };

    const payload = JSON.stringify({
      title: 'Cliente chegou!',
      body:  clienteNome,
      icon:  '/shared/img/icon-192.png',
      badge: '/shared/img/badge-72.png',
      tag:   `chegada-${entradaId}`,
      requireInteraction: true,
      data: {
        pushType:    type,
        entradaId,
        barbershopId,
        clienteNome,
        url:         '/profissional/',
      },
    });

    let enviados  = 0;
    let invalidas = 0;

    await Promise.all(subs.map(async (sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      };

      try {
        await this.#webpush.sendNotification(pushSub, payload);
        enviados++;
      } catch (err) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          invalidas++;
          await this.#supabaseAdmin
            .from('push_subscriptions')
            .update({ is_valid: false })
            .eq('endpoint', sub.endpoint);
        }
      }
    }));

    return { enviados, invalidas };
  }
}

module.exports = PushService;
