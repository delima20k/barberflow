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
    statusLabel,
    cadeira,
    cliente,
  }) {
    const destinatarioIds = [...new Set([professionalId, ownerId].filter(Boolean))];
    let query = this.#supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('app_id',   'profissional')
      .eq('is_valid', true);

    query = destinatarioIds.length === 1
      ? query.eq('user_id', destinatarioIds[0])
      : query.in('user_id', destinatarioIds);

    const { data: subs, error: subsError } = await query;
    if (subsError) {
      console.error('[PushService] Erro ao buscar subscriptions:', subsError.message, subsError.code);
    }
    const subsUnicas = [];
    const endpoints = new Set();
    for (const sub of subs ?? []) {
      if (!sub?.endpoint || endpoints.has(sub.endpoint)) continue;
      endpoints.add(sub.endpoint);
      subsUnicas.push(sub);
    }

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

    const payload = JSON.stringify({
      title,
      body,
      icon:  '/shared/img/icon-192.png',
      badge: '/shared/img/badge-72.png',
      tag:   `chegada-${entradaId}`,
      requireInteraction: true,
      data: {
        pushType:    type,
        entradaId,
        barbershopId,
        clienteNome,
        statusLabel: label,
        cadeira:     cadeiraNome,
        destino:     'profissional',
        cliente:     cliente ?? { id: null, nome: clienteNome },
        url:         '/profissional/',
      },
    });

    let enviados  = 0;
    let invalidas = 0;

    await Promise.all(subsUnicas.map(async (sub) => {
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
        } else {
          console.error('[PushService] sendNotification falhou:', err?.statusCode, err?.message);
        }
      }
    }));

    return { enviados, invalidas, destinatarios: destinatarioIds.length };
  }
}

module.exports = PushService;
