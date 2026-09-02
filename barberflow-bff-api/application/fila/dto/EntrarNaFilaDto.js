'use strict';

const { Result } = require('../../../domain/shared/Result');

const UUID_RE     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Aceita dígitos, espaços, parênteses, "+" e "-"; validação leve — não é um
// validador de telefone completo, apenas descarta lixo óbvio.
const TELEFONE_RE = /^[0-9()+\-\s]{8,20}$/;

const GUEST_NAME_MAX_LEN = 80;

/**
 * @typedef {object} EntrarNaFilaDtoProps
 * @property {string}   [clienteId]      cliente com conta (autenticado)
 * @property {string}   [guestName]      nome avulso — obrigatório quando não há clienteId
 * @property {string}   [guestPhone]     WhatsApp avulso — opcional
 * @property {string}   barbershopId
 * @property {string}   [profissionalId]
 * @property {string[]} [serviceIds]
 * @property {string}   [notes]
 */

class EntrarNaFilaDto {
  /** @type {string|null} */ clienteId;
  /** @type {string|null} */ guestName;
  /** @type {string|null} */ guestPhone;
  /** @type {string}      */ barbershopId;
  /** @type {string|null} */ profissionalId;
  /** @type {string[]}    */ serviceIds;
  /** @type {string|null} */ notes;

  /** @param {EntrarNaFilaDtoProps} props */
  constructor(props) {
    this.clienteId      = props.clienteId ?? null;
    this.guestName      = props.guestName ?? null;
    this.guestPhone     = props.guestPhone ?? null;
    this.barbershopId   = props.barbershopId;
    this.profissionalId = props.profissionalId ?? null;
    this.serviceIds     = props.serviceIds ?? [];
    this.notes          = props.notes ?? null;
    Object.freeze(this);
  }

  /**
   * @param {EntrarNaFilaDtoProps} props
   * @returns {Result<EntrarNaFilaDto, string>}
   */
  static create(props) {
    if (!props || typeof props !== 'object') return Result.fail('EntrarNaFilaDto: props inválido');

    if (!props.barbershopId || !UUID_RE.test(props.barbershopId)) {
      return Result.fail('EntrarNaFilaDto: barbershopId deve ser um UUID válido');
    }

    if (props.profissionalId && !UUID_RE.test(props.profissionalId)) {
      return Result.fail('EntrarNaFilaDto: profissionalId deve ser um UUID válido');
    }

    const clienteId = props.clienteId ?? null;
    if (clienteId && !UUID_RE.test(clienteId)) {
      return Result.fail('EntrarNaFilaDto: clienteId deve ser um UUID válido');
    }

    const guestName = typeof props.guestName === 'string' ? props.guestName.trim() : '';
    if (!clienteId && !guestName) {
      return Result.fail('EntrarNaFilaDto: informe clienteId ou guestName');
    }
    if (guestName && guestName.length > GUEST_NAME_MAX_LEN) {
      return Result.fail(`EntrarNaFilaDto: guestName deve ter no máximo ${GUEST_NAME_MAX_LEN} caracteres`);
    }

    let guestPhone = null;
    if (props.guestPhone !== undefined && props.guestPhone !== null && props.guestPhone !== '') {
      const raw = String(props.guestPhone).trim();
      if (!TELEFONE_RE.test(raw) || raw.replace(/\D/g, '').length < 8) {
        return Result.fail('EntrarNaFilaDto: guestPhone em formato inválido');
      }
      guestPhone = raw;
    }

    const serviceIds = Array.isArray(props.serviceIds) ? props.serviceIds : [];
    for (const serviceId of serviceIds) {
      if (!UUID_RE.test(serviceId)) {
        return Result.fail('EntrarNaFilaDto: serviceIds deve conter apenas UUIDs válidos');
      }
    }

    return Result.ok(new EntrarNaFilaDto({
      clienteId,
      guestName:      guestName || null,
      guestPhone,
      barbershopId:   props.barbershopId,
      profissionalId: props.profissionalId ?? null,
      serviceIds,
      notes:          props.notes ?? null,
    }));
  }
}

module.exports = { EntrarNaFilaDto };
