'use strict';

// =============================================================
// ConfirmP2PService.js — Cache P2P de confirmações de corte.
//
// Responsabilidade ÚNICA: armazenar confirmações pendentes no lado
// do barbeiro e entregá-las ao cliente via Supabase Realtime Broadcast
// quando ele abrir o app e entrar na página da barbearia.
//
// Fluxo:
//   Barbeiro: armazenarParaCliente() grava { entradaId } por clientId.
//             iniciarBarber() escuta o canal e responde a 'pull'.
//
//   Cliente:  tentarPull() envia 'pull', aguarda 'push' do barbeiro,
//             ao receber: sinaliza 'done' → barbeiro limpa cache →
//             Promise resolve com { entradaId }.
//
// Canal Supabase Realtime Broadcast: confirm-pull:{shopId}
// Mensagens:
//   pull  { clientId }              — cliente solicita dado pendente
//   push  { clientId, entradaId }   — barbeiro responde com o dado
//   done  { clientId }              — cliente confirma entrega (libera cache)
//
// Dependências: SupabaseService
// =============================================================

class ConfirmP2PService {

  // ── Estado estático ─────────────────────────────────────────
  /** @type {Map<string, {entradaId:string, shopId:string, ts:number}>} */
  static #cache  = new Map();
  static #canal  = null;  // canal persistente (lado barbeiro)
  static #shopId = null;  // shopId do canal ativo

  // ═══════════════════════════════════════════════════════════
  // LADO BARBEIRO
  // ═══════════════════════════════════════════════════════════

  /**
   * Armazena uma confirmação pendente para o cliente indicado.
   * Chamado após cada promoção para in_service em CadeiraService.sentar().
   *
   * @param {string} clientId  UUID do cliente
   * @param {string} entradaId UUID da queue_entry
   * @param {string} shopId    UUID da barbearia
   */
  static armazenarParaCliente(clientId, entradaId, shopId) {
    if (!clientId || !entradaId || !shopId) return;
    ConfirmP2PService.#cache.set(clientId, { entradaId, shopId, ts: Date.now() });
  }

  /**
   * Inicia o listener do barbeiro no canal Realtime.
   * Responde a 'pull' com 'push'. Limpa cache ao receber 'done'.
   * Idempotente: não reconecta se o shopId não mudou.
   * NOTA: para apenas o canal anterior — o cache é preservado.
   *       Para limpar tudo (logout), usar pararBarber().
   *
   * @param {string} shopId
   */
  static iniciarBarber(shopId) {
    if (!shopId) return;
    if (ConfirmP2PService.#canal && ConfirmP2PService.#shopId === shopId) return;

    // Para apenas o canal anterior — mantém #cache intacto
    if (ConfirmP2PService.#canal) {
      try { ConfirmP2PService.#canal.unsubscribe(); } catch (_) {}
      ConfirmP2PService.#canal = null;
    }
    ConfirmP2PService.#shopId = shopId;

    const canal = SupabaseService.channel(`confirm-pull:${shopId}`)
      .on('broadcast', { event: 'pull' }, ({ payload }) => {
        const { clientId } = payload ?? {};
        if (!clientId) return;
        const dados = ConfirmP2PService.#cache.get(clientId);
        if (!dados) return;
        canal.send({
          type:    'broadcast',
          event:   'push',
          payload: { clientId, entradaId: dados.entradaId },
        }).catch(() => {});
      })
      .on('broadcast', { event: 'done' }, ({ payload }) => {
        const { clientId } = payload ?? {};
        if (clientId) ConfirmP2PService.#cache.delete(clientId);
      })
      .subscribe();

    ConfirmP2PService.#canal = canal;
  }

  /**
   * Para o listener do barbeiro e limpa todo o cache.
   * Chamado no logout ou ao destruir a sessão do barbeiro.
   */
  static pararBarber() {
    if (ConfirmP2PService.#canal) {
      try { ConfirmP2PService.#canal.unsubscribe(); } catch (_) {}
      ConfirmP2PService.#canal = null;
    }
    ConfirmP2PService.#shopId = null;
    ConfirmP2PService.#cache.clear();
  }

  // ═══════════════════════════════════════════════════════════
  // LADO CLIENTE
  // ═══════════════════════════════════════════════════════════

  /**
   * Tenta obter do barbeiro o dado de confirmação pendente via P2P.
   * Cria canal temporário, envia 'pull', aguarda 'push' por `timeout` ms.
   * Ao receber 'push', envia 'done' automaticamente (libera cache do barbeiro).
   *
   * @param {string} shopId
   * @param {string} clientId
   * @param {number} [timeout=2000]
   * @returns {Promise<{entradaId:string}|null>}
   */
  static tentarPull(shopId, clientId, timeout = 2000) {
    if (!shopId || !clientId) return Promise.resolve(null);

    return new Promise(resolve => {
      let resolvido = false;
      let timer;

      const concluir = (resultado) => {
        if (resolvido) return;
        resolvido = true;
        clearTimeout(timer);
        resolve(resultado);
      };

      const canal = SupabaseService.channel(`confirm-pull:${shopId}`)
        .on('broadcast', { event: 'push' }, ({ payload }) => {
          if (payload?.clientId !== clientId) return;
          // Sinaliza ao barbeiro que o dado foi recebido — libera o cache
          canal.send({
            type:    'broadcast',
            event:   'done',
            payload: { clientId },
          }).catch(() => {}).finally(() => {
            try { canal.unsubscribe(); } catch (_) {}
          });
          concluir({ entradaId: payload.entradaId });
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          canal.send({
            type:    'broadcast',
            event:   'pull',
            payload: { clientId },
          }).catch(() => {});
        });

      timer = setTimeout(() => {
        try { canal.unsubscribe(); } catch (_) {}
        concluir(null);
      }, timeout);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS DE TESTE (prefixo _)
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna a entrada do cache para um clientId (uso em testes).
   * @param {string} clientId
   * @returns {{entradaId:string, shopId:string, ts:number}|null}
   */
  static _getCacheEntry(clientId) {
    return ConfirmP2PService.#cache.get(clientId) ?? null;
  }
}
