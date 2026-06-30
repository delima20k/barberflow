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

  // ── Dedup/cache de auth ───────────────────────────────────
  // O gotrue-js serializa todo acesso ao token via Web Locks API. Quando vários
  // widgets chamam getSession()/getUser() simultaneamente no boot, eles enfileiram
  // atrás de uma chamada lenta (getUser faz round-trip de rede) e estouram o timeout
  // de 5s do lock ("Forcefully acquiring the lock to recover"). Estes caches colapsam
  // N chamadas concorrentes em UMA única aquisição de lock.
  static #sessionCache    = undefined; // undefined = não populado; null = sem sessão
  static #sessionCacheTs  = 0;
  static #sessionInflight = null;
  static #userCache       = undefined; // undefined = não populado; null = sem usuário
  static #userCacheTs     = 0;
  static #userInflight    = null;
  static #AUTH_TTL_MS     = 2000;      // janela curta — invalidada em toda mudança de auth

  /** Invalida os caches de sessão/usuário. Chamado em toda mudança de auth. */
  static #invalidarAuthCache() {
    SupabaseService.#sessionCache   = undefined;
    SupabaseService.#sessionCacheTs = 0;
    SupabaseService.#userCache      = undefined;
    SupabaseService.#userCacheTs    = 0;
  }

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
   *   INITIAL_SESSION             → AppState.login(user, perfilExistente) — se houver user (reload/PWA homescreen)
   *   SIGNED_IN / TOKEN_REFRESHED → AppState.login(user, perfilExistente)
   *   SIGNED_OUT                  → AppState.logout()
   *
   * Nota: perfil (tabela profiles) não é carregado aqui — responsabilidade do UserService.refresh().
   */
  static #initAuthSync() {
    SupabaseService.#client.auth.onAuthStateChange((event, session) => {
      // Toda mudança de auth invalida os caches de sessão/usuário (evita stale token)
      SupabaseService.#invalidarAuthCache();

      if (typeof AppState === 'undefined') return;

      switch (event) {
        case 'INITIAL_SESSION':
          // Sessão restaurada de storage (reload / abertura do PWA via homescreen).
          // Sem user = visitante sem sessão → não autenticar.
          if (!session?.user) break;
          // fall-through intencional
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

  /**
   * Retorna o usuário autenticado atual (ou null se não houver sessão).
   * Deduplicado: chamadas concorrentes compartilham uma única ida ao SDK,
   * evitando contenção do Web Lock do gotrue-js.
   */
  static async getUser() {
    const agora = Date.now();
    if (SupabaseService.#userCache !== undefined &&
        (agora - SupabaseService.#userCacheTs) < SupabaseService.#AUTH_TTL_MS) {
      return SupabaseService.#userCache;
    }
    if (SupabaseService.#userInflight) return SupabaseService.#userInflight;

    SupabaseService.#userInflight = (async () => {
      try {
        const { data: { user }, error } = await SupabaseService.#getClient().auth.getUser();
        if (error) {
          // Sem sessão ativa = visitante/pré-cadastro — não é erro real
          // 403 = token rejeitado pelo servidor (ex: durante TOKEN_REFRESHED race condition)
          // Ambos os casos são equivalentes a "sem sessão válida" para o app
          if (
            error.name === 'AuthSessionMissingError' ||
            error.message?.toLowerCase().includes('session') ||
            error.status === 403
          ) {
            if (error.status === 403) {
              try { await SupabaseService.#getClient().auth.signOut({ scope: 'local' }); } catch { /* sem-op */ }
              SupabaseService.#sessionCache = null;
              SupabaseService.#sessionCacheTs = Date.now();
            }
            SupabaseService.#userCache   = null;
            SupabaseService.#userCacheTs = Date.now();
            return null;
          }
          SupabaseService.#erro('getUser', error);
        }
        SupabaseService.#userCache   = user ?? null;
        SupabaseService.#userCacheTs = Date.now();
        return SupabaseService.#userCache;
      } catch (e) {
        if (e.contexto) throw e;
        SupabaseService.#erro('getUser', e);
      }
    })();

    try {
      return await SupabaseService.#userInflight;
    } finally {
      SupabaseService.#userInflight = null;
    }
  }

  /**
   * Retorna a sessão atual (lê localStorage — rápido, sem rede).
   * Deduplicado: chamadas concorrentes compartilham uma única ida ao SDK,
   * evitando contenção do Web Lock do gotrue-js.
   */
  static async getSession() {
    const agora = Date.now();
    if (SupabaseService.#sessionCache !== undefined &&
        (agora - SupabaseService.#sessionCacheTs) < SupabaseService.#AUTH_TTL_MS) {
      return SupabaseService.#sessionCache;
    }
    if (SupabaseService.#sessionInflight) return SupabaseService.#sessionInflight;

    SupabaseService.#sessionInflight = (async () => {
      const { data: { session }, error } = await SupabaseService.#getClient().auth.getSession();
      if (error) SupabaseService.#erro('getSession', error);
      SupabaseService.#sessionCache   = session ?? null;
      SupabaseService.#sessionCacheTs = Date.now();
      return SupabaseService.#sessionCache;
    })();

    try {
      return await SupabaseService.#sessionInflight;
    } finally {
      SupabaseService.#sessionInflight = null;
    }
  }

  /** Login com email + senha */
  static async signIn(email, password) {
    const { data, error } = await SupabaseService.#getClient().auth.signInWithPassword({ email, password });
    if (error) SupabaseService.#erro('signIn', error);
    SupabaseService.#invalidarAuthCache(); // sessão nova — força releitura
    return data;
  }

  /** Login/cadastro social via OAuth. */
  static async signInWithOAuth(provider, redirectTo = null) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!['google', 'facebook'].includes(normalizedProvider)) {
      throw new Error('Provider de login social inválido.');
    }

    const options = {
      redirectTo: redirectTo || (window.location.origin + window.location.pathname),
    };
    if (normalizedProvider === 'google') {
      options.queryParams = { prompt: 'select_account' };
    }

    const { data, error } = await SupabaseService.#getClient().auth.signInWithOAuth({
      provider: normalizedProvider,
      options,
    });
    if (error) SupabaseService.#erro('signInWithOAuth', error);
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
    SupabaseService.#invalidarAuthCache(); // sessão encerrada — limpa caches
  }

  /**
   * Injeta uma sessão existente no SDK Supabase.
   * Usado pelo BffAuthClient após login via BFF — dispara
   * onAuthStateChange('SIGNED_IN', session) que atualiza a UI.
   * @param {string} accessToken
   * @param {string} refreshToken
   * @returns {Promise<object>} data da sessão
   */
  static async setSession(accessToken, refreshToken) {
    const { data, error } = await SupabaseService.#getClient().auth.setSession({
      access_token:  accessToken,
      refresh_token: refreshToken,
    });
    if (error) SupabaseService.#erro('setSession', error);
    SupabaseService.#invalidarAuthCache(); // sessão injetada — força releitura
    return data;
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

  /** Tabela de barbeiros (profissionais vinculados a barbearias) */
  static professionals()          { return SupabaseService.#getClient().from('professionals'); }

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

  /** Bucket de logos e capas de barbearias */
  static storageBarbershops()           { return SupabaseService.#getClient().storage.from('barbershops'); }

  /**
   * Retorna a URL pública de um avatar a partir de um path relativo.
   * @param {string} path — avatar_path relativo
   * @returns {string}
   */
  static getAvatarUrl(path) {
    return ApiService.getAvatarUrl(path);
  }

  /**
   * Resolve a URL pública do avatar com cache-bust e suporte a URLs completas.
   * @param {string|null} path      — avatar_path da tabela profiles
   * @param {string|null} updatedAt — profiles.updated_at (ISO string)
   * @returns {string}
   */
  static resolveAvatarUrl(path, updatedAt = null) {
    return ApiService.resolveAvatarUrl(path, updatedAt);
  }

  /**
   * Retorna a URL pública de um logo de barbearia.
   * @param {string} path — logo_path da tabela barbershops
   * @returns {string}
   */
  static getLogoUrl(path) {
    return ApiService.getLogoUrl(path);
  }

  /**
   * Retorna a URL pública de uma thumbnail do portfólio.
   * @param {string} path — thumbnail_path
   * @returns {string}
   */
  static getPortfolioThumbUrl(path) {
    return ApiService.getPortfolioThumbUrl(path);
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
    // Perfil próprio com campos privados (address, birth_date, gender, zip_code)
    // é servido pela BFF — a leitura direta da tabela profiles foi revogada para
    // anon/authenticated (migration 20260628000001). RLS filtra linha, não coluna.
    const { data, error } = await BffApiService.auth.me();

    if (error) SupabaseService.#erro('getProfile', error);

    const perfil = data?.perfil ?? null;
    if (!perfil) {
      // Perfil órfão (usuário deletado ou incompleto).
      // Limpa sessão local silenciosamente em vez de lançar erro.
      try { await SupabaseService.#getClient().auth.signOut(); } catch { /* sem-op */ }
      return null;
    }
    return perfil;
  }

  /**
   * Atualiza o perfil de um usuário.
   * @param {string} userId
   * @param {object} dados — campos a atualizar (ex: { full_name, phone })
   * @returns {Promise<object>}
   */
  static async updateProfile(userId, dados) {
    // Sem .select() de retorno: o SELECT direto em profiles foi revogado para
    // anon/authenticated (migration 20260628000001). A UPDATE permanece válida
    // (privilégio próprio via RLS profiles_update_own); retornamos os campos enviados.
    const { error } = await SupabaseService.profiles()
      .update(dados)
      .eq('id', userId);
    if (error) SupabaseService.#erro('updateProfile', error);
    return { id: userId, ...dados };
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

    // ── 4. RPC segura de notifications ────────────────────────
    console.group('4. RPC create_notification');
    const insertRes = await fetch(`${URL}/rest/v1/rpc/create_notification`, {
      method: 'POST',
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        p_recipient_id: session.user.id,
        p_type:         'sistema',
        p_payload:      {
          title: 'Diagnóstico BarberFlow',
          body:  `Teste em ${new Date().toLocaleTimeString()}`,
          data:  { source: 'supabase-diagnostics' },
        },
      }),
    });
    const json = await insertRes.json().catch(() => null);
    console.log('POST /rpc/create_notification:', insertRes.status, insertRes.ok ? '✅ SUCESSO' : '❌ FALHOU');
    console.log('Resposta:', json);
    if (!insertRes.ok) {
      console.error('Verifique a function create_notification e as policies RLS de notifications.');
    }
    console.groupEnd();

    console.groupEnd();
  }
}
