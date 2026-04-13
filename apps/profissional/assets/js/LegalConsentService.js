'use strict';

// =============================================================
// LegalConsentService.js — Aceite legal do profissional
// App: apps/profissional
// Dependência: SupabaseService.js (carregado antes)
// =============================================================

class LegalConsentService {

  /** Versão atual dos termos. Incrementar quando os termos mudarem. */
  static #VERSAO_ATUAL = 1;

  /** Chave sessionStorage para evitar re-verificação na mesma sessão */
  static #CACHE_KEY = 'bf_termos_aceitos';

  // ──────────────────────────────────────────────────────────
  // VERIFICAR ACEITE
  // ──────────────────────────────────────────────────────────

  /**
   * Verifica se o usuário já aceitou os termos da versão atual.
   * Usa sessionStorage como cache para evitar chamadas repetidas.
   *
   * @param {string} userId — UUID do usuário autenticado
   * @returns {Promise<boolean>}
   */
  static async verificarAceite(userId) {
    if (!userId) return false;

    // Cache de sessão — já verificado nessa aba
    if (sessionStorage.getItem(LegalConsentService.#CACHE_KEY) === '1') {
      return true;
    }

    try {
      const { data, error } = await SupabaseService.client
        .from('legal_consents')
        .select('version, aceitou_termos')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      const aceitou = !!(
        data &&
        data.aceitou_termos === true &&
        data.version >= LegalConsentService.#VERSAO_ATUAL
      );

      if (aceitou) sessionStorage.setItem(LegalConsentService.#CACHE_KEY, '1');
      return aceitou;
    } catch (e) {
      console.warn('[LegalConsentService] Erro ao verificar aceite:', e?.message);
      // Em caso de falha de rede, permite continuar (fail open)
      // O guard no backend é a camada principal de segurança
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────
  // REGISTRAR ACEITE
  // ──────────────────────────────────────────────────────────

  /**
   * Salva (ou atualiza) o aceite legal do usuário no Supabase.
   *
   * @param {string} userId   — UUID do usuário autenticado
   * @param {string} planType — 'trial' | 'mensal' | 'trimestral'
   * @param {{ direitos_autorais: boolean, uso_arquivos: boolean, uso_gps: boolean }} flags
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  static async registrarAceite(userId, planType, flags = {}) {
    if (!userId || !planType) {
      return { ok: false, error: 'Dados incompletos para registrar aceite.' };
    }

    const registro = {
      user_id:          userId,
      plan_type:        planType,
      aceitou_termos:   true,
      direitos_autorais:    flags.direitos_autorais    ?? true,
      uso_arquivos:         flags.uso_arquivos         ?? true,
      uso_midias_internas:  flags.uso_midias_internas  ?? true,
      uso_gps:              flags.uso_gps              ?? true,
      data_aceite:      new Date().toISOString(),
      version:          LegalConsentService.#VERSAO_ATUAL,
    };

    try {
      const { error } = await SupabaseService.client
        .from('legal_consents')
        .upsert(registro, { onConflict: 'user_id' });

      if (error) throw error;

      // Marca como aceito na sessão atual para evitar re-verificação
      sessionStorage.setItem(LegalConsentService.#CACHE_KEY, '1');
      return { ok: true };
    } catch (e) {
      console.error('[LegalConsentService] Erro ao registrar aceite:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao salvar aceite.' };
    }
  }

  // ──────────────────────────────────────────────────────────
  // LIMPAR CACHE (logout)
  // ──────────────────────────────────────────────────────────

  /** Remove flag de cache de sessão — chamado no logout */
  static limparCache() {
    sessionStorage.removeItem(LegalConsentService.#CACHE_KEY);
  }
}

// ── Função global para verificação rápida (mencionada no requisito) ──
/**
 * Verifica se o usuário aceitou os termos legais.
 * Retorna false se não aceitou → deve redirecionar para tela-termos-legais.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
function verificarAceiteLegal(userId) {
  return LegalConsentService.verificarAceite(userId);
}
