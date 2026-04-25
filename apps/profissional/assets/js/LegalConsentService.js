'use strict';

// =============================================================
// LegalConsentService.js — Aceite legal do profissional
// App: apps/profissional
// Dependência: SupabaseService.js (carregado antes)
// =============================================================

class LegalConsentService {

  /** Versão atual dos termos. Incrementar quando os termos mudarem. */
  static #VERSAO_ATUAL = 2;

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
      const { data, error } = await SupabaseService.legalConsents()
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
      LoggerService.warn('[LegalConsentService] Erro ao verificar aceite:', e?.message);
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
      const { error } = await SupabaseService.legalConsents()
        .upsert(registro, { onConflict: 'user_id' });

      if (error) throw error;

      // Marca como aceito na sessão atual para evitar re-verificação
      sessionStorage.setItem(LegalConsentService.#CACHE_KEY, '1');
      return { ok: true };
    } catch (e) {
      LoggerService.error('[LegalConsentService] Erro ao registrar aceite:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao salvar aceite.' };
    }
  }

  // ──────────────────────────────────────────────────────────
  // ACEITE PENDENTE (pré-cadastro)
  // ──────────────────────────────────────────────────────────

  /** Chave para armazenar aceite pendente até o usuário criar conta */
  static #PENDENTE_KEY = 'bf_termos_pendentes';

  /**
   * Salva o consentimento em sessionStorage para ser registrado após o cadastro.
   * Chamado quando o usuário aceita os termos ANTES de ter conta criada.
   */
  static marcarAceitePendente(planType, flags = {}) {
    sessionStorage.setItem(LegalConsentService.#PENDENTE_KEY, JSON.stringify({ planType, flags }));
    // Marca como aceito na sessão para evitar reexibição no mesmo fluxo
    sessionStorage.setItem(LegalConsentService.#CACHE_KEY, '1');
  }

  /**
   * Verifica se há aceite pendente armazenado em sessionStorage.
   * @returns {boolean}
   */
  static temAceitePendente() {
    return !!sessionStorage.getItem(LegalConsentService.#PENDENTE_KEY);
  }

  /**
   * Após o cadastro ser concluído, registra o aceite pendente no banco.
   * Limpa o pendente em caso de sucesso.
   *
   * @param {string} userId — UUID do usuário recém-criado
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  static async registrarAceitePendente(userId) {
    const raw = sessionStorage.getItem(LegalConsentService.#PENDENTE_KEY);
    if (!raw) return { ok: true }; // nada pendente

    try {
      const { planType, flags } = JSON.parse(raw);
      const result = await LegalConsentService.registrarAceite(userId, planType, flags);
      if (result.ok) sessionStorage.removeItem(LegalConsentService.#PENDENTE_KEY);
      return result;
    } catch (e) {
      return { ok: false, error: e?.message || 'Erro ao registrar aceite pendente.' };
    }
  }

  // ──────────────────────────────────────────────────────────
  // LIMPAR CACHE (logout)
  // ──────────────────────────────────────────────────────────

  /** Remove flag de cache de sessão — chamado no logout */
  static limparCache() {
    sessionStorage.removeItem(LegalConsentService.#CACHE_KEY);
    sessionStorage.removeItem(LegalConsentService.#PENDENTE_KEY);
  }

  // ──────────────────────────────────────────────────────────
  // PROCESSAR ACEITE (fachada para TermosController)
  // ──────────────────────────────────────────────────────────

  /**
   * Ponto único de decisão de aceite: detecta se o usuário está logado
   * e escolhe o fluxo correto (registrar no banco ou salvar como pendente).
   *
   * Uso pelo TermosController:
   *   const { ok, usuario } = await LegalConsentService.processarAceite(planType, flags);
   *   if (ok) push(destino);
   *
   * @param {string} planType — 'trial' | 'mensal' | 'trimestral'
   * @param {{ direitos_autorais?: boolean, uso_arquivos?: boolean, uso_midias_internas?: boolean, uso_gps?: boolean }} flags
   * @returns {Promise<{ ok: boolean, usuario: object|null, error?: string }>}
   */
  static async processarAceite(planType, flags = {}) {
    try {
      const user = await SupabaseService.getUser();

      if (!user) {
        // Fluxo pré-cadastro: persiste aceite e aguarda criação de conta
        LegalConsentService.marcarAceitePendente(planType, flags);
        return { ok: true, usuario: null };
      }

      // Fluxo pós-login: registra direto no banco
      const resultado = await LegalConsentService.registrarAceite(user.id, planType, flags);
      return { ...resultado, usuario: user };
    } catch (e) {
      LoggerService.error('[LegalConsentService] processarAceite:', e?.message);
      return { ok: false, usuario: null, error: e?.message || 'Erro ao processar aceite.' };
    }
  }
}



