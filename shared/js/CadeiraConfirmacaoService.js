'use strict';

// =============================================================
// CadeiraConfirmacaoService.js — Orquestra o fluxo de confirmação
//                                de presença do cliente na cadeira
//                                de produção (in_service).
//
// Responsabilidade ÚNICA: gerenciar o ciclo de vida da confirmação
// de presença — modal, timer de grace, chamada RPC e estado.
//
// Fluxo:
//   1. QueuePoller detecta in_service → chama iniciarFluxo(entradaId, nome)
//   2. Toca som, abre ConfirmacaoCorteModal
//   3. "Sim" → RPC(confirmado=true) → entry em #processadas
//   4. "Não" → RPC(grace_used=false) → agenda timer 5min → entry em #graceAtivo
//   5. Timer dispara → chama _dispararGrace() → RPC(grace_used=true)
//
// Métodos públicos de teste (prefixo _): temTimer, _dispararGrace
//
// Dependências: ConfirmacaoCorteModal, ApiService, QueuePoller (opcional)
// =============================================================

class CadeiraConfirmacaoService {

  // ── Estado estático ─────────────────────────────────────────
  // entradaIds já confirmadas ou finalizadas — não reabrir modal
  static #processadas = new Set();

  // entradaId → timeoutId — timer do grace period de 5 min
  static #timers = new Map();

  // entradaIds que tiveram o 1º "Não" — próxima chamada usa grace_used=true
  static #graceAtivo = new Set();

