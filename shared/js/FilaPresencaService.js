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
      await FilaPresencaService.#processarSim(entradaId, professionalId, barbershopId, clienteNome);
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
  static _dispararGrace(entradaId, professionalId, barbershopId, clienteNome = '') {
    FilaPresencaService.#cancelarTimer(entradaId);
    FilaPresencaService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_arriving_late',
      entradaId,
      clienteNome
    ).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Fluxo da resposta "Sim, já estou na barbearia".
   * Persiste 'yes', notifica barbeiro e exibe toast.
   */
  static async #processarSim(entradaId, professionalId, barbershopId, clienteNome = '') {
    await FilaPresencaService.#persistirConfirmacao(entradaId, 'yes');

    await FilaPresencaService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_at_shop',
      entradaId,
      clienteNome
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
  static async #processarNao(entradaId, professionalId, barbershopId, clienteNome = '') {
    await FilaPresencaService.#persistirConfirmacao(entradaId, 'arriving');

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Ok, estamos te esperando!',
        'Você tem até 5 minutos para chegar.',
        NotificationService.TIPOS.SISTEMA
      );
    }

    const timerId = setTimeout(() => {
      FilaPresencaService._dispararGrace(entradaId, professionalId, barbershopId, clienteNome);
    }, FilaPresencaService.#GRACE_MS);

    FilaPresencaService.#timers.set(entradaId, timerId);
  }

  /**
   * Persiste o valor de client_confirmed na fila.
   * Silencia erros — a operação é best-effort; o estado local continua independente.
   *
   * @param {string} entradaId
   * @param {'yes'|'arriving'} valor
   */
  static async #persistirConfirmacao(entradaId, valor) {
    try {
      await QueueRepository.updateClientConfirmed(entradaId, valor);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[FilaPresencaService] updateClientConfirmed falhou:', err?.message);
      }
    }
  }

  /**
   * Insere notificação para o barbeiro via RPC com SECURITY DEFINER.
   * O RPC `notificar_barbeiro_chegada` bypassa RLS, evitando 403 no insert
   * direto pela sessão autenticada do cliente.
   *
   * - type='client_at_shop':       data.tipo_acao → QueueConfirmService exibe toast
   * - type='client_arriving_late': data.barbershop_id → MinhaBarbeariaPage filtra barbearia
   *
   * Silencia erros — best-effort.
   *
   * @param {string|null} professionalId
   * @param {string|null} barbershopId
   * @param {'client_at_shop'|'client_arriving_late'} type
   * @param {string}      entradaId
   * @param {string}      [clienteNome='']
   */
  static async #notificarBarbeiro(professionalId, barbershopId, type, entradaId, clienteNome = '') {
    if (!professionalId) return;
    try {
      const nome         = clienteNome?.trim() || 'Cliente';
      const isAtShop     = type === 'client_at_shop';

      const p_title = isAtShop ? 'Cliente na barbearia!' : 'Cliente ainda a caminho';
      const p_body  = isAtShop
        ? `${nome} confirmou que está na barbearia.`
        : `${nome} ainda não chegou. Aguardando...`;

      const p_data  = {
        tipo_acao:    type,
        entry_id:     entradaId,
        client_name:  nome,
        barbershop_id: barbershopId,
      };

      await ApiService.rpc('notificar_barbeiro_chegada', {
        p_professional_id: professionalId,
        p_type:            type,
        p_title,
        p_body,
        p_data,
      });

      // Envia Web Push ao barbeiro via BFF (fire-and-forget).
      // client_arriving_late mapeado para client_not_seated (tipo aceito pelo BFF).
      if (typeof BffApiService !== 'undefined') {
        const bffType = type === 'client_at_shop' ? 'client_at_shop' : 'client_not_seated';
        BffApiService.post('/api/v1/notificacoes/push-barbeiro', {
          professionalId,
          entradaId,
          barbershopId,
          type:        bffType,
          clienteNome: nome,
        }).then(({ error }) => {
          if (error && typeof LoggerService !== 'undefined') {
            LoggerService.warn('[FilaPresencaService] push-barbeiro falhou:', error?.message);
          }
        }).catch(() => {});
      }
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
