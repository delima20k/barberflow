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
   * Retorna (ou cria) o cliente Supabase.
   * Valida o formato da chave antes de criar o cliente.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  static get client() {
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
        console.error(msg);
        throw new Error(msg);
      }

      if (!key.startsWith('eyJ')) {
        console.warn('[SupabaseService] Chave anon em formato inesperado. Esperado JWT (eyJ...).');
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

      SupabaseService.#_initAuthSync();
    }
    return SupabaseService.#client;
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
  static #_initAuthSync() {
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
      console.error(`[SupabaseService.${contexto}]`, tecnica, error);
    }

    const err = new Error(amigavel);
    err.original = error;
    err.contexto = contexto;
    throw err;
  }

  // ── Auth helpers ──────────────────────────────────────────

  /** Retorna o usuário autenticado atual (ou null) */
  static async getUser() {
    try {
      const { data: { user }, error } = await SupabaseService.client.auth.getUser();
      if (error) SupabaseService.#erro('getUser', error);
      return user;
    } catch (e) {
      if (e.contexto) throw e; // já tratado
      SupabaseService.#erro('getUser', e);
    }
  }

  /** Login com email + senha */
  static async signIn(email, password) {
    const { data, error } = await SupabaseService.client.auth.signInWithPassword({ email, password });
    if (error) SupabaseService.#erro('signIn', error);
    return data;
  }

  /** Cadastro com email + senha */
  static async signUp(email, password, meta = {}) {
    const { data, error } = await SupabaseService.client.auth.signUp({
      email, password, options: { data: meta }
    });
    if (error) SupabaseService.#erro('signUp', error);
    return data;
  }

  /** Logout */
  static async signOut() {
    const { error } = await SupabaseService.client.auth.signOut();
    if (error) SupabaseService.#erro('signOut', error);
  }

  /**
   * Escuta mudanças de sessão.
   * @param {(event: string, session: object|null) => void} callback
   */
  static onAuthChange(callback) {
    return SupabaseService.client.auth.onAuthStateChange(callback);
  }

  // ═══════════════════════════════════════════════════════════
  // ACESSORES DE TABELA — evite client.from() direto no app.
  // Use sempre SupabaseService.tabela() para centralizar e
  // facilitar manutenção, mocks e auditoria de queries.
  // ═══════════════════════════════════════════════════════════

  /** Tabela de perfis de usuários */
  static profiles()               { return SupabaseService.client.from('profiles'); }

  /** View pública de perfis (sem dados sensíveis) */
  static profilesPublic()         { return SupabaseService.client.from('profiles_public'); }

  /** Tabela de barbearias */
  static barbershops()            { return SupabaseService.client.from('barbershops'); }

  /** Tabela de interações com barbearias (favoritos, likes, visitas) */
  static barbershopInteractions() { return SupabaseService.client.from('barbershop_interactions'); }

  /** Tabela de agendamentos */
  static appointments()           { return SupabaseService.client.from('appointments'); }

  /** Tabela de notificações */
  static notifications()          { return SupabaseService.client.from('notifications'); }

  /** Tabela de stories */
  static stories()                { return SupabaseService.client.from('stories'); }

  /** Tabela de comentários de stories */
  static storyComments()          { return SupabaseService.client.from('story_comments'); }

  /** Tabela de mensagens diretas */
  static directMessages()         { return SupabaseService.client.from('direct_messages'); }

  /** Tabela de favoritos */
  static favorites()              { return SupabaseService.client.from('favorites'); }

  /** Tabela de entradas na fila */
  static queueEntries()           { return SupabaseService.client.from('queue_entries'); }

  /** Tabela de cadeiras/estações de trabalho */
  static chairs()                 { return SupabaseService.client.from('chairs'); }

  // ── Storage ───────────────────────────────────────────────

  /** Bucket de avatares de usuários */
  static storageAvatars()         { return SupabaseService.client.storage.from('avatars'); }

  /** Bucket de logos de barbearias */
  static storageLogos()           { return SupabaseService.client.storage.from('logos'); }

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
      console.warn('[SupabaseService] diagnosticar() disponível apenas em localhost.');
      return;
    }

    const URL = SupabaseService.#URL;
    const KEY = SupabaseService.#ANON_KEY;

    console.group('%c🔍 SupabaseService.diagnosticar()', 'font-weight:bold;color:#D4AF37;font-size:13px');

    // ── 1. Formato da chave ───────────────────────────────────
    console.group('1. Chave anon');
    if (!KEY || KEY.startsWith('COLE_AQUI')) {
      console.error('❌ #ANON_KEY não configurada.');
      console.warn('👉 Acesse: Supabase Dashboard → Settings → API → anon public (JWT eyJ...)');
      console.groupEnd(); console.groupEnd(); return;
    }
    if (KEY.startsWith('sb_publishable_')) {
      console.error('❌ Formato "sb_publishable_*" — NÃO funciona no PostgREST (causa 401).');
      console.warn('👉 Troque pela chave JWT (eyJ...) em: Supabase Dashboard → Settings → API');
      console.groupEnd(); console.groupEnd(); return;
    }
    console.log(KEY.startsWith('eyJ') ? '✅ JWT válido (eyJ...)' : '⚠️ Formato desconhecido: ' + KEY.slice(0, 20));
    console.groupEnd();

    // ── 2. Sessão do usuário (até 3s de espera) ───────────────
    console.group('2. Sessão');
    let session = null;
    try {
      for (let i = 0; i < 6; i++) {
        const { data, error } = await SupabaseService.client.auth.getSession();
        if (error) { console.error('Erro ao buscar sessão:', error); break; }
        if (data?.session) { session = data.session; break; }
        if (i < 5) {
          console.log(`  aguardando sessão... (${(i + 1) * 500}ms)`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (e) {
      console.error('Falha ao acessar SupabaseService.client:', e.message);
      console.groupEnd(); console.groupEnd(); return;
    }

    if (!session) {
      console.error('❌ Usuário NÃO autenticado. Faça login no app antes de chamar diagnosticar().');
      console.groupEnd(); console.groupEnd(); return;
    }
    console.log('✅ Logado como:', session.user.email);
    console.log('user_id       :', session.user.id);
    console.log('token expira  :', new Date(session.expires_at * 1000).toLocaleTimeString());
    console.groupEnd();

    // ── 3. Conectividade (fetch puro, ignora SDK) ─────────────
    console.group('3. Conectividade REST');
    const pingRes = await fetch(`${URL}/rest/v1/notifications?limit=0`, {
      headers: {
        'apikey':        KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    console.log('GET /notifications:', pingRes.status, pingRes.ok ? '✅ OK' : '❌ FALHOU');
    if (!pingRes.ok) {
      const body = await pingRes.json().catch(() => ({}));
      console.error('Detalhe:', body);
      if (pingRes.status === 401) {
        console.error('❌ 401: a chave anon ainda não é aceita pelo PostgREST deste projeto.');
        console.warn('Solução definitiva: vá ao Supabase Dashboard → Settings → API\n→ copie o JWT completo da "anon public key" e cole em #ANON_KEY.');
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
