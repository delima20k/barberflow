'use strict';

// =============================================================
// ChegadaProducaoService.js — Orquestra o fluxo de chegada do
//                             cliente na cadeira de produção.
//
// Responsabilidade ÚNICA: após o cliente selecionar os serviços,
// perguntar "Já está na barbearia ou a caminho?" via FluxoDeFila,
// criar a entrada em produção, prevenir modal duplicado do Realtime
// e notificar o barbeiro conforme a resposta.
//
// Fluxo:
//   1. BarbeariaPage chama iniciarFluxo(params) após abrirSelecaoServicos
//   2. FluxoDeFila.abrir(config) → 'aqui' | 'caminho' | null
//   3. null → retorna null (cliente cancelou)
//   4. sentar({ tipo:'producao', ... }) → entrada in_service
//   5. CadeiraConfirmacaoService.pular(entrada.id) — bloqueia modal Realtime
//   6. 'aqui':
//        - notificação 'client_at_shop' → QueueConfirmService exibe toast no profissional
//        - updateClientConfirmed('arriving') best-effort
//        - toast "Você está na cadeira!"
//   7. 'caminho':
//        - notificação 'client_not_seated' com client_not_seated:true
//          → MinhaBarbeariaPage.#onClienteAusente abre modal "aguardar / chamar próximo"
//        - updateClientConfirmed('arriving') best-effort
//        - toast "O barbeiro foi avisado"
//
// Dependências: FluxoDeFila, CadeiraService, CadeiraConfirmacaoService,
//               QueueRepository, ApiService, AuthService,
//               NotificationService, LoggerService
// =============================================================