  // ── Constantes ──────────────────────────────────────────────
  static #GRACE_MS = 5 * 60 * 1000; // 5 minutos

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o fluxo de confirmação de presença para o cliente.
   * Guard: ignora se a entrada já foi processada (confirmada ou em grace).
   *
   * @param {string}      entradaId   UUID da queue_entry
   * @param {string}      clienteNome nome exibido no modal
   * @param {string|null} [shopLogoUrl=null] URL pública do logo da barbearia
   * @returns {Promise<void>}
   */
  static async iniciarFluxo(entradaId, clienteNome, shopLogoUrl = null) {
    if (!entradaId) return;
    if (CadeiraConfirmacaoService.#processadas.has(entradaId)) return;
    if (CadeiraConfirmacaoService.#graceAtivo.has(entradaId)) return;

    // Toca chime (MP3 via QueuePoller)
    if (typeof QueuePoller !== 'undefined' && typeof QueuePoller.tocarSom === 'function') {
      QueuePoller.tocarSom();
    }

    // Marca como processada antes do await para evitar race em polling duplo
    CadeiraConfirmacaoService.#processadas.add(entradaId);

    let resposta;
    try {
      resposta = await ConfirmacaoCorteModal.abrir({ clienteNome, shopLogoUrl });
    } catch (err) {
      // Modal não disponível (SSR, testes sem DOM) — silencia
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[CadeiraConfirmacaoService] modal indisponível:', err?.message);
      }
      return;
    }

    await CadeiraConfirmacaoService.#processarResposta(entradaId, clienteNome, shopLogoUrl, resposta);
  }

  /**
   * Cancela o timer de grace e limpa o estado de uma ou todas as entradas.
   * Chamado quando: barbeiro finalizou o atendimento, cliente saiu da fila,
   * ou app cliente desmontou a tela.
   *
   * @param {string} [entradaId]  UUID específico; omitir para limpar tudo
   */
  static parar(entradaId) {
    if (entradaId !== undefined) {
      CadeiraConfirmacaoService.#cancelarTimer(entradaId);
      CadeiraConfirmacaoService.#processadas.delete(entradaId);
      CadeiraConfirmacaoService.#graceAtivo.delete(entradaId);
    } else {
      // Limpa tudo
      for (const id of CadeiraConfirmacaoService.#timers.keys()) {
        CadeiraConfirmacaoService.#cancelarTimer(id);
      }
      CadeiraConfirmacaoService.#processadas.clear();
      CadeiraConfirmacaoService.#graceAtivo.clear();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Helpers de teste (prefixo _)
  // ═══════════════════════════════════════════════════════════

  /**
   * Verifica se há timer ativo para a entrada (uso em testes).
   * @param {string} entradaId
   * @returns {boolean}
   */
  static temTimer(entradaId) {
    return CadeiraConfirmacaoService.#timers.has(entradaId);
  }

  /**
   * Dispara manualmente o grace period (para testes sem timer real).
   * Em produção este callback é chamado pelo setTimeout interno.
   * @param {string} entradaId
   * @param {string} clienteNome
   */
  static _dispararGrace(entradaId, clienteNome, shopLogoUrl = null) {
    CadeiraConfirmacaoService.#cancelarTimer(entradaId);
    CadeiraConfirmacaoService.#graceAtivo.delete(entradaId);
    // Remove de processadas para permitir novo fluxo (com grace_used=true)
    CadeiraConfirmacaoService.#processadas.delete(entradaId);
    // Chama o fluxo com o grace já marcado
    CadeiraConfirmacaoService.#iniciarFluxoComGrace(entradaId, clienteNome, shopLogoUrl);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Processa a resposta do modal e executa a ação adequada.
   * @param {string}      entradaId
   * @param {string}      clienteNome
   * @param {string|null} shopLogoUrl
   * @param {'sim'|'nao'} resposta
   */
  static async #processarResposta(entradaId, clienteNome, shopLogoUrl, resposta) {
    if (resposta === 'sim') {
      await CadeiraConfirmacaoService.#chamarRpc(entradaId, true, false);
      // Mantém em #processadas — não reabre modal
      return;
    }

    // Resposta "nao" — 1ª vez
    await CadeiraConfirmacaoService.#chamarRpc(entradaId, false, false);

    // Agenda grace de 5 minutos
    CadeiraConfirmacaoService.#graceAtivo.add(entradaId);
    const timerId = setTimeout(() => {
      CadeiraConfirmacaoService._dispararGrace(entradaId, clienteNome, shopLogoUrl);
    }, CadeiraConfirmacaoService.#GRACE_MS);
    CadeiraConfirmacaoService.#timers.set(entradaId, timerId);
  }

  /**
   * Abre modal novamente após expirar o grace, usando grace_used=true.
   * @param {string}      entradaId
   * @param {string}      clienteNome
   * @param {string|null} shopLogoUrl
   */
  static async #iniciarFluxoComGrace(entradaId, clienteNome, shopLogoUrl = null) {
    // Toca chime novamente para chamar a atenção
    if (typeof QueuePoller !== 'undefined' && typeof QueuePoller.tocarSom === 'function') {
      QueuePoller.tocarSom();
    }

    CadeiraConfirmacaoService.#processadas.add(entradaId);

    let resposta;
    try {
      resposta = await ConfirmacaoCorteModal.abrir({ clienteNome, shopLogoUrl });
    } catch {
      return;
    }

    // Independente da resposta: RPC com grace_used=true (já notificou barbeiro server-side)
    await CadeiraConfirmacaoService.#chamarRpc(entradaId, resposta === 'sim', true);
  }

  /**
   * Chama a RPC confirmar_presenca_cliente via ApiService.
   * @param {string}  entradaId
   * @param {boolean} confirmado
   * @param {boolean} graceUsado
   */
  static async #chamarRpc(entradaId, confirmado, graceUsado) {
    try {
      const { error } = await ApiService.rpc('confirmar_presenca_cliente', {
        p_entry_id:   entradaId,
        p_confirmado: confirmado,
        p_grace_used: graceUsado,
      });
      if (error && typeof LoggerService !== 'undefined') {
        LoggerService.warn('[CadeiraConfirmacaoService] RPC error:', error?.message);
      }
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.error('[CadeiraConfirmacaoService] RPC exception:', err?.message);
      }
    }
  }

  /**
   * Cancela e remove o timer de grace para uma entrada.
   * @param {string} entradaId
   */
  static #cancelarTimer(entradaId) {
    const timerId = CadeiraConfirmacaoService.#timers.get(entradaId);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      CadeiraConfirmacaoService.#timers.delete(entradaId);
    }
  }
}
