'use strict';

// =============================================================
// GuestFilaService.js — Entrada na fila para visitante sem conta
// (Frente B). Equivalente a ClienteController.entrarNaFila(), mas
// para quem não tem login: sem verificação de perfil, delega ao
// endpoint público da BFF (POST /api/v1/fila/entrar) em vez de
// escrever direto no Supabase.
//
// CAMADA: application — sem acesso ao DOM.
// Sempre resulta em status 'waiting': o endpoint da Frente A não
// cria entradas direto em produção — auto-promoção continua
// exigindo login.
//
// Dependências: BffApiService.js, GuestFilaSessionStore.js
// =============================================================

class GuestFilaService {

  /**
   * @param {object}   opts
   * @param {string}     opts.barbershopId
   * @param {string}     [opts.professionalId]
   * @param {string}     opts.guestName
   * @param {string|null} [opts.guestPhone]
   * @param {string[]}   [opts.serviceIds]
   * @returns {Promise<object>} entrada criada (id, guestName, guestPhone, posicao, status...)
   * @throws {Error} se guestName ausente ou se a BFF rejeitar o pedido
   */
  static async entrar({ barbershopId, professionalId = null, guestName, guestPhone = null, serviceIds = [] }) {
    const nome = String(guestName ?? '').trim();
    if (!nome) throw new Error('[GuestFilaService] guestName é obrigatório.');

    const { data, error } = await BffApiService.fila.entrarComoConvidado({
      barbershopId,
      professionalId,
      guestName:  nome,
      guestPhone: guestPhone || null,
      serviceIds,
    });

    if (error) throw error;

    GuestFilaSessionStore.salvar(barbershopId, {
      entradaId:  data.id,
      guestName:  data.guestName ?? nome,
      guestPhone: data.guestPhone ?? guestPhone ?? null,
    });

    return data;
  }
}
