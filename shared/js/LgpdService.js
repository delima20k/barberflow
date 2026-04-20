'use strict';

/**
 * LgpdService — Conformidade com a LGPD (Lei 13.709/2018)
 *
 * Implementa os direitos do titular previstos no Art. 18:
 *   - Portabilidade: exportarDados() — dados pessoais em formato estruturado
 *   - Esquecimento:  solicitarExclusao() — pedido formal de exclusão
 *   - Cancelamento:  cancelarExclusao() — retira pedido pendente
 *
 * Controle de acesso (Art. 46, LGPD):
 *   Todas as tabelas possuem RLS no Supabase. auth.uid() = user_id garante
 *   que apenas o titular lê, cria ou altera seus próprios registros.
 *   A função `anonimizar_perfil()` no banco é SECURITY DEFINER e somente
 *   o service_role (backend) pode executá-la — nunca a aplicação direta.
 *
 * Quem tem acesso a quê (mapeamento de controle):
 *   profiles               → titular (authenticated, auth.uid() = id)
 *   data_deletion_requests → titular
 *   data_access_log        → titular (leitura); titular + service_role (escrita)
 *   legal_consents         → titular
 *   direct_messages        → remetente + destinatário
 *   appointments           → cliente e profissional da marcação
 *
 * Log de auditoria (Art. 37, LGPD):
 *   registrarAcesso() grava na tabela data_access_log de forma fire-and-forget.
 *   Falhas são silenciadas para não interromper o fluxo principal.
 *
 * Consentimento do cliente (Art. 7, I):
 *   O app profissional usa LegalConsentService (com planos comerciais).
 *   registrarConsentimentoCliente() / verificarConsentimentoCliente()
 *   cobrem o app cliente, reutilizando a mesma tabela legal_consents
 *   com plan_type = 'client'.
 *
 * Dependências: SupabaseService.js, LoggerService.js
 */
class LgpdService {

  /** @private Chave sessionStorage para cache de consentimento do cliente */
  static #CONSENT_KEY = 'bf_client_consent';

  // ─────────────────────────────────────────────────────────
  // PORTABILIDADE — Art. 18, V, LGPD
  // ─────────────────────────────────────────────────────────

