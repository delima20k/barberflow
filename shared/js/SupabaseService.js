'use strict';

// =============================================================
// SupabaseService.js — Conexão central com o Supabase
// Compartilhado entre app cliente e app profissional
// Carregue ANTES de qualquer outro script que use o Supabase
// =============================================================
// Dependência (já incluída via CDN no index.html):
//   <script src="/shared/js/supabase.min.js"></script>
// =============================================================
//
// ⚠️ ATENÇÃO — FORMATO DA CHAVE ANON:
//
//   ❌ sb_publishable_*  →  formato novo do Supabase Dashboard (2025)
//                           NÃO funciona no PostgREST (REST API)
//                           Causa erro 401 em todas as requisições
//
//   ✅ eyJhbGciOiJIUzI1NiIs...  →  JWT válido
//                           Obtenha em: Supabase Dashboard
//                           → Settings → API → "anon public" (JWT)
//
// =============================================================

class SupabaseService {

  // ── Configuração ──────────────────────────────────────────
  static #URL = 'https://jfvjisqnzapxxagkbxcu.supabase.co';

  // TODO: Substituir pelo JWT da sua chave anon (começa com eyJ...)
  // Acesse: https://supabase.com/dashboard/project/jfvjisqnzapxxagkbxcu/settings/api
  // Copie o campo "anon public" — o JWT completo, NÃO o sb_publishable_*
  static #ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmdmppc3FuemFweHhhZ2tieGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTAzODUsImV4cCI6MjA5MTA2NjM4NX0.HnPEnl_H-2hap53Q9y1NtR5ffBWddNQJkAB7Grw0-9A';

  // Instância única (Singleton)
  static #client = null;

  /**
   * Retorna (ou cria) o cliente Supabase — PRIVADO.
   * Nenhum código fora desta classe deve chamar este método.
   * Use os métodos públicos: getUser(), signIn(), profiles(), channel()…
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  static #getClient() {
    if (!SupabaseService.#client) {
      if (!window.supabase) {
        throw new Error('[SupabaseService] SDK não carregado. Verifique o <script> em supabase.min.js.');
      }

      // ── Valida formato da chave anon ───────────────────────
      const key = SupabaseService.#ANON_KEY;
      if (!key || key.startsWith('COLE_AQUI') || key.startsWith('sb_publishable_')) {
        const msg = key.startsWith('sb_publishable_')
          ? '[SupabaseService] Chave "sb_publishable_*" não é suportada pelo PostgREST.\n'
            + 'Acesse: Supabase Dashboard → Settings → API → copie o JWT da "anon public key" (eyJ...).'
          : '[SupabaseService] #ANON_KEY não configurada. Substitua pelo JWT do Supabase Dashboard.';
        LoggerService.error(msg);
        throw new Error(msg);
      }

      if (!key.startsWith('eyJ')) {
        LoggerService.warn('[SupabaseService] Chave anon em formato inesperado. Esperado JWT (eyJ...).');
      }

      SupabaseService.#client = window.supabase.createClient(
        SupabaseService.#URL,
        key,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      SupabaseService.#initAuthSync();
    }
    return SupabaseService.#client;
  }

  /** @deprecated Acesso interno — use os métodos públicos do SupabaseService. */
  static get client() {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (isLocal) LoggerService.warn('[SupabaseService] .client está deprecado. Use os métodos públicos.');
    return SupabaseService.#getClient();
  }

  /**
   * Registra listener único de auth para sincronizar AppState.
   * Cobre todos os eventos: login, logout, refresh de token, magic link, OAuth.
   * Chamado uma única vez na criação do client.
   *
   * Eventos tratados:
   *   SIGNED_IN / TOKEN_REFRESHED → AppState.login(user, perfilExistente)
   *   SIGNED_OUT                  → AppState.logout()
   *
   * Nota: perfil (tabela profiles) não é carregado aqui — responsabilidade do UserService.refresh().
   */
  static #initAuthSync() {
    SupabaseService.#client.auth.onAuthStateChange((event, session) => {
      if (typeof AppState === 'undefined') return;

