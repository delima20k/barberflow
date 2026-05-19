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
   * Body: { professionalId, entradaId, barbershopId, type, clienteNome }
   */
  async pushBarbeiro(req, res) {
    await this.handle(res, async () => {
      const {
        professionalId,
        entradaId,
        barbershopId,
        type,
        clienteNome,
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

      const TIPOS_VALIDOS = ['client_not_seated', 'client_at_shop'];
      if (!TIPOS_VALIDOS.includes(type)) {
        throw AppError.badRequest(`Campo 'type' inválido. Use: ${TIPOS_VALIDOS.join(' | ')}.`);
      }

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

      const { enviados } = await this.#svc.enviarAoBarbeiro({
        professionalId,
        entradaId,
        barbershopId,
        type,
        clienteNome: clienteNome.trim(),
        statusLabel,
        cadeira,
        cliente,
      });

      this.success(res, { enviados });
    });
  }
}

module.exports = NotificacoesController;
