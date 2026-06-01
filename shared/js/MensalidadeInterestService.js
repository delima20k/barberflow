'use strict';

class MensalidadeInterestService {
  static #emEnvio = new Set();

  /**
   * Envia interesse no plano mensal pelo chat interno persistente da BFF.
   * O P2P textual atual nao persiste nem cobre offline; este fluxo usa BFF/outbox
   * como fonte de verdade e fica preparado para entrega P2P futura apos persistir.
   * @param {object} params
   * @param {string} params.barbershopId
   * @param {string} params.planName
   * @param {number} params.monthlyPrice
   * @param {HTMLButtonElement} params.btn
   * @param {Function} [params.onSuccess]
   */
  static async enviar({ barbershopId, planName = 'Plano Mensalidade', monthlyPrice = null, btn = null, onSuccess = null } = {}) {
    const router = (typeof App !== 'undefined' && App) || (typeof Pro !== 'undefined' && Pro) || null;
    if (typeof AuthGuard !== 'undefined' && !AuthGuard.permitirAcao('mensagem', router)) return;
    if (!barbershopId || typeof BffApiService === 'undefined') return;
    if (MensalidadeInterestService.#emEnvio.has(barbershopId)) return;

    MensalidadeInterestService.#emEnvio.add(barbershopId);
    const textoOriginal = btn?.textContent ?? '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Enviando...';
    }

    try {
      const userId = await MensalidadeInterestService.#obterUserId();
      const payload = {
        clientMessageId: MensalidadeInterestService.#clientMessageId(barbershopId, userId),
        planName,
        monthlyPrice,
      };
      const { data, error } = await BffApiService.barbearias.enviarInteresseMensalidade(barbershopId, payload);
      if (error) throw error;

      const conversationId = data?.conversationId;
      if (conversationId) {
        try { sessionStorage.setItem('bf_open_conversation_id', conversationId); } catch {}
      }
      if (typeof onSuccess === 'function') onSuccess(data);
      router?.nav?.('mensagens');
      setTimeout(() => {
        if (conversationId && typeof MessagesWidget !== 'undefined') {
          const abrir = MessagesWidget.abrirConversaPersistida ?? MessagesWidget.abrirModal;
          abrir?.call(MessagesWidget, conversationId);
        }
      }, 160);
    } catch (err) {
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Nao foi possivel enviar o interesse',
          err?.message || 'Tente novamente.',
          NotificationService.TIPOS?.ERRO || NotificationService.TIPOS?.SISTEMA,
        );
      } else if (typeof LoggerService !== 'undefined') {
        LoggerService.warn('[MensalidadeInterestService] envio falhou:', err?.message ?? err);
      }
      throw err;
    } finally {
      MensalidadeInterestService.#emEnvio.delete(barbershopId);
      if (btn) {
        btn.disabled = false;
        btn.textContent = textoOriginal || 'Tenho interesse no plano';
      }
    }
  }

  static async #obterUserId() {
    try {
      if (typeof SupabaseService !== 'undefined' && typeof SupabaseService.getUser === 'function') {
        const user = await SupabaseService.getUser();
        return user?.id ?? 'anon';
      }
    } catch {}
    return 'anon';
  }

  static #clientMessageId(barbershopId, userId) {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const shopPart = String(barbershopId ?? '').slice(0, 8);
    const userPart = String(userId ?? 'anon').slice(0, 8);
    return `mensalidade:${shopPart}:${userPart}:${random}`.slice(0, 80);
  }
}
