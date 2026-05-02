'use strict';

// =============================================================
// FilaController.js — Controle de entrada e estado da fila.
//
// Responsabilidade ÚNICA: gerenciar a entrada de um cliente
// na fila de atendimento e consultar o estado atual.
//
// CAMADA: application — sem acesso ao DOM.
// Quem chama (interfaces) é responsável por re-renders.
//
// Diferença de CadeiraService:
//   CadeiraService — dono senta um cliente (pode ser in_service)
//   FilaController — cliente entra por conta própria (sempre waiting)
//
// Dependências: QueueRepository.js, InputValidator.js, LoggerService.js
// =============================================================

class FilaController {

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna a fila ativa (waiting + in_service) de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  static async getFilaAtiva(barbershopId) {
    return QueueRepository.getByBarbershop(barbershopId);
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Adiciona um cliente na fila com status='waiting'.
   * Calcula automaticamente a próxima posição.
   *
   * @param {object} opts
   * @param {string}   opts.barbershopId
   * @param {string}   opts.clientId
   * @param {string}   [opts.professionalId]   UUID do barbeiro preferido
   * @param {string[]} [opts.serviceIds]        IDs dos serviços escolhidos
   * @returns {Promise<object>}  entrada criada
   */
  static async entrarNaFila({ barbershopId, clientId, professionalId = null, serviceIds = [] }) {
    const rShop = InputValidator.uuid(barbershopId);
    const rCli  = InputValidator.uuid(clientId);
    if (!rShop.ok) throw new TypeError(`[FilaController] barbershopId: ${rShop.msg}`);
    if (!rCli.ok)  throw new TypeError(`[FilaController] clientId: ${rCli.msg}`);

    if (professionalId) {
      const rProf = InputValidator.uuid(professionalId);
      if (!rProf.ok) throw new TypeError(`[FilaController] professionalId: ${rProf.msg}`);
    }

    // Calcula próxima posição com base na fila ativa atual
    const filaAtual  = await FilaController.getFilaAtiva(barbershopId);
    const position   = FilaController.#calcularProximaPosicao(filaAtual);

    const payload = {
      barbershop_id: barbershopId,
      client_id:     clientId,
      position,
    };
    if (professionalId) payload.professional_id = professionalId;

    const entrada = await QueueRepository.entrar(payload);

    // Salva serviços escolhidos se houver (silencioso se tabela não existir)
    if (serviceIds.length) {
      await FilaController.#salvarServicos(entrada.id, barbershopId, serviceIds);
    }

    return entrada;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Calcula a próxima posição disponível na fila.
   * @param {object[]} fila — entradas ativas
   * @returns {number}
   */
  static #calcularProximaPosicao(fila) {
    const waiting = fila.filter(e => e.status === 'waiting');
    if (!waiting.length) return 1;
    return Math.max(...waiting.map(e => e.position ?? 0)) + 1;
  }

  /**
   * Persiste os serviços escolhidos para a entrada.
   * Silencioso: se a tabela não existir (404), ignora sem quebrar o fluxo.
   * @param {string}   entradaId
   * @param {string}   barbershopId
   * @param {string[]} serviceIds
   */
  static async #salvarServicos(entradaId, barbershopId, serviceIds) {
    try {
      const rows = serviceIds.map(sid => ({
        queue_entry_id: entradaId,
        barbershop_id:  barbershopId,
        service_id:     sid,
      }));
      await ApiService.from('queue_entry_services').insert(rows);
    } catch (err) {
      LoggerService.warn('[FilaController] #salvarServicos ignorado:', err?.message);
    }
  }
}
