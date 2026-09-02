'use strict';

const BaseController = require('./BaseController');

/**
 * FilaConvidadoController — Endpoint público para visitante sem conta
 * entrar na fila de uma barbearia (fluxo de link do WhatsApp).
 *
 * Nunca confia em client_id vindo do corpo da requisição: a rota não tem
 * autenticação, então toda entrada criada aqui é sempre guest (client_id nulo).
 */
class FilaConvidadoController extends BaseController {

  /** @type {import('../application/fila/EntrarNaFilaUseCase').EntrarNaFilaUseCase} */
  #useCase;

  /**
   * @param {import('../application/fila/EntrarNaFilaUseCase').EntrarNaFilaUseCase} useCase
   */
  constructor(useCase) {
    super();
    this.#useCase = useCase;
  }

  /**
   * POST /api/v1/fila/entrar
   * Body: { barbershop_id, professional_id?, guest_name, guest_phone?, service_ids? }
   */
  async entrar(req, res) {
    await this.handle(res, async () => {
      const resultado = await this.#useCase.execute({
        clienteId:      null,
        barbershopId:   req.body?.barbershop_id,
        profissionalId: req.body?.professional_id ?? null,
        guestName:      req.body?.guest_name,
        guestPhone:     req.body?.guest_phone ?? null,
        serviceIds:     req.body?.service_ids ?? [],
      });

      if (resultado.isFail()) throw this._erro(resultado.getError(), 400);

      this.created(res, resultado.getValue());
    });
  }
}

module.exports = FilaConvidadoController;