      switch (event) {
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
          // Atualiza user e mantém isLogado=true; preserva perfil em cache
          AppState.login(session.user, AppState.get('perfil'));
          break;
        case 'SIGNED_OUT':
          AppState.logout();
          break;
      }
    });
  }

  // ── Auth helpers ──────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════
  // TRATAMENTO DE ERROS — handler centralizado
  // ═══════════════════════════════════════════════════════════

  /**
   * Mapa de mensagens amigáveis para códigos de erro do Supabase Auth.
   * Evita expor mensagens técnicas ao usuário.
   */
  static #MENSAGENS_ERRO = Object.freeze({
    'Invalid login credentials':          'E-mail ou senha incorretos.',
    'Email not confirmed':                 'Confirme seu e-mail antes de entrar.',
    'User already registered':            'Este e-mail já está cadastrado.',
    'Password should be at least 6 characters': 'A senha precisa ter no mínimo 6 caracteres.',
    'Email rate limit exceeded':          'Muitas tentativas. Aguarde alguns minutos.',
    'Too many requests':                  'Muitas requisições. Tente novamente em breve.',
    'JWT expired':                        'Sessão expirada. Faça login novamente.',
    'Invalid JWT':                        'Sessão inválida. Faça login novamente.',
    'Network request failed':             'Sem conexão com a internet.',
    'Failed to fetch':                    'Sem conexão com a internet.',
  });

  /**
   * Handler centralizado de erros do Supabase.
   * Loga com contexto, traduz a mensagem e relança como Error padronizado.
   *
   * @param {string} contexto — ex: 'signIn', 'signUp'
   * @param {object|Error} error — objeto de erro do Supabase ou nativo
   * @throws {Error} com `.message` amigável e `.original` preservado
   */
  static #erro(contexto, error) {
    const tecnica = error?.message ?? String(error);
    const amigavel = SupabaseService.#MENSAGENS_ERRO[tecnica]
      ?? 'Ocorreu um erro inesperado. Tente novamente.';

    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (isLocal) {
      LoggerService.error(`[SupabaseService.${contexto}]`, tecnica, error);
    }

    const err = new Error(amigavel);
    err.original = error;
    err.contexto = contexto;
    throw err;
  }

  // ── Auth helpers ──────────────────────────────────────────

  // ── Auth ─────────────────────────────────────────────────

  /** Retorna o usuário autenticado atual (ou null se não houver sessão) */
  static async getUser() {
    try {
      const { data: { user }, error } = await SupabaseService.#getClient().auth.getUser();
      if (error) {
        // Sem sessão ativa = visitante/pré-cadastro — não é erro real
        if (
          error.name === 'AuthSessionMissingError' ||
          error.message?.toLowerCase().includes('session')
        ) return null;
        SupabaseService.#erro('getUser', error);
      }
      return user;
    } catch (e) {
      if (e.contexto) throw e;
      SupabaseService.#erro('getUser', e);
    }
  }

  /** Retorna a sessão atual (lê localStorage — rápido, sem rede). */
  static async getSession() {
    const { data: { session }, error } = await SupabaseService.#getClient().auth.getSession();
    if (error) SupabaseService.#erro('getSession', error);
    return session;
  }

  /** Login com email + senha */
  static async signIn(email, password) {
    const { data, error } = await SupabaseService.#getClient().auth.signInWithPassword({ email, password });
    if (error) SupabaseService.#erro('signIn', error);
    return data;
  }

  /** Cadastro com email + senha */
  static async signUp(email, password, meta = {}) {
    const { data, error } = await SupabaseService.#getClient().auth.signUp({
      email, password, options: { data: meta }
    });
    if (error) SupabaseService.#erro('signUp', error);
    return data;
  }

  /** Logout */
  static async signOut() {
    const { error } = await SupabaseService.#getClient().auth.signOut();
    if (error) SupabaseService.#erro('signOut', error);
  }

  /**
   * Envia e-mail de recuperação de senha.
   * @param {string} email
   */
  static async resetPassword(email) {
    const { error } = await SupabaseService.#getClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    if (error) SupabaseService.#erro('resetPassword', error);
  }

  /**
   * Escuta mudanças de sessão.
   * @param {(event: string, session: object|null) => void} callback
   */
  static onAuthChange(callback) {
    return SupabaseService.#getClient().auth.onAuthStateChange(callback);
  }

  // ═══════════════════════════════════════════════════════════
  // ACESSORES DE TABELA — evite client.from() direto no app.
  // Use sempre SupabaseService.tabela() para centralizar e
  // facilitar manutenção, mocks e auditoria de queries.
  // ═══════════════════════════════════════════════════════════

  /** Tabela de perfis de usuários */
  static profiles()               { return SupabaseService.#getClient().from('profiles'); }

  /** View pública de perfis (sem dados sensíveis) */
  static profilesPublic()         { return SupabaseService.#getClient().from('profiles_public'); }

  /** Tabela de barbearias */
  static barbershops()            { return SupabaseService.#getClient().from('barbershops'); }

  /** Tabela de interações com barbearias (favoritos, likes, visitas) */
  static barbershopInteractions() { return SupabaseService.#getClient().from('barbershop_interactions'); }

  /** Tabela de agendamentos */
  static appointments()           { return SupabaseService.#getClient().from('appointments'); }

  /** Tabela de notificações */
  static notifications()          { return SupabaseService.#getClient().from('notifications'); }

  /** Tabela de stories */
  static stories()                { return SupabaseService.#getClient().from('stories'); }

  /** Tabela de comentários de stories */
  static storyComments()          { return SupabaseService.#getClient().from('story_comments'); }

  /** Tabela de mensagens diretas */
  static directMessages()         { return SupabaseService.#getClient().from('direct_messages'); }

  /** Tabela de curtidas em barbeiros */
  static professionalLikes()      { return SupabaseService.#getClient().from('professional_likes'); }

  /** Tabela de barbeiros favoritos */
  static favoriteProfessionals()  { return SupabaseService.#getClient().from('favorite_professionals'); }

  /** Tabela de entradas na fila */
  static queueEntries()           { return SupabaseService.#getClient().from('queue_entries'); }

  /** Tabela de cadeiras/estações de trabalho */
  static chairs()                 { return SupabaseService.#getClient().from('chairs'); }

  /** Tabela de serviços de barbearia */
  static services()               { return SupabaseService.#getClient().from('services'); }

  /** Tabela de imagens do portfólio */
  static portfolioImages()        { return SupabaseService.#getClient().from('portfolio_images'); }

  /** Tabela de aceites legais */
  static legalConsents()          { return SupabaseService.#getClient().from('legal_consents'); }

  /** Pedidos de exclusão de dados (LGPD Art. 18, VI) */
  static deletionRequests()       { return SupabaseService.#getClient().from('data_deletion_requests'); }

  /** Log de auditoria de acesso a dados (LGPD Art. 37) */
  static dataAccessLog()          { return SupabaseService.#getClient().from('data_access_log'); }

  // ── Storage ───────────────────────────────────────────────

  /** Bucket de avatares de usuários */
  static storageAvatars()         { return SupabaseService.#getClient().storage.from('avatars'); }

  /** Bucket de logos de barbearias */
  static storageLogos()           { return SupabaseService.#getClient().storage.from('logos'); }

  /**
   * Retorna a URL pública de um avatar.
   * @param {string} path — avatar_path da tabela profiles
   * @returns {string}
   */
  static getAvatarUrl(path) {
    return SupabaseService.storageAvatars().getPublicUrl(path).data.publicUrl;
  }

  /**
   * Retorna a URL pública de um logo de barbearia.
   * @param {string} path — logo_path da tabela barbershops
   * @returns {string}
   */
  static getLogoUrl(path) {
    return SupabaseService.storageLogos().getPublicUrl(path).data.publicUrl;
  }

  /**
   * Retorna a URL pública de uma thumbnail do portfólio.
   * @param {string} path — thumbnail_path
   * @returns {string}
   */
  static getPortfolioThumbUrl(path) {
    return SupabaseService.#getClient().storage.from('portfolio').getPublicUrl(path).data.publicUrl;
  }

  // ── Realtime ──────────────────────────────────────────────

  /**
   * Cria um canal Realtime.
   * @param {string} name — identificador único do canal
   * @returns {RealtimeChannel}
   */
  static channel(name) {
    return SupabaseService.#getClient().channel(name);
  }

  /**
   * Remove e cancela a inscrição de um canal Realtime.
   * @param {RealtimeChannel} canal
   */
  static removeChannel(canal) {
    try { SupabaseService.#getClient().removeChannel(canal); } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════════
  // OPERAÇÕES DE ALTO NÍVEL — Service Layer
  // Evitam uso de .from() espalhado no app.
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna o perfil de um usuário pelo ID.
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  static async getProfile(userId) {
    const { data, error } = await SupabaseService.profiles()
      .select('id, full_name, phone, avatar_path, role, pro_type, address, birth_date, gender, zip_code')
      .eq('id', userId)
      .single();

    // 406 = nenhuma linha encontrada (perfil não existe — usuário deletado ou incompleto)
    // Nesse caso deslogamos silenciosamente em vez de lançar erro
    if (error) {
      const code = error?.code ?? '';
      const status = error?.status ?? error?.statusCode ?? 0;
      if (code === 'PGRST116' || status === 406 || code === '406') {
        // Perfil órfão — limpa sessão local e retorna null
        try { await SupabaseService.#getClient().auth.signOut(); } catch { /* sem-op */ }
        return null;
      }
      SupabaseService.#erro('getProfile', error);
    }
    return data ?? null;
  }

  /**
   * Atualiza o perfil de um usuário.
   * @param {string} userId
   * @param {object} dados — campos a atualizar (ex: { full_name, phone })
   * @returns {Promise<object>}
   */
  static async updateProfile(userId, dados) {
    const { data, error } = await SupabaseService.profiles()
      .update(dados)
      .eq('id', userId)
      .select()
      .single();
    if (error) SupabaseService.#erro('updateProfile', error);
    return data;
  }

  /**
   * Retorna todas as barbearias ativas, ordenadas por avaliação.
   * @param {number} [limit=20]
   * @returns {Promise<object[]>}
   */
  static async getBarbers(limit = 20) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id, name, address, city, latitude, longitude, logo_path, is_open, rating_avg')
      .eq('is_active', true)
      .order('rating_avg', { ascending: false })
      .limit(limit);
    if (error) SupabaseService.#erro('getBarbers', error);
    return data ?? [];
  }

  /**
   * Cria um novo agendamento.
   * @param {object} dados — { client_id, professional_id, barbershop_id, service_id, scheduled_at, duration_min, price_charged, notes? }
   * @returns {Promise<{ id: string }>}
   */
  static async createAppointment(dados) {
    const { data, error } = await SupabaseService.appointments()
      .insert(dados)
      .select('id')
      .single();
    if (error) SupabaseService.#erro('createAppointment', error);
    return data;
  }

  // ═══════════════════════════════════════════════════════════
  // DIAGNÓSTICO — use no console DevTools para debugar 401
  // Disponível APENAS em localhost — bloqueado em produção.
  // ═══════════════════════════════════════════════════════════

  /**
   * Diagnóstico completo: valida chave, sessão e faz INSERT de teste.
   * Uso no console: await SupabaseService.diagnosticar()
   *
   * ⚠️ Restrito a localhost — não executa em produção.
   */
  static async diagnosticar() {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (!isLocal) {
      LoggerService.warn('[SupabaseService] diagnosticar() disponível apenas em localhost.');
      return;
    }

    const URL = SupabaseService.#URL;
    const KEY = SupabaseService.#ANON_KEY;

    console.group('%c🔍 SupabaseService.diagnosticar()', 'font-weight:bold;color:#D4AF37;font-size:13px');

    // ── 1. Formato da chave ───────────────────────────────────
    console.group('1. Chave anon');
    if (!KEY || KEY.startsWith('COLE_AQUI')) {
      LoggerService.error('❌ #ANON_KEY não configurada.');
      LoggerService.warn('👉 Acesse: Supabase Dashboard → Settings → API → anon public (JWT eyJ...)');
      console.groupEnd(); console.groupEnd(); return;
    }
    if (KEY.startsWith('sb_publishable_')) {
      LoggerService.error('❌ Formato "sb_publishable_*" — NÃO funciona no PostgREST (causa 401).');
      LoggerService.warn('👉 Troque pela chave JWT (eyJ...) em: Supabase Dashboard → Settings → API');
      console.groupEnd(); console.groupEnd(); return;
    }
    LoggerService.info(KEY.startsWith('eyJ') ? '✅ JWT válido (eyJ...)' : '⚠️ Formato desconhecido: ' + KEY.slice(0, 20));
    console.groupEnd();

    // ── 2. Sessão do usuário (até 3s de espera) ───────────────
    console.group('2. Sessão');
    let session = null;
    try {
      for (let i = 0; i < 6; i++) {
        const { data, error } = await SupabaseService.#getClient().auth.getSession();
        if (error) { LoggerService.error('Erro ao buscar sessão:', error); break; }
        if (data?.session) { session = data.session; break; }
        if (i < 5) {
          LoggerService.info(`  aguardando sessão... (${(i + 1) * 500}ms)`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (e) {
      LoggerService.error('Falha ao acessar SupabaseService:', e.message);
      console.groupEnd(); console.groupEnd(); return;
    }

    if (!session) {
      LoggerService.error('❌ Usuário NÃO autenticado. Faça login no app antes de chamar diagnosticar().');
      console.groupEnd(); console.groupEnd(); return;
    }
    LoggerService.info('✅ Logado como:', session.user.email);
    LoggerService.info('user_id       :', session.user.id);
    LoggerService.info('token expira  :', new Date(session.expires_at * 1000).toLocaleTimeString());
    console.groupEnd();

    // ── 3. Conectividade (fetch puro, ignora SDK) ─────────────
    console.group('3. Conectividade REST');
    const pingRes = await fetch(`${URL}/rest/v1/notifications?limit=0`, {
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    LoggerService.info('GET /notifications:', pingRes.status, pingRes.ok ? '✅ OK' : '❌ FALHOU');
    if (!pingRes.ok) {
      const body = await pingRes.json().catch(() => ({}));
      LoggerService.error('Detalhe:', body);
      if (pingRes.status === 401) {
        LoggerService.error('❌ 401: a chave anon ainda não é aceita pelo PostgREST deste projeto.');
        LoggerService.warn('Solução definitiva: vá ao Supabase Dashboard → Settings → API\n→ copie o JWT completo da "anon public key" e cole em #ANON_KEY.');
      }
      console.groupEnd(); console.groupEnd(); return;
    }
    console.groupEnd();

    // ── 4. INSERT na tabela notifications ─────────────────────
    console.group('4. INSERT notifications');
    const insertRes = await fetch(`${URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        user_id: session.user.id,
        type:    'sistema',
        title:   'Diagnóstico BarberFlow',
        body:    `Teste em ${new Date().toLocaleTimeString()}`,
        is_read: false,
      }),
    });
    const json = await insertRes.json().catch(() => null);
    console.log('POST /notifications:', insertRes.status, insertRes.status === 201 ? '✅ SUCESSO' : '❌ FALHOU');
    console.log('Resposta:', json);
    if (insertRes.status !== 201) {
      console.error('Verifique RLS na tabela notifications — política "notifications_insert_service" deve ter with check (true).');
    }
    console.groupEnd();

    console.groupEnd();
  }
}