class ChegadaProducaoService {

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o fluxo de chegada na cadeira de produção.
   *
   * @param {object}      params
   * @param {string}      params.barbershopId    UUID da barbearia
   * @param {string}      params.professionalId  UUID do barbeiro
   * @param {string|null} [params.clientId]      UUID do cliente logado
   * @param {string[]}    params.serviceIds      IDs dos serviços selecionados
   * @param {object|null} [params.shopData]      { id, name } da barbearia
   * @param {object|null} [params.clientePerfil] { id, full_name } do cliente
   * @returns {Promise<object|null>} entrada criada ou null se cancelado/erro
   */
  static async iniciarFluxo({ barbershopId, professionalId, clientId, serviceIds, shopData, clientePerfil } = {}) {
    if (!barbershopId || !professionalId) return null;

    const nomeBarbearia = shopData?.name ?? '';
    const config        = ChegadaProducaoService.#buildConfig(nomeBarbearia);

    let resposta;
    try {
      resposta = await FluxoDeFila.abrir(config);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChegadaProducaoService] modal indisponível:', err?.message);
      }
      return null;
    }

    if (!resposta) return null;

    let entrada;
    try {
      entrada = await CadeiraService.sentar({
        barbershopId,
        professionalId,
        clientId,
        serviceIds,
        tipo: 'producao',
        notificarCliente: false,
        // O barbeiro já é notificado logo abaixo por #processarAqui/#processarCaminho
        // (client_at_shop/client_not_seated), com texto que varia pelo status de
        // chegada. Sem isso, duas notificações separadas chegavam quase juntas
        // pro mesmo evento — a de "primeiro cliente sentou" (genérica, sem status)
        // e a de confirmação de chegada (com o status real).
        notificarBarbeiro: false,
      });
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.error('[ChegadaProducaoService] erro ao sentar em produção:', err);
      }
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Erro',
          err?.message ?? 'Não foi possível sentar na cadeira.',
          NotificationService.TIPOS.SISTEMA,
        );
      }
      return null;
    }

    // Bloqueia imediatamente a reabertura do modal pelo Realtime (QueueConfirmService)
    if (typeof CadeiraConfirmacaoService !== 'undefined' && entrada?.id) {
      CadeiraConfirmacaoService.pular(entrada.id);
    }

    const clienteNome = clientePerfil?.full_name ?? '';

    if (resposta === 'aqui') {
      await ChegadaProducaoService.#processarAqui(entrada.id, professionalId, barbershopId, clienteNome, clientId);
    } else if (resposta === 'caminho') {
      await ChegadaProducaoService.#processarCaminho(entrada.id, professionalId, barbershopId, clienteNome, clientId);
    }

    return entrada;
  }

  /**
   * Confirma a chegada do cliente quando este já está em estado 'arriving'.
   * Persiste client_confirmed='yes' e notifica o barbeiro via client_at_shop.
   * Best-effort: silencia erros (mesmos guardiões que #processarAqui).
   *
   * @param {object}      params
   * @param {string|null} params.entradaId
   * @param {string|null} params.professionalId
   * @param {string|null} params.barbershopId
   * @param {string}      [params.clienteNome='']
   * @returns {Promise<void>}
   */
  static async confirmarChegada({ entradaId, professionalId, barbershopId, clienteNome } = {}) {
    if (!entradaId) return;

    await ChegadaProducaoService.#persistirConfirmacao(entradaId, 'yes');

    await ChegadaProducaoService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_at_shop',
      entradaId,
      clienteNome ?? '',
    );

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Você está na barbearia!',
        'O barbeiro foi avisado da sua chegada.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  /**
   * Constrói o config para FluxoDeFila com as 2 opções de chegada.
   * @param {string} nomeBarbearia
   * @returns {object}
   */
  static #buildConfig(nomeBarbearia) {
    const nome = nomeBarbearia ? ` na ${FluxoDeFila.escapar(nomeBarbearia)}` : '';
    return {
      // id estável: garante o dedup do FluxoDeFila (remove overlay órfão +
      // keydown antes de reabrir). Sem id, uma reabertura sem fechar o
      // anterior vazaria listener no document. Ver FluxoDeFila.#criar.
      id:     'modal-chegada-producao',
      icone:  '🏠',
      titulo: 'Onde você está?',
      corpo:  `Confirme sua chegada${nome} para avisar o barbeiro.`,
      acoes:  [
        { label: '✅ Já estou na barbearia', valor: 'aqui',    variante: 'primario'   },
        { label: '🚶 Estou a caminho',       valor: 'caminho', variante: 'secundario' },
      ],
    };
  }

  /**
   * Fluxo da resposta "Já estou na barbearia".
   * Notifica barbeiro imediatamente, persiste 'arriving' best-effort e exibe toast.
   * @param {string} entradaId
   * @param {string} professionalId
   * @param {string} barbershopId
   * @param {string} clienteNome
   */
  static async #processarAqui(entradaId, professionalId, barbershopId, clienteNome, clienteId = null) {
    await ChegadaProducaoService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_at_shop',
      entradaId,
      clienteNome,
      clienteId,
    );

    await ChegadaProducaoService.#persistirConfirmacao(entradaId, 'arriving');

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Barbeiro notificado!',
        'Aguarde o barbeiro confirmar que você está na cadeira.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  /**
   * Fluxo da resposta "Estou a caminho".
   * Notifica barbeiro imediatamente, persiste 'arriving' best-effort e exibe toast.
   * @param {string} entradaId
   * @param {string} professionalId
   * @param {string} barbershopId
   * @param {string} clienteNome
   */
  static async #processarCaminho(entradaId, professionalId, barbershopId, clienteNome, clienteId = null) {
    await ChegadaProducaoService.#notificarBarbeiro(
      professionalId,
      barbershopId,
      'client_not_seated',
      entradaId,
      clienteNome,
      clienteId,
    );

    await ChegadaProducaoService.#persistirConfirmacao(entradaId, 'arriving');

    if (typeof NotificationService !== 'undefined') {
      NotificationService.mostrarToast(
        'Barbeiro avisado!',
        'Ele aguardará você chegar.',
        NotificationService.TIPOS.SISTEMA,
      );
    }
  }

  /**
   * Persiste client_confirmed na queue_entry.
   * Silencia erros — best-effort.
   * @param {string} entradaId
   * @param {'yes'|'arriving'} valor
   */
  static async #persistirConfirmacao(entradaId, valor) {
    try {
      await QueueRepository.updateClientConfirmed(entradaId, valor);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChegadaProducaoService] updateClientConfirmed falhou:', err?.message);
      }
    }
  }

  /**
   * Insere notificação para o barbeiro via RPC com SECURITY DEFINER.
   * O RPC `notificar_barbeiro_chegada` bypassa RLS, evitando 403 no insert
   * direto pela sessão autenticada do cliente.
   *
   * - type='client_at_shop':    data.tipo_acao → QueueConfirmService exibe toast
   * - type='client_not_seated': data.client_not_seated=true → MinhaBarbeariaPage abre modal
   *
   * Colunas do RPC: p_professional_id, p_type, p_title, p_body, p_data (JSONB)
   * barbershop_id vai DENTRO do JSONB p_data (lido por MinhaBarbeariaPage).
   * Silencia erros — best-effort.
   *
   * @param {string|null} professionalId
   * @param {string|null} barbershopId
   * @param {'client_at_shop'|'client_not_seated'} type
   * @param {string}      entradaId
   * @param {string}      clienteNome
   */
  static async #notificarBarbeiro(professionalId, barbershopId, type, entradaId, clienteNome, clienteId = null) {
    if (!professionalId) return;
    const nome      = clienteNome?.trim() || 'Cliente';
    const isCaminho = type === 'client_not_seated';

    const p_title = isCaminho ? 'Cliente a caminho' : 'Cliente na barbearia!';
    const p_body  = isCaminho
      ? `${nome} avisou que está a caminho.`
      : `${nome} confirmou que está na barbearia.`;

    const p_data  = isCaminho
      ? { client_not_seated: true, entry_id: entradaId, client_name: nome, barbershop_id: barbershopId }
      : { tipo_acao: type,         entry_id: entradaId, client_name: nome, barbershop_id: barbershopId };

    // Envia Web Push ao barbeiro via BFF antes do realtime.
    // O push não pode depender do RPC, pois a modal em segundo plano usa Web Push/VAPID.
    if (typeof BffApiService !== 'undefined') {
      try {
        const { data, error } = await BffApiService.post('/api/v1/notificacoes/push-barbeiro', {
          professionalId,
          entradaId,
          barbershopId,
          type,
          clienteNome: nome,
          statusLabel: isCaminho ? 'Cliente esta a caminho' : 'Cliente ja chegou',
          cadeira:     'Cadeira de producao',
          cliente:     { id: clienteId, nome },
        });

        if (error && typeof LoggerService !== 'undefined') {
          LoggerService.warn(
            '[ChegadaProducaoService] push-barbeiro falhou:',
            error?.status ? `status=${error.status}` : '',
            error?.message,
          );
        } else if (data?.ok === false && typeof LoggerService !== 'undefined') {
          LoggerService.warn(
            '[ChegadaProducaoService] push-barbeiro ok=false:',
            `reason=${data?.reason ?? 'unknown'}`,
            `destinatarios=${data?.data?.destinatarios ?? 0}`,
          );
        } else if (Number(data?.enviados ?? 0) === 0 && typeof LoggerService !== 'undefined') {
          LoggerService.warn(
            '[ChegadaProducaoService] push-barbeiro enviados=0:',
            `destinatarios=${data?.destinatarios ?? 0}`,
          );
        }
      } catch (err) {
        if (typeof LoggerService !== 'undefined') {
          LoggerService.warn('[ChegadaProducaoService] push-barbeiro falhou:', err?.message);
        }
      }
    }

    try {
      await ApiService.rpc('notificar_barbeiro_chegada', {
        p_professional_id: professionalId,
        p_type:            type,
        p_title,
        p_body,
        p_data,
      });
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[ChegadaProducaoService] notificarBarbeiro realtime falhou:', err?.message);
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChegadaProducaoService;
}
