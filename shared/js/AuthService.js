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
      let userLogin;

      // ── Via BFF (preferencial: logging centralizado, tokens via servidor) ──────
      if (typeof BffAuthClient !== 'undefined') {
        const bff = await BffAuthClient.login(email, senha);
        if (bff.indisponivel) {
          // BFF indisponível — fallback transparente para Supabase direto
          const { user } = await SupabaseService.signIn(email, senha);
          userLogin = user;
        } else if (bff.erro) {
          throw new Error(bff.erro);
        } else {
          // Injeta sessão no SDK → dispara onAuthStateChange('SIGNED_IN')
          await SupabaseService.setSession(bff.dados.access_token, bff.dados.refresh_token);
          userLogin = bff.dados.user;
        }
      } else {
        // Fallback: BffAuthClient não carregado (ex: primeiro boot sem rede)
        const { user } = await SupabaseService.signIn(email, senha);
        userLogin = user;
      }

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

  static async loginSocial(provider, onMensagem = null) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!['google', 'facebook'].includes(normalizedProvider)) {
      AuthService.#notificarMensagem(onMensagem, 'Opção de cadastro social inválida.');
      return;
    }
    const isClienteApp = location.hostname.startsWith('app.')
      || location.pathname.includes('/cliente')
      || document.querySelector('meta[name="description"][content*="Cliente"]');
    if (AuthService.#isPro || !isClienteApp) {
      AuthService.#notificarMensagem(onMensagem, 'Cadastro com Google ou Facebook está disponível apenas no app cliente.');
      return;
    }

    AuthService.#notificarMensagem(onMensagem, '');

    try {
      await SupabaseService.signInWithOAuth(
        normalizedProvider,
        window.location.origin + window.location.pathname,
      );
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
  static async cadastro({
    nome,
    email,
    telefone,
    senha,
    senha2,
    role = 'client',
    pro_type = null,
    barbearia = null,
    cpf = null,
    cnpj = null,
  }, navFn, onMensagem = null) {
    nome  = nome?.trim();
    email = email?.trim();
    const doc = AuthService.#normalizarDocumentoProfissional({ cpf, cnpj, role });
    if (!doc.ok) { AuthService.#notificarMensagem(onMensagem, doc.msg); return; }

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
      // SEGURANÇA P1: CPF/CNPJ não vai mais para user_metadata (JWT/localStorage).
      // O documento é enviado à BFF logo após o signup, cifrado AES-256-GCM.
      const signUpData = await SupabaseService.signUp(
        email,
        senha,
        {
          full_name: nome,
          role,
          phone: telefone || null,
          pro_type: pro_type || null,
          barbearia_name: (pro_type === 'barbearia' ? barbearia?.trim() : null) || null,
        }
      );

      const user    = signUpData?.user    ?? null;
      const session = signUpData?.session ?? null;

      // Salva o documento cifrado na BFF — fire-and-forget.
      // Usa o JWT da sessão recém-criada via SupabaseService.getSession().
      // Falha não bloqueia o cadastro; o documento pode ser reinserido
      // pelo profissional via edição de perfil.
      if (user && doc.valor && session) {
        BffApiService.auth.salvarDocumento(doc.valor)
          .catch(e => LoggerService.warn('[AuthService] Documento não salvo na BFF:', e?.message));
      }

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
        // Supabase envia o e-mail quando o projeto exige confirmacao de cadastro.
        // Nao chamamos a BFF/Resend aqui para evitar dois tokens diferentes.
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
  static #normalizarDocumentoProfissional({ cpf = null, cnpj = null, role = 'client' } = {}) {
    if (role !== 'professional') return { ok: true, msg: '', valor: null, tipo: null };

    const cpfDigits = String(cpf ?? '').replace(/\D/g, '');
    const cnpjDigits = String(cnpj ?? '').replace(/\D/g, '');
    if (cpfDigits) {
      const valid = InputValidator.cpf(cpfDigits, true);
      if (!valid.ok) return valid;
      return { ok: true, msg: '', valor: cpfDigits, tipo: 'cpf' };
    }
    if (cnpjDigits) {
      const valid = InputValidator.cnpj(cnpjDigits, true);
      if (!valid.ok) return valid;
      return { ok: true, msg: '', valor: cnpjDigits, tipo: 'cnpj' };
    }
    return { ok: false, msg: 'Informe CPF ou CNPJ para criar a conta profissional.' };
  }

  static async recuperarSenha(email, navFn, onMensagem = null) {
    email = email?.trim();
    if (!email) {
      AuthService.#notificarMensagem(onMensagem, 'Digite seu e-mail.');
      return;
    }

    AuthService.#notificarMensagem(onMensagem, ''); // limpa mensagem anterior

    try {
      if (typeof BffApiService !== 'undefined' && BffApiService.auth?.solicitarRecuperacaoSenha) {
        const { error } = await BffApiService.auth.solicitarRecuperacaoSenha(email, window.location.href);
        if (error) {
          LoggerService.warn('[AuthService] BFF forgot-password indisponivel; fallback automatico desativado:', error.message);
        }
      } else {
        LoggerService.warn('[AuthService] BFF forgot-password indisponivel; fallback automatico desativado.');
      }

      AuthService.#notificarMensagem(
        onMensagem,
        'Se o email estiver cadastrado, voce recebera instrucoes em instantes. Se nao receber, tente novamente mais tarde.',
        'success',
      );
      setTimeout(() => navFn('login'), 3000);
    } catch (e) {
      LoggerService.warn('[AuthService] Falha ao solicitar recuperacao; resposta neutra mantida:', e?.message || e);
      AuthService.#notificarMensagem(
        onMensagem,
        'Se o email estiver cadastrado, voce recebera instrucoes em instantes. Se nao receber, tente novamente mais tarde.',
        'success',
      );
      setTimeout(() => navFn('login'), 3000);
    }
  }

  static isPasswordRecoveryUrl() {
    const params = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    return params.get('type') === 'recovery' || hash.get('type') === 'recovery';
  }

  static limparRecoveryUrl() {
    if (!AuthService.isPasswordRecoveryUrl()) return;
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  static async redefinirSenha(novaSenha, confirmarSenha, navFn, onMensagem = null) {
    const senha = String(novaSenha ?? '');
    const senha2 = String(confirmarSenha ?? '');

    if (senha.length < 6) {
      AuthService.#notificarMensagem(onMensagem, 'A nova senha precisa ter no minimo 6 caracteres.');
      return;
    }
    if (senha !== senha2) {
      AuthService.#notificarMensagem(onMensagem, 'As senhas nao conferem.');
      return;
    }

    try {
      const session = await SupabaseService.getSession().catch((err) => {
        const raw = `${err?.message ?? ''} ${err?.original?.message ?? ''}`.toLowerCase();
        if (raw.includes('issued in the future') || raw.includes('clock')) {
          return { clockSkew: true };
        }
        return null;
      });

      if (session?.clockSkew) {
        AuthService.#notificarMensagem(
          onMensagem,
          'Nao foi possivel validar o link porque o relogio do aparelho esta fora de sincronia. Ative data e hora automaticas e solicite um novo link.',
        );
        return;
      }

      if (!session?.access_token) {
        AuthService.#notificarMensagem(
          onMensagem,
          'Link de recuperacao invalido ou expirado. Solicite um novo link e confira se a data e hora do aparelho estao automaticas.',
        );
        return;
      }

      await SupabaseService.updatePassword(senha);
      AuthService.limparRecoveryUrl();
      await SupabaseService.signOut().catch(() => {});
      AuthService.#notificarMensagem(onMensagem, 'Senha alterada com sucesso. Entre novamente com sua nova senha.', 'success');
      setTimeout(() => navFn('login'), 1600);
    } catch (e) {
      AuthService.#notificarMensagem(onMensagem, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════

  static async logout() {
    try {
      // Notifica BFF (fire-and-forget: logs + invalidação server-side)
      if (typeof BffAuthClient !== 'undefined') {
        BffAuthClient.logout().catch(() => {/* BFF indisponível — SDK cuida da limpeza */});
      }
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
      // Limpa cache stale apenas em login fresco (não em restauração de sessão)
      if (event === 'SIGNED_IN') {
        if (typeof BarbershopService   !== 'undefined') BarbershopService.limparCache();
        if (typeof ProfessionalService !== 'undefined') ProfessionalService.limparCache();
      }

      // Inicia Realtime tanto em login fresco (SIGNED_IN) quanto em sessão
      // restaurada no reload (INITIAL_SESSION) — guarda interna evita duplicata
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        if (typeof NotificationService !== 'undefined') {
          NotificationService.iniciarRealtime(session.user.id);
        }
      }

      if (session?.user) {
        AuthService._carregarPerfil(session.user.id)
          .then(async perfil => {
            if (!await AuthService._verificarRoleApp(perfil)) {
              AuthService._limparUI();
              // Encerra canal de notificações — usuário não tem acesso a este app
              if (typeof NotificationService !== 'undefined') NotificationService.pararRealtime();
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
        if (typeof NotificationService !== 'undefined') NotificationService.pararRealtime();
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
    // Perfil próprio (com campos privados: address, birth_date, gender, zip_code)
    // é servido pela BFF com service_role. A leitura direta da tabela profiles
    // foi revogada para anon/authenticated (migration 20260628000001) — RLS filtra
    // linha, não coluna, então proteger PII exige fechar o SELECT direto.
    const { data, error } = await BffApiService.auth.me();

    if (error) {
      // Sem rede / BFF indisponível → retorna null silenciosamente (mantém UX).
      return null;
    }

    const perfil = data?.perfil ?? null;

    // perfil ausente = conta deletada / sessão órfã (BFF responde 200 com perfil null)
    if (!perfil) {
      const err = new Error('Conta não encontrada no BarberFlow.');
      err.code  = 'PERFIL_ORFAO';
      throw err;
    }

    // email vem do JWT (data.user.email), não da tabela.
    if (data?.user?.email && !perfil.email) perfil.email = data.user.email;

    // Busca created_at do auth.users via getSession() (lê localStorage, sem rede).
    // Usar getUser() aqui causaria 403 durante TOKEN_REFRESHED race condition porque
    // o token antigo ainda pode estar em trânsito quando _carregarPerfil é chamado.
    const session = await SupabaseService.getSession().catch(() => null);
    perfil._created_at = perfil.created_at || session?.user?.created_at || null;

    // Mescla extras locais como FALLBACK offline — BFF é a fonte da verdade
    const extras = SessionCache.getExtras(userId);
    if (extras) {
      perfil.address    = perfil.address    ?? extras.address;
      perfil.birth_date = perfil.birth_date ?? extras.birth_date;
      perfil.gender     = perfil.gender     ?? extras.gender;
      perfil.zip_code   = perfil.zip_code   ?? extras.zip_code;
      perfil.since_year = perfil.since_year ?? extras.since_year;
    }

    return perfil;
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
    const msg = `${e?.message || ''} ${e?.original?.message || ''}`.toLowerCase();
    if (msg.includes('issued in the future') || msg.includes('clock')) {
      return 'Nao foi possivel validar o link porque o relogio do aparelho esta fora de sincronia. Ative data e hora automaticas e solicite um novo link.';
    }
    if (msg.includes('unprocessable') || msg.includes('422')) {
      return 'Link de recuperacao invalido ou expirado. Solicite um novo link.';
    }
    if (msg.includes('email not confirmed'))         return 'Confirme seu e-mail antes de entrar.';
    if (msg.includes('invalid login credentials'))  return 'E-mail ou senha incorretos.';
    if (msg.includes('unauthorized') || msg.includes('http 401')) {
      return 'E-mail ou senha incorretos. Se acabou de se cadastrar, confirme seu e-mail antes de entrar.';
    }
    if (msg.includes('user already registered'))     return 'Este e-mail já está cadastrado.';
    if (msg.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
    if (msg.includes('unable to validate email'))    return 'E-mail inválido.';
    if (msg.includes('email rate limit'))            return 'Muitas tentativas. Aguarde alguns minutos.';
    if (msg.includes('network'))                     return 'Sem conexão. Verifique sua internet.';
    return e?.message || 'Ocorreu um erro. Tente novamente.';
  }
}
