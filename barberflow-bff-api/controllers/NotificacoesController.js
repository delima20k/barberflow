'use strict';

const BaseController = require('./BaseController');
const AppError       = require('../utils/AppError');

/**
 * NotificacoesController — Endpoint autenticado de push notifications.
 *
 * Rotas (auth obrigatória via AuthMiddleware):
 *   POST /api/v1/notificacoes/push-barbeiro — envia Web Push ao barbeiro
 *
 * Camada: interfaces
 */
class NotificacoesController extends BaseController {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #db;

  /** @type {import('../services/PushService')} */
  #svc;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} db
   * @param {import('../services/PushService')} svc
   */
  constructor(db, svc) {
    super();
    this.#db  = db;
    this.#svc = svc;
  }

  // ── Handlers ─────────────────────────────────────────────────────

  /**
   * POST /api/v1/notificacoes/push-barbeiro
   * Body: { professionalId, entradaId, barbershopId, type, clienteNome, eventId?, dedupeKey? }
   */
  async pushBarbeiro(req, res) {
    await this.handle(res, async () => {
      const {
        professionalId,
        entradaId,
        barbershopId,
        type,
        clienteNome,
        eventId,
        dedupeKey,
        statusLabel,
        cadeira,
        cliente,
      } = req.body ?? {};

      if (!professionalId)  throw AppError.badRequest("Campo 'professionalId' é obrigatório.");
      if (!entradaId)       throw AppError.badRequest("Campo 'entradaId' é obrigatório.");
      if (!barbershopId)    throw AppError.badRequest("Campo 'barbershopId' é obrigatório.");
      if (!clienteNome?.trim()) throw AppError.badRequest("Campo 'clienteNome' é obrigatório.");

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const [campo, valor] of Object.entries({ professionalId, entradaId, barbershopId })) {
        if (!UUID_RE.test(String(valor))) {
          throw AppError.badRequest(`Campo '${campo}' deve ser um UUID valido.`);
        }
      }

      const TIPOS_VALIDOS = ['client_not_seated', 'client_at_shop', 'production_started'];
      if (!TIPOS_VALIDOS.includes(type)) {
        throw AppError.badRequest(`Campo 'type' inválido. Use: ${TIPOS_VALIDOS.join(' | ')}.`);
      }

      console.info('[BFF] push-barbeiro: professionalId=%s barbershopId=%s type=%s entradaId=%s userId=%s',
        professionalId, barbershopId, type, entradaId, req.user?.id);

      // Segurança: valida que a entrada pertence ao profissional indicado
      const { data: entrada } = await this.#db
        .from('queue_entries')
        .select('id')
        .eq('id', entradaId)
        .eq('professional_id', professionalId)
        .eq('barbershop_id', barbershopId)
        .single();

      if (!entrada) {
        throw AppError.forbidden('Entrada nao pertence ao profissional/barbearia informados.');
      }

      const result = await this.#svc.enviarAoBarbeiro({
        professionalId,
        entradaId,
        barbershopId,
        type,
        eventId,
        dedupeKey,
        clienteNome: clienteNome.trim(),
        statusLabel,
        cadeira,
        cliente,
      });

      if (result.duplicate) {
        console.info('[BFF] push-barbeiro: evento duplicado ignorado (dedupeKey já enviado)');
        return res.status(200).json({ ok: true, reason: 'DUPLICATE', data: { destinatarios: result.destinatarios } });
      }

      console.info('[BFF] push-barbeiro: enviados=%d destinatarios=%d invalidas=%d falhas=%d',
        result.enviados, result.destinatarios, result.invalidas, result.falhas ?? 0);

      if (result.enviados === 0) {
        // Distingue "sem subscription" de "envio falhou" (ex.: VAPID 403). Mascarar
        // um 403 como NO_SUBSCRIPTION escondia o drift de chave em diagnósticos.
        if ((result.falhas ?? 0) > 0) {
          console.error('[BFF] push-barbeiro: %d envio(s) FALHARAM (subscription existe). Provável chave VAPID inválida — verificar VAPID_PUBLIC_KEY/PRIVATE_KEY.', result.falhas);
          return res.status(200).json({ ok: false, reason: 'SEND_FAILED', data: { destinatarios: result.destinatarios, falhas: result.falhas } });
        }
        return res.status(200).json({ ok: false, reason: 'NO_SUBSCRIPTION', data: { destinatarios: result.destinatarios } });
      }

      this.success(res, result);
    });
  }
}

module.exports = NotificacoesController;
