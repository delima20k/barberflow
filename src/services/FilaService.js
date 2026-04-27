'use strict';

// =============================================================
// FilaService.js — Regras de negócio de fila de espera.
// Camada: application
//
// Nunca acessa o banco diretamente — delega ao FilaRepository.
// =============================================================

const InputValidator = require('../infra/InputValidator');

class FilaService {

  static #STATUS_VALIDOS = ['waiting', 'in_service', 'done', 'cancelled'];

  #filaRepository;

  /** @param {import('../repositories/FilaRepository')} filaRepository */
  constructor(filaRepository) {
    this.#filaRepository = filaRepository;
  }

  /**
   * Retorna entradas ativas da fila.
   * @param {string} barbeariaId
   * @returns {Promise<object[]>}
   */
  async verFila(barbeariaId) {
    const rId = InputValidator.uuid(barbeariaId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    return this.#filaRepository.getFila(barbeariaId);
  }

  /**
   * Entra na fila de uma barbearia.
   * @param {string} barbeariaId
   * @param {string} userId
   * @param {object} [dados] — { chair_id?, notes? }
   * @returns {Promise<object>}
   */
  async entrarFila(barbeariaId, userId, dados = {}) {
    const rShop = InputValidator.uuid(barbeariaId);
    const rUsr  = InputValidator.uuid(userId);
    if (!rShop.ok) throw Object.assign(new Error(rShop.msg), { status: 400 });
    if (!rUsr.ok)  throw Object.assign(new Error(rUsr.msg),  { status: 400 });

    if (dados.notes) {
      const rNotes = InputValidator.textoLivre(dados.notes, 200);
      if (!rNotes.ok) throw Object.assign(new Error(`notes: ${rNotes.msg}`), { status: 400 });
      dados.notes = rNotes.valor;
    }

    if (dados.chair_id) {
      const rChair = InputValidator.uuid(dados.chair_id);
      if (!rChair.ok) throw Object.assign(new Error(`chair_id: ${rChair.msg}`), { status: 400 });
    }

    return this.#filaRepository.entrar(barbeariaId, userId, dados);
  }

  /**
   * Sai da fila.
   * @param {string} entradaId
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async sairFila(entradaId, userId) {
    const rEnt = InputValidator.uuid(entradaId);
    const rUsr = InputValidator.uuid(userId);
    if (!rEnt.ok) throw Object.assign(new Error(rEnt.msg), { status: 400 });
    if (!rUsr.ok) throw Object.assign(new Error(rUsr.msg), { status: 400 });

    return this.#filaRepository.sair(entradaId, userId);
  }

  /**
   * Atualiza status de uma entrada da fila.
   * @param {string} entradaId
   * @param {string} novoStatus
   * @returns {Promise<object>}
   */
  async atualizarStatusEntrada(entradaId, novoStatus) {
    const rId = InputValidator.uuid(entradaId);
    if (!rId.ok) throw Object.assign(new Error(rId.msg), { status: 400 });

    const rStatus = InputValidator.enumValido(novoStatus, FilaService.#STATUS_VALIDOS);
    if (!rStatus.ok) throw Object.assign(new Error(`status: ${rStatus.msg}`), { status: 400 });

    return this.#filaRepository.atualizarStatus(entradaId, novoStatus);
  }
}

module.exports = FilaService;