  /**
   * Exporta os dados pessoais do usuário em formato estruturado (JSON).
   * Inclui perfil completo e histórico de consentimento.
   * Registra o acesso na tabela data_access_log para fins de auditoria.
   *
   * @param {string} userId — UUID do usuário autenticado
   * @returns {Promise<{ ok: boolean, dados?: { perfil, consentimento, exportadoEm }, error?: string }>}
   */
  static async exportarDados(userId) {
    if (!userId) return { ok: false, error: 'userId obrigatório.' };

    try {
      const [{ data: perfil, error: errPerfil }, { data: consentimento }] = await Promise.all([
        SupabaseService.profiles()
          .select('id, full_name, phone, address, birth_date, gender, zip_code, role, created_at')
          .eq('id', userId)
          .single(),
        SupabaseService.legalConsents()
          .select('plan_type, aceitou_termos, data_aceite, version')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (errPerfil) throw errPerfil;

      // Registra a exportação no log de auditoria — fire-and-forget
      LgpdService.registrarAcesso(userId, 'profiles', 'export');

      return {
        ok: true,
        dados: {
          perfil:        perfil ?? null,
          consentimento: consentimento ?? null,
          exportadoEm:   new Date().toISOString(),
        },
      };
    } catch (e) {
      LoggerService.error('[LgpdService] Falha ao exportar dados:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao exportar dados.' };
    }
  }

  // ─────────────────────────────────────────────────────────
  // DIREITO AO ESQUECIMENTO — Art. 18, VI, LGPD
  // ─────────────────────────────────────────────────────────

  /**
   * Registra uma solicitação de exclusão de conta e dados pessoais.
   * A anonimização efetiva é executada pelo backend (service_role) após
   * validação — a aplicação apenas cria o pedido.
   * Upsert: renovar um pedido anterior é permitido.
   *
   * @param {string} userId
   * @param {'user_request'|'legal_obligation'|'consent_withdrawn'} [motivo]
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  static async solicitarExclusao(userId, motivo = 'user_request') {
    if (!userId) return { ok: false, error: 'userId obrigatório.' };

    try {
      const { error } = await SupabaseService.deletionRequests()
        .upsert(
          { user_id: userId, motivo, status: 'pending', requested_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      LgpdService.registrarAcesso(userId, 'data_deletion_requests', 'write');
      return { ok: true };
    } catch (e) {
      LoggerService.error('[LgpdService] Falha ao registrar pedido de exclusão:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao solicitar exclusão.' };
    }
  }

  /**
   * Cancela uma solicitação de exclusão pendente.
   * @param {string} userId
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  static async cancelarExclusao(userId) {
    if (!userId) return { ok: false, error: 'userId obrigatório.' };

    try {
      const { error } = await SupabaseService.deletionRequests()
        .update({ status: 'cancelled' })
        .eq('user_id', userId);

      if (error) throw error;
      return { ok: true };
    } catch (e) {
      LoggerService.error('[LgpdService] Falha ao cancelar pedido de exclusão:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao cancelar exclusão.' };
    }
  }

  /**
   * Verifica se há solicitação de exclusão com status 'pending'.
   * Fail open — retorna false em caso de falha de rede para não bloquear o app.
   *
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  static async exclusaoPendente(userId) {
    if (!userId) return false;

    try {
      const { data, error } = await SupabaseService.deletionRequests()
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      return data?.status === 'pending';
    } catch (e) {
      LoggerService.warn('[LgpdService] Falha ao verificar pedido de exclusão:', e?.message);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // CONSENTIMENTO DO CLIENTE — Art. 7, I, LGPD
  // ─────────────────────────────────────────────────────────

  /**
   * Registra o consentimento explícito do usuário do app cliente.
   * Reutiliza a tabela legal_consents com plan_type = 'client'.
   * O app profissional usa LegalConsentService (planos comerciais).
   *
   * @param {string} userId
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  static async registrarConsentimentoCliente(userId) {
    if (!userId) return { ok: false, error: 'userId obrigatório.' };

    try {
      const { error } = await SupabaseService.legalConsents()
        .upsert(
          {
            user_id:             userId,
            plan_type:           'client',
            aceitou_termos:      true,
            direitos_autorais:   false,
            uso_arquivos:        false,
            uso_midias_internas: false,
            uso_gps:             false,
            data_aceite:         new Date().toISOString(),
            version:             1,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      sessionStorage.setItem(LgpdService.#CONSENT_KEY, '1');
      return { ok: true };
    } catch (e) {
      LoggerService.error('[LgpdService] Falha ao registrar consentimento:', e?.message);
      return { ok: false, error: e?.message || 'Erro ao registrar consentimento.' };
    }
  }

  /**
   * Verifica se o usuário do app cliente já consentiu.
   * Usa sessionStorage como cache para evitar chamadas repetidas ao banco.
   * Fail open — retorna false em caso de erro para bloquear acesso indevido.
   *
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  static async verificarConsentimentoCliente(userId) {
    if (!userId) return false;

    // Cache de sessão — já verificado nesta aba
    if (sessionStorage.getItem(LgpdService.#CONSENT_KEY) === '1') return true;

    try {
      const { data, error } = await SupabaseService.legalConsents()
        .select('aceitou_termos')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      const consentiu = data?.aceitou_termos === true;
      if (consentiu) sessionStorage.setItem(LgpdService.#CONSENT_KEY, '1');
      return consentiu;
    } catch (e) {
      LoggerService.warn('[LgpdService] Falha ao verificar consentimento:', e?.message);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // LOG DE AUDITORIA — Art. 37, LGPD
  // ─────────────────────────────────────────────────────────

  /**
   * Registra um evento de acesso a dados pessoais na tabela data_access_log.
   * Fire-and-forget — erros são silenciados para não interromper o fluxo principal.
   *
   * @param {string} userId  — UUID do titular dos dados acessados
   * @param {string} recurso — tabela ou recurso ('profiles', 'appointments', ...)
   * @param {'read'|'write'|'delete'|'export'} acao
   */
  static registrarAcesso(userId, recurso, acao) {
    if (!userId || !recurso || !acao) return;

    SupabaseService.dataAccessLog()
      .insert({ user_id: userId, recurso, acao })
      .catch(e => LoggerService.warn('[LgpdService] Falha ao registrar acesso:', e?.message));
  }

  // ─────────────────────────────────────────────────────────
  // LIMPEZA DE CACHE — chamado no logout
  // ─────────────────────────────────────────────────────────

  /** Remove flag de consentimento da sessão. Chamado no logout. */
  static limparCache() {
    sessionStorage.removeItem(LgpdService.#CONSENT_KEY);
  }
}
