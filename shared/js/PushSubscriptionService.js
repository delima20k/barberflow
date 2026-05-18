'use strict';

// =============================================================
// PushSubscriptionService.js — Web Push Subscription (POO, static)
//
// Responsabilidades:
//   - Registrar subscription Web Push via PushManager
//   - Renovar subscription existente (endpoint pode mudar após update do browser)
//   - Revogar subscription no logout
//   - Persistir device_id único por dispositivo
//   - Salvar/remover subscriptions via Edge Function Supabase
//
// Dependências:
//   - navigator.serviceWorker (Service Worker API)
//   - window.PushManager (Push API)
//   - window.Notification (Notification API)
//   - SupabaseService.getSession() — para obter o JWT do usuário
//   - LoggerService.warn()
//
// Uso:
//   1. Após login + SW registrado:
//      await PushSubscriptionService.init(userId, 'cliente')
//   2. No logout:
//      await PushSubscriptionService.revogar()
//
// Setup inicial (uma vez por deploy):
//   node scripts/gerar-vapid-keys.js
//   ⚠️ Substituir #VAPID_PUBLIC pela chave pública gerada
// =============================================================

class PushSubscriptionService {

  // ── Configuração ──────────────────────────────────────────

  // ⚠️ VAPID public key gerada por: node scripts/gerar-vapid-keys.js
  // Par correspondente deve estar em Supabase Secrets: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
  static #VAPID_PUBLIC = 'BMSj25ewklWOCZO25BHOh-o3a5VZ1C7IJfyzrxIn0MB4AH_Ai8rLO981WS5owSPQ4AIC_DUsAy46wh1UFBML_10';

  static #EDGE_SUBS = 'https://jfvjisqnzapxxagkbxcu.supabase.co/functions/v1/push-subscriptions';
  static #LS_DEVICE = 'bf_device_id';

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — Ciclo de vida
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicializa o serviço: verifica suporte, permissão e registra/renova subscription.
   * Chamar após login do usuário e após o SW estar registrado.
   *
   * @param {string} userId  — UUID do usuário autenticado
   * @param {'cliente'|'profissional'} appId
   */
  static async init(userId, appId) {
    if (!PushSubscriptionService.#suportado()) return;
    if (!userId) return;
    if (Notification.permission !== 'granted') return;

    try {
      const reg = await navigator.serviceWorker.ready;
      await PushSubscriptionService.renovar(reg, userId, appId);
    } catch (err) {
      LoggerService.warn('[PushSubscriptionService] init falhou:', err?.message);
    }
  }

  /**
   * Verifica se já há uma subscription ativa. Se sim, renova no backend.
   * Se não, cria uma nova via registrar().
   *
   * @param {ServiceWorkerRegistration} swReg
   * @param {string} userId
   * @param {'cliente'|'profissional'} appId
   */
  static async renovar(swReg, userId, appId) {
    const sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      await PushSubscriptionService.registrar(swReg, userId, appId);
      return;
    }

    // Re-registra se a subscription está expirada ou expira dentro de 24 horas.
    // A maioria dos browsers retorna null (sem expiração), mas Chrome retorna um timestamp.
    const JANELA_RENOVACAO_MS = 24 * 60 * 60 * 1000; // 24h antecipação
    if (sub.expirationTime !== null && sub.expirationTime <= Date.now() + JANELA_RENOVACAO_MS) {
      try { await sub.unsubscribe(); } catch { /* ignorar — apenas limpa o estado local */ }
      await PushSubscriptionService.registrar(swReg, userId, appId);
      return;
    }

    // Subscription válida — atualiza last_used_at no backend
    await PushSubscriptionService.#salvarNoBackend(sub, userId, appId);
  }

  /**
   * Cria uma nova subscription PushManager e salva no backend.
   *
   * @param {ServiceWorkerRegistration} swReg
   * @param {string} userId
   * @param {'cliente'|'profissional'} appId
   * @returns {Promise<PushSubscription>}
   */
  static async registrar(swReg, userId, appId) {
    const sub = await swReg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: PushSubscriptionService.#urlBase64ToUint8Array(
        PushSubscriptionService.#VAPID_PUBLIC,
      ),
    });
    console.log('[Push] subscription criada ✓', sub.endpoint.slice(0, 50) + '...');
    await PushSubscriptionService.#salvarNoBackend(sub, userId, appId);
    return sub;
  }

  /**
   * Remove a subscription ativa (logout).
   * Chama unsubscribe() no browser e DELETE no backend.
   */
  static async revogar() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await PushSubscriptionService.#deletarNoBackend(endpoint);
    } catch (err) {
      LoggerService.warn('[PushSubscriptionService] revogar falhou:', err?.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Backend
  // ═══════════════════════════════════════════════════════════

  static async #salvarNoBackend(sub, userId, appId) {
    const token = await PushSubscriptionService.#getToken();
    if (!token) return;

    try {
      const json = sub.toJSON();
      const res  = await fetch(PushSubscriptionService.#EDGE_SUBS, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint:       sub.endpoint,
          p256dh:         json.keys?.p256dh ?? '',
          auth:           json.keys?.auth   ?? '',
          deviceId:       PushSubscriptionService.#getDeviceId(),
          appId,
          expirationTime: sub.expirationTime ?? null,
        }),
      });
      if (!res.ok) {
        LoggerService.warn('[PushSubscriptionService] backend retornou', res.status);
      } else {
        console.log('[Push] subscription salva no backend ✓');
      }
    } catch (err) {
      // Erro de rede ou CORS — não crítico, subscription já está ativa no browser
      LoggerService.warn('[PushSubscriptionService] salvarNoBackend falhou:', err?.message);
    }
  }

  static async #deletarNoBackend(endpoint) {
    const token = await PushSubscriptionService.#getToken();
    if (!token) return;

    try {
      await fetch(PushSubscriptionService.#EDGE_SUBS, {
        method:  'DELETE',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ endpoint }),
      });
    } catch (err) {
      LoggerService.warn('[PushSubscriptionService] deletarNoBackend falhou:', err?.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Helpers
  // ═══════════════════════════════════════════════════════════

  static async #getToken() {
    try {
      const session = await SupabaseService.getSession();
      return session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Retorna o device ID persistido em localStorage.
   * Cria um UUID aleatório na primeira chamada.
   */
  static #getDeviceId() {
    try {
      let id = localStorage.getItem(PushSubscriptionService.#LS_DEVICE);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(PushSubscriptionService.#LS_DEVICE, id);
      }
      return id;
    } catch {
      return null;
    }
  }

  /**
   * Converte VAPID public key de base64url para Uint8Array.
   * Necessário para PushManager.subscribe({ applicationServerKey }).
   * @param {string} base64String
   * @returns {Uint8Array}
   */
  static #urlBase64ToUint8Array(base64String) {
    const pad = '='.repeat((4 - (base64String.length % 4)) % 4);
    const raw = atob(base64String.replace(/-/g, '+').replace(/_/g, '/') + pad);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  /**
   * Verifica se o browser suporta Push API.
   * Requer: ServiceWorker + PushManager + Notification.
   * @returns {boolean}
   */
  static #suportado() {
    return (
      'serviceWorker' in navigator &&
      typeof PushManager !== 'undefined' &&
      'Notification'  in window
    );
  }
}
