'use strict';

// =============================================================
// FilaPresencaService.js — Orquestra a confirmação de presença
//                          física do cliente ao entrar na fila
//                          (status = waiting).
//
// Responsabilidade ÚNICA: logo após ClienteController.entrarNaFila(),
// perguntar "Você já está na barbearia?" via FluxoDeFila, persistir
// a resposta em queue_entries.client_confirmed e notificar o barbeiro.
//
// Fluxo:
//   1. BarbeariaPage chama iniciarFluxo(entradaId, shopData, professionalId)
//   2. Abre modal via FluxoDeFila.abrir(QueueModalPayloadBuilder.montarPayloadPresencaFisica)
//   3. "Sim" → updateClientConfirmed('yes') + notif 'client_at_shop' + toast
//   4. "Não" → updateClientConfirmed('arriving') + toast "5 min" + timer 5 min
//   5. Timer dispara → _dispararGrace() → notif 'client_arriving_late'
//
// Métodos públicos de teste (prefixo _): _dispararGrace
//
// Dependências: FluxoDeFila, QueueModalPayloadBuilder, QueueRepository,
//               ApiService, AuthService, NotificationService, LoggerService
// =============================================================

class FilaPresencaService {

  // ── Estado estático ──────────────────────────────────────────
  // entradaIds em que o modal já foi exibido — impede double-open
  static #processadas = new Set();

  // entradaId → timeoutId — timer de grace de 5 min ("estou chegando")
  static #timers = new Map();

  // ── Constantes ───────────────────────────────────────────────
  static #GRACE_MS = 5 * 60 * 1000; // 5 minutos


  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o fluxo de confirmação de presença física.
   * Guard: ignora se a entrada já foi processada.
   *
   * @param {string}      entradaId    — UUID da queue_entry
   * @param {object|null} shopData     — { id, name } da barbearia
   * @param {string}      professionalId — UUID do barbeiro selecionado
   * @returns {Promise<void>}
   */
  static async iniciarFluxo(entradaId, shopData, professionalId) {
    if (!entradaId) return;
    if (FilaPresencaService.#processadas.has(entradaId)) return;

    FilaPresencaService.#processadas.add(entradaId);

    const perfil        = typeof AuthService !== 'undefined' ? AuthService.getPerfil() : null;
    const clienteNome   = perfil?.full_name ?? 'você';
    const nomeBarbearia = shopData?.name ?? null;
    const barbershopId  = shopData?.id   ?? null;

    const config = QueueModalPayloadBuilder.montarPayloadPresencaFisica({ nomeBarbearia, clienteNome });

    let resposta;
    try {
      resposta = await FluxoDeFila.abrir(config);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[FilaPresencaService] modal indisponível:', err?.message);
      }
      return;
    }

    if (resposta === 'sim') {
      await FilaPresencaService.#processarSim(entradaId, professionalId, barbershopId);
    } else if (resposta === 'nao') {
      await FilaPresencaService.#processarNao(entradaId, professionalId, barbershopId, clienteNome);
    }
    // resposta null (modal fechado sem escolha) → sem ação, entry permanece em #processadas
  }

  /**
   * Cancela todos os timers pendentes e limpa estado.
   * Chamado no logout do app cliente.
   */
  static parar() {
    for (const [, timerId] of FilaPresencaService.#timers) {
      clearTimeout(timerId);
    }
    FilaPresencaService.#timers.clear();
    FilaPresencaService.#processadas.clear();
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Helper de teste (prefixo _)
  // ═══════════════════════════════════════════════════════════

  /**
   * Dispara manualmente o grace period (para testes sem timer real).
   * Em produção, chamado pelo callback do setTimeout.
   *
   * @param {string} entradaId
   * @param {string} professionalId
   * @param {string} barbershopId
   */
  static _dispararGrace(entradaId, professionalId, barbershopId) {
    FilaPresencaService.#cancelarTimer(entradaId);
    FilaPresencaService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_arriving_late',
      entradaId
    ).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Fluxo da resposta "Sim, já estou na barbearia".
   * Persiste 'yes', notifica barbeiro e exibe toast.
   */
  static async #processarSim(entradaId, professionalId, barbershopId) {
    try {
      await QueueRepository.updateClientConfirmed(entradaId, 'yes');
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[FilaPresencaService] updateClientConfirmed falhou:', err?.message);
      }
    }

    await FilaPresencaService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_at_shop',
      entradaId
    );

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Confirmado!',
        'O barbeiro foi notificado que você está na barbearia.',
        NotificationService.TIPOS.AGENDAMENTO
      );
    }
  }

  /**
   * Fluxo da resposta "Estou chegando".
   * Persiste 'arriving', exibe toast e agenda timer de 5 min.
   */
  static async #processarNao(entradaId, professionalId, barbershopId) {
    try {
      await QueueRepository.updateClientConfirmed(entradaId, 'arriving');
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[FilaPresencaService] updateClientConfirmed falhou:', err?.message);
      }
    }

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Ok, estamos te esperando!',
        'Você tem até 5 minutos para chegar.',
        NotificationService.TIPOS.SISTEMA
      );
    }

    const timerId = setTimeout(() => {
      FilaPresencaService._dispararGrace(entradaId, professionalId, barbershopId);
    }, FilaPresencaService.#GRACE_MS);

    FilaPresencaService.#timers.set(entradaId, timerId);
  }

  /**
   * Insere notificação em `notifications` para o barbeiro.
   * Silencia erros — a notificação é best-effort.
   *
   * @param {string|null} professionalId
   * @param {string|null} barbershopId
   * @param {string}      type — 'client_at_shop' | 'client_arriving_late'
   * @param {string}      entradaId
   */
  static async #notificarBarbeiro(professionalId, barbershopId, type, entradaId) {
    if (!professionalId) return;
    try {
      await ApiService.from('notifications').insert({
        user_id:       professionalId,
        barbershop_id: barbershopId,
        type,
        dados:         { entry_id: entradaId, tipo_acao: type },
      });
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[FilaPresencaService] notificarBarbeiro falhou:', err?.message);
      }
    }
  }

  /**
   * Cancela e remove o timer de um entradaId específico.
   * @param {string} entradaId
   */
  static #cancelarTimer(entradaId) {
    const id = FilaPresencaService.#timers.get(entradaId);
    if (id !== undefined) {
      clearTimeout(id);
      FilaPresencaService.#timers.delete(entradaId);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilaPresencaService;
}
