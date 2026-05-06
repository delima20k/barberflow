'use strict';

// =============================================================
// AuthService.js — Autenticação completa com Supabase
// Compartilhado entre app cliente e app profissional
// Dependências: SupabaseService.js (carregado antes)
// =============================================================

class AuthService {

  // Perfil em memória (evita re-fetch desnecessário)
  static #perfil = null;

  // Detecta se estamos no app profissional (calculado uma vez, sem TDZ)
  static #isPro = window.location.pathname.includes('profissional');

  // ═══════════════════════════════════════════════════════════
  // DESPACHO DE EVENTOS (canal de comunicação com a UI)
  // ═══════════════════════════════════════════════════════════

  /**
   * Dispara um CustomEvent no document.
   * AuthUI (ou qualquer camada de apresentação) escuta esses eventos.
   */
  static #dispatch(nome, detail = {}) {
    document.dispatchEvent(new CustomEvent(nome, { detail, bubbles: false }));
  }

  /**
   * Notifica a UI sobre uma mensagem de formulário (erro ou sucesso).
   * Dispara 'auth:mensagem' e chama o callback se fornecido.
   * @param {function|null} cb    — callback(msg, tipo)
   * @param {string}        msg   — texto a exibir
   * @param {string}        tipo  — 'error' | 'success'
   */
  static #notificarMensagem(onFeedback, msg, tipo = 'error') {
    if (msg) AuthService.#dispatch('auth:mensagem', { message: msg, tipo });
    if (typeof onFeedback === 'function') onFeedback(msg, tipo);
  }

  // ═══════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string}           email
   * @param {string}           senha
   * @param {function(string)} navFn     — ex: (tela) => App.nav(tela)
   * @param {function|null}    onMensagem — callback(msg, tipo) para feedback de formulário
   */
  static async login(email, senha, navFn, onMensagem = null) {
    email = (typeof email === 'string' ? email : email?.value ?? '').trim();
    senha = typeof senha === 'string' ? senha : (senha?.value ?? '');

    const vEmail = InputValidator.email(email);
    if (!vEmail.ok) { AuthService.#notificarMensagem(onMensagem, vEmail.msg); return; }
    const vSenha = InputValidator.senha(senha);
    if (!vSenha.ok) { AuthService.#notificarMensagem(onMensagem, vSenha.msg); return; }

    AuthService.#notificarMensagem(onMensagem, ''); // limpa mensagem anterior

    try {
      const { user: userLogin } = await SupabaseService.signIn(email, senha);

      // ═ Guard de app: bloqueia clientes no app profissional ═══════════════════
      if (AuthService.#isPro && userLogin) {
        const perfilLogin = await AuthService._carregarPerfil(userLogin.id);
        if (!await AuthService._verificarRoleApp(perfilLogin)) {
          AuthService.#notificarMensagem(onMensagem, 'Esta plataforma é exclusiva para profissionais. Acesse o App Cliente para continuar.');
          return;
        }
      }

      // ═ Guard legal: verifica se profissional aceitou os termos ═════════════════
      // Só aplica no app profissional (Pro definido, App não)
      if (AuthService.#isPro &&
          typeof LegalConsentService !== 'undefined') {
        const user = await SupabaseService.getUser();
        if (user) {
          const aceitou = await LegalConsentService.verificarAceite(user.id);
          if (!aceitou) {
            sessionStorage.setItem('bf_termo_destino', 'inicio');
            navFn('termos-legais');
            return;
          }
        }
      }
      navFn('inicio');
    } catch (e) {
      AuthService.#notificarMensagem(onMensagem, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CADASTRO
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {{ nome, email, telefone, senha, senha2, role, barbearia? }} dados
   * @param {function(string)} navFn
   * @param {function|null}    onMensagem — callback(msg, tipo) para feedback de formulário
   */
  static async cadastro({ nome, email, telefone, senha, senha2, role = 'client', pro_type = null, barbearia = null }, navFn, onMensagem = null) {
    nome  = nome?.trim();
    email = email?.trim();

    const vCadastro = InputValidator.todos([
      InputValidator.nome(nome),
      InputValidator.email(email),
      InputValidator.senha(senha),
      InputValidator.senhasConferem(senha, senha2),
    ]);
    if (!vCadastro.ok) { AuthService.#notificarMensagem(onMensagem, vCadastro.msg); return; }

    AuthService.#notificarMensagem(onMensagem, ''); // limpa mensagem anterior

    try {
      // SupabaseService.signUp retorna data ({user, session}) diretamente — sem wrapper
      const signUpData = await SupabaseService.signUp(
        email,
        senha,
        { full_name: nome, role, phone: telefone || null, pro_type: pro_type || null, barbearia_name: (pro_type === 'barbearia' ? barbearia?.trim() : null) || null }
      );

      const user    = signUpData?.user    ?? null;
      const session = signUpData?.session ?? null;

      // Garante criação do perfil (fallback caso o trigger não exista)
      if (user) {
        // SEGURANÇA: role e pro_type são definidos pelo trigger handle_new_user
        // (SECURITY DEFINER no servidor) via raw_user_meta_data.
        // Nunca enviamos role/pro_type no upsert de fallback — o trigger
        // tem autoridade sobre esses campos. Um upsert com role: 'admin' aqui
        // seria bloqueado pelo trigger prevent_role_escalation, mas por defesa
        // em profundidade, removemos o campo da origem do problema.
        const perfilData = { id: user.id, full_name: nome, phone: telefone || null };
        await SupabaseService.profiles()
          .upsert(perfilData, { onConflict: 'id' });

        // Se é dono de barbearia, cria registro mínimo para aparecer na pesquisa
        if (pro_type === 'barbearia' && barbearia?.trim()) {
          const { error: errShop } = await SupabaseService.barbershops()
            .insert({
              owner_id:  user.id,
              name:      barbearia.trim(),
              is_active: true,
              is_open:   false,
            });
          if (errShop) {
            LoggerService.error('[AuthService] Erro ao criar barbearia:', errShop.message, errShop.code);
          }
        }
      }

      if (!session) {
        // Supabase exige confirmação de e-mail
        AuthService.#notificarMensagem(onMensagem, '✅ Cadastro realizado! Verifique seu e-mail para confirmar.', 'success');
      } else {
        // ── Registra aceite legal pendente (aceito na tela de termos pré-cadastro) ──
        if (typeof LegalConsentService !== 'undefined' && user) {
          LegalConsentService.registrarAceitePendente(user.id)
            .catch(e => LoggerService.warn('[AuthService] Aceite pendente não registrado:', e?.message));
        }
        // Feedback de sucesso antes de redirecionar
        AuthService.#notificarMensagem(onMensagem, '✅ Conta criada com sucesso! Bem-vindo ao BarberFlow!', 'success');
        setTimeout(() => navFn('inicio'), 1600);
      }
    } catch (e) {
      AuthService.#notificarMensagem(onMensagem, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RECUPERAR SENHA
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string}           email
   * @param {function(string)} navFn
   * @param {function|null}    onMensagem — callback(msg, tipo) para feedback de formulário
   */
  static async recuperarSenha(email, navFn, onMensagem = null) {
    email = email?.trim();
    if (!email) {
      AuthService.#notificarMensagem(onMensagem, 'Digite seu e-mail.');
      return;
    }

    AuthService.#notificarMensagem(onMensagem, ''); // limpa mensagem anterior

    try {
      await SupabaseService.resetPassword(email);

      AuthService.#notificarMensagem(onMensagem, '✅ Link enviado! Verifique sua caixa de entrada.', 'success');
      setTimeout(() => navFn('login'), 3000);
    } catch (e) {
      AuthService.#notificarMensagem(onMensagem, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════

  static async logout() {
    try {
      await SupabaseService.signOut();
    } catch (_) { /* ignora erro de sessão já expirada */ }
    // Remove extras locais do usuário antes de limpar o cache (precisamos do ID ainda)
    const userId = AuthService.#perfil?.id;
    AuthService.#perfil = null;
    SessionCache.limparTudo();   // remove perfil, user e avatar_url do localStorage
    if (userId) SessionCache.limparExtras(userId); // remove extras locais do perfil
    // Limpa cache de aceite de termos (sessão encerrada)
    if (typeof LegalConsentService !== 'undefined') LegalConsentService.limparCache();
    // Limpa cache de consentimento LGPD do app cliente
    if (typeof LgpdService !== 'undefined') LgpdService.limparCache();
    // Limpa cache de favoritos/curtidas — evita que dados de um usuário
    // apareçam para outro usuário na mesma sessão de navegação (SPA sem reload)
    if (typeof BarbershopService  !== 'undefined') BarbershopService.limparCache();
    if (typeof ProfessionalService !== 'undefined') ProfessionalService.limparCache();
    AuthService._limparUI();
  }

  // ═══════════════════════════════════════════════════════════
  // SESSÃO
  // ═══════════════════════════════════════════════════════════

  /** Retorna o perfil em cache */
  static getPerfil() { return AuthService.#perfil; }

  /**
   * Atualiza campos específicos do perfil em memória e no SessionCache.
   * Usado por fluxos que modificam o perfil no DB sem precisar recarregar tudo.
   * @param {object} campos — ex: { pro_type: 'barbearia' }
   */
  static patchPerfil(campos) {
    if (!AuthService.#perfil) return;
    Object.assign(AuthService.#perfil, campos);
    // Salva no SessionCache para persistir no próximo reload (Camada 2)
    const user = typeof AppState !== 'undefined' ? AppState.get('user') : null;
    if (user) SessionCache.salvar(AuthService.#perfil, user);
  }

  /**
   * Escuta mudanças de sessão em tempo real.
   * Chame uma vez no constructor do App.
   */
  static iniciarListener() {
    // Callback NAO pode ser async: Supabase usa BroadcastChannel internamente
    // e um callback que retorna Promise dispara o erro
    // "message channel closed before a response was received".
    SupabaseService.onAuthChange((event, session) => {
      // Ao entrar com qualquer usuário, limpa cache de favoritos/curtidas do
      // usuário anterior — evita que dados de cache stale apareçam para o
      // novo usuário antes do carregamento do banco.
      if (event === 'SIGNED_IN') {
        if (typeof BarbershopService  !== 'undefined') BarbershopService.limparCache();
        if (typeof ProfessionalService !== 'undefined') ProfessionalService.limparCache();
      }
      if (session?.user) {
        AuthService._carregarPerfil(session.user.id)
          .then(async perfil => {
            if (!await AuthService._verificarRoleApp(perfil)) {
              AuthService._limparUI();
              return;
            }
            AuthService.#perfil = perfil;
            AuthService._atualizarUI(perfil, session.user);
          })
          .catch(() => {
            AuthService.#perfil = null;
            AuthService._limparUI();
          });
      } else {
        AuthService.#perfil = null;
        AuthService._limparUI();
      }
    });
  }

  /**
   * Restaura sessão ao carregar o app — 3 camadas para UX fluida:
   *   1. Avatar do localStorage → sem flash visual
   *   2. Perfil do localStorage → nome/UI instantâneos
   *   3. Validação Supabase (getSession lê localStorage, rápido) → dados frescos
   * Chame uma vez após iniciarListener().
   */
  static async inicializarSessao() {
    // ── Camada 1: avatar instantâneo (sem rede, sem flash) ──────────
    const avatarCached = SessionCache.getAvatar();
    if (avatarCached) AuthService._aplicarAvatar(avatarCached);

    // ── Camada 2: perfil do cache local (sem rede) ──────────────────
    const { perfil: perfilCache, user: userCache } = SessionCache.restaurar();
    if (perfilCache && userCache) {
      // No app profissional: não exibir UI de cliente em cache (evita flash antes do bloqueio)
      if (!AuthService.#isPro || perfilCache.role === 'professional') {
        AuthService._atualizarUI(perfilCache, userCache);
      }
    }

    // ── Camada 3: validação real da sessão com Supabase ─────────────
    // getSession() lê o token do localStorage e auto-refresca — muito mais
    // rápido que getUser() que sempre vai à rede.
    try {
      const session = await SupabaseService.getSession();
      if (session?.user) {
        // Carrega perfil — pode lançar PERFIL_ORFAO se o usuário foi deletado
        try {
          AuthService.#perfil = await AuthService._carregarPerfil(session.user.id);
        } catch (perfilErr) {
          if (perfilErr?.code === 'PERFIL_ORFAO') {
            // Sessão órfã — deslogar silenciosamente e avisar o usuário
            try { await SupabaseService.signOut(); } catch { /* sem-op */ }
            SessionCache.limparTudo();
            AuthService.#perfil = null;
            AuthService._limparUI();
            AuthService.#dispatch('auth:error', {
              message: 'Sua conta não foi encontrada no BarberFlow. Crie uma nova conta para continuar.',
              context: 'perfil_orfao',
            });
            return;
          }
          AuthService.#perfil = null; // erro de rede etc. → continua sem perfil
        }

        // ═ Guard de app: bloqueia clientes com sessão restaurada no app profissional ═
        if (!await AuthService._verificarRoleApp(AuthService.#perfil)) {
          AuthService._limparUI();
          AuthService._instancia()?.nav('login');
          AuthService.#dispatch('auth:error', {
            message: 'Esta plataforma é exclusiva para profissionais. Acesse o App Cliente para continuar.',
            context: 'login',
          });
          return;
        }

        SessionCache.salvar(AuthService.#perfil, session.user);
        AuthService._atualizarUI(AuthService.#perfil, session.user);
        // ═ Guard legal: verifica aceite ao restaurar sessão ════════════════
        // Só aplica no app profissional e quando no flow pós-login (não durante cadastro)
        if (typeof LegalConsentService !== 'undefined' &&
            !sessionStorage.getItem('bf_termo_destino')) {
          const isPro = AuthService.#isPro;
          if (isPro) {
            const aceitou = await LegalConsentService.verificarAceite(session.user.id);
            if (!aceitou) {
              sessionStorage.setItem('bf_termo_destino', 'inicio');
              // Adia para garantir que a instância global (Pro) já foi atribuída
              setTimeout(() => AuthService._instancia()?.push('termos-legais'), 0);
            }
          }
        }
      } else if (perfilCache) {
        // Sessão expirou mas havia cache → limpa e mostra como visitante
        AuthService.#perfil = null;
        SessionCache.limparTudo();
        AuthService._limparUI();
      }
    } catch (_) {
      // Sem rede: mantém o cache visível — app funciona offline
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — banco
  // ═══════════════════════════════════════════════════════════

  static async _carregarPerfil(userId) {
    // Busca todos os campos do próprio usuário — RLS "profiles_select_own" permite
    // (auth.uid() = id). Campos sensíveis só ficam visíveis para o próprio dono.
    const { data, error } = await SupabaseService.profiles()
      .select('id, full_name, phone, avatar_path, role, pro_type, address, birth_date, gender, zip_code, updated_at')
      .eq('id', userId)
      .single();

    // 406 / PGRST116 = nenhuma linha — perfil não existe (conta deletada / sessão órfã)
    if (error) {
      const code   = error?.code   ?? '';
      const status = error?.status ?? error?.statusCode ?? 0;
      if (code === 'PGRST116' || status === 406 || code === '406') {
        const err  = new Error('Conta não encontrada no BarberFlow.');
        err.code   = 'PERFIL_ORFAO';
        throw err;
      }
      // Outros erros (sem rede, etc.) → retornar null silenciosamente
      return null;
    }

    // Busca created_at do auth.users via getSession() (lê localStorage, sem rede).
    // Usar getUser() aqui causaria 403 durante TOKEN_REFRESHED race condition porque
    // o token antigo ainda pode estar em trânsito quando _carregarPerfil é chamado.
    if (data) {
      const session = await SupabaseService.getSession().catch(() => null);
      data._created_at = session?.user?.created_at || null;
      // Mescla extras locais como FALLBACK offline — Supabase é a fonte da verdade
      const extras = SessionCache.getExtras(userId);
      if (extras) {
        data.address    = data.address    ?? extras.address;
        data.birth_date = data.birth_date ?? extras.birth_date;
        data.gender     = data.gender     ?? extras.gender;
        data.zip_code   = data.zip_code   ?? extras.zip_code;
      }
    }

    return data || null;
  }

  /**
   * Verifica se o role do perfil é compatível com o app atual.
   * App profissional → exige role 'professional' (clientes são bloqueados).
   * App cliente      → aceita qualquer role (profissional age como cliente).
   * Em caso de bloqueio: faz logout silencioso e limpa todo o estado local.
   * @param {Object|null} perfil
   * @returns {Promise<boolean>} true = acesso permitido
   */
  static async _verificarRoleApp(perfil) {
    if (typeof Pro === 'undefined') return true;        // App cliente: sem restrição de role
    if (perfil?.role === 'professional') return true;   // Profissional no app correto
    // Bloqueio: limpa sessão silenciosamente
    try { await SupabaseService.signOut(); } catch (_) {}
    AuthService.#perfil = null;
    SessionCache.limparTudo();
    if (typeof LegalConsentService !== 'undefined') LegalConsentService.limparCache();
    return false;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — UI
  // ═══════════════════════════════════════════════════════════

  /** URL do avatar atual — necessária para reaplicarAvatar() */
  static #avatarUrl = null;

  /**
   * Armazena a URL do avatar e dispara 'auth:avatar'.
   * A camada de apresentação (AuthUI) aplica a URL no DOM.
   */
  static _aplicarAvatar(url) {
    if (!url) return;
    AuthService.#avatarUrl = url;
    AuthService.#dispatch('auth:avatar', { url });
  }

  /** Força reaplicação do avatar em todos os elementos de imagem */
  static reaplicarAvatar() {
    if (AuthService.#avatarUrl) {
      AuthService.#dispatch('auth:avatar', { url: AuthService.#avatarUrl });
    }
  }

  static _instancia() {
    // Tenta globals em ambos os apps (chamado após awaits, TDZ não é problema aqui)
    try { if (typeof App !== 'undefined' && App) return App; } catch (_) {}
    try { if (typeof Pro !== 'undefined' && Pro) return Pro; } catch (_) {}
    return null;
  }

  static _prefix() {
    return AuthService.#isPro ? 'Pro' : 'App';
  }

  /**
   * Dispara 'auth:login' — AuthUI escuta e atualiza o DOM.
   */
  static _atualizarUI(perfil, user) {
    AuthService.#dispatch('auth:login', { perfil, user });
  }

  /**
   * Dispara 'auth:logout' — AuthUI escuta e limpa o DOM.
   */
  static _limparUI() {
    AuthService.#dispatch('auth:logout');
  }

  /**
   * Dispara 'auth:menu' para que AuthUI re-renderize o menu lateral.
   * Mantido como método público para compatibilidade com LogoutScreen.js.
   * @param {boolean} logado
   */
  static _renderizarMenu(logado) {
    AuthService.#dispatch('auth:menu', { logado });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — helpers de formulário (mantidos por compatibilidade)
  // @deprecated — prefira AuthUI.mostrarErroForm / AuthUI.setLoading
  // ═══════════════════════════════════════════════════════════

  /** @deprecated Use AuthUI.mostrarErroForm(el, msg, tipo) */
  static _erro(el, msg, tipo = 'error') {
    if (typeof AuthUI !== 'undefined') { AuthUI.mostrarErroForm(el, msg, tipo); return; }
    if (!el) return;
    el.textContent = msg;
    el.className = `form-erro form-erro--${tipo}`;
    el.style.display = msg ? 'block' : 'none';
  }

  /** @deprecated Use AuthUI.setLoading(loading, inputs) */
  static _setLoading(loading, inputs) {
    if (typeof AuthUI !== 'undefined') { AuthUI.setLoading(loading, inputs); return; }
    inputs.forEach(el => { if (el) el.disabled = loading; });
  }

  static _traduzirErro(e) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('invalid login credentials'))  return 'E-mail ou senha incorretos.';
    if (msg.includes('email not confirmed'))         return 'Confirme seu e-mail antes de entrar.';
    if (msg.includes('user already registered'))     return 'Este e-mail já está cadastrado.';
    if (msg.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (msg.includes('unable to validate email'))    return 'E-mail inválido.';
    if (msg.includes('email rate limit'))            return 'Muitas tentativas. Aguarde alguns minutos.';
    if (msg.includes('network'))                     return 'Sem conexão. Verifique sua internet.';
    return e?.message || 'Ocorreu um erro. Tente novamente.';
  }
}
