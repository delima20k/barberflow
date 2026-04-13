'use strict';

// =============================================================
// AuthService.js — Autenticação completa com Supabase
// Compartilhado entre app cliente e app profissional
// Dependências: SupabaseService.js (carregado antes)
// =============================================================

class AuthService {

  // Perfil em memória (evita re-fetch desnecessário)
  static #perfil = null;

  // ═══════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {HTMLInputElement} emailEl
   * @param {HTMLInputElement} senhaEl
   * @param {HTMLElement}      erroEl
   * @param {function(string)} navFn  — ex: (tela) => App.nav(tela)
   */
  static async login(emailEl, senhaEl, erroEl, navFn) {
    const email = emailEl?.value.trim();
    const senha = senhaEl?.value;

    if (!email || !senha) {
      AuthService._erro(erroEl, 'Preencha e-mail e senha.');
      return;
    }

    AuthService._setLoading(true, [emailEl, senhaEl]);
    AuthService._erro(erroEl, '');

    try {
      await SupabaseService.signIn(email, senha);
      AuthService._instancia()?.splashLogin();
      setTimeout(() => navFn('inicio'), 3000);
    } catch (e) {
      AuthService._erro(erroEl, AuthService._traduzirErro(e));
    } finally {
      AuthService._setLoading(false, [emailEl, senhaEl]);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CADASTRO
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {{ nome, email, telefone, senha, senha2, role, barbearia? }} dados
   * @param {HTMLElement}      erroEl
   * @param {function(string)} navFn
   */
  static async cadastro({ nome, email, telefone, senha, senha2, role = 'client', barbearia = null }, erroEl, navFn) {
    nome  = nome?.trim();
    email = email?.trim();

    if (!nome || !email || !senha) {
      AuthService._erro(erroEl, 'Preencha todos os campos obrigatórios.');
      return;
    }
    if (senha !== senha2) {
      AuthService._erro(erroEl, 'As senhas não coincidem.');
      return;
    }
    if (senha.length < 6) {
      AuthService._erro(erroEl, 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    // Valida email básico
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      AuthService._erro(erroEl, 'Digite um e-mail válido.');
      return;
    }

    AuthService._erro(erroEl, '');

    try {
      const { data, error } = await SupabaseService.client.auth.signUp({
        email,
        password: senha,
        options: { data: { full_name: nome, role, phone: telefone || null } }
      });
      if (error) throw error;

      const { user, session } = data;

      // Garante criação do perfil (fallback caso o trigger não exista)
      if (user) {
        await SupabaseService.client
          .from('profiles')
          .upsert(
            { id: user.id, full_name: nome, phone: telefone || null, role },
            { onConflict: 'id' }
          );
      }

      if (!session) {
        // Supabase exige confirmação de e-mail
        AuthService._erro(erroEl, '✅ Cadastro realizado! Verifique seu e-mail para confirmar.', 'success');
      } else {
        AuthService._instancia()?.splashLogin();
        setTimeout(() => navFn('inicio'), 3000);
      }
    } catch (e) {
      AuthService._erro(erroEl, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RECUPERAR SENHA
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string}           email
   * @param {HTMLElement}      erroEl
   * @param {function(string)} navFn
   */
  static async recuperarSenha(email, erroEl, navFn) {
    email = email?.trim();
    if (!email) {
      AuthService._erro(erroEl, 'Digite seu e-mail.');
      return;
    }

    AuthService._erro(erroEl, '');

    try {
      const { error } = await SupabaseService.client.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname
      });
      if (error) throw error;

      AuthService._erro(erroEl, '✅ Link enviado! Verifique sua caixa de entrada.', 'success');
      setTimeout(() => navFn('login'), 3000);
    } catch (e) {
      AuthService._erro(erroEl, AuthService._traduzirErro(e));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════════════════════

  static async logout() {
    try {
      await SupabaseService.signOut();
    } catch (_) { /* ignora erro de sessão já expirada */ }
    AuthService.#perfil = null;
    SessionCache.limparTudo();   // remove perfil, user e avatar_url do localStorage
    AuthService._limparUI();
  }

  // ═══════════════════════════════════════════════════════════
  // SESSÃO
  // ═══════════════════════════════════════════════════════════

  /** Retorna o perfil em cache */
  static getPerfil() { return AuthService.#perfil; }

  /**
   * Escuta mudanças de sessão em tempo real.
   * Chame uma vez no constructor do App.
   */
  static iniciarListener() {
    // Callback NAO pode ser async: Supabase usa BroadcastChannel internamente
    // e um callback que retorna Promise dispara o erro
    // "message channel closed before a response was received".
    SupabaseService.onAuthChange((event, session) => {
      if (session?.user) {
        AuthService._carregarPerfil(session.user.id)
          .then(perfil => {
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
      AuthService._atualizarUI(perfilCache, userCache);
    }

    // ── Camada 3: validação real da sessão com Supabase ─────────────
    // getSession() lê o token do localStorage e auto-refresca — muito mais
    // rápido que getUser() que sempre vai à rede.
    try {
      const { data: { session } } = await SupabaseService.client.auth.getSession();
      if (session?.user) {
        AuthService.#perfil = await AuthService._carregarPerfil(session.user.id);
        SessionCache.salvar(AuthService.#perfil, session.user);
        AuthService._atualizarUI(AuthService.#perfil, session.user);
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
    const { data } = await SupabaseService.client
      .from('profiles')
      .select('id, full_name, phone, avatar_path, role')
      .eq('id', userId)
      .single();
    return data || null;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — UI
  // ═══════════════════════════════════════════════════════════

  /** Aplica uma URL de avatar em todos os elementos de imagem de avatar */
  static _aplicarAvatar(url) {
    ['header-avatar-img', 'menu-avatar-img'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.src = url; el.onerror = null; }
    });
    // Atualiza o marcador do usuário no mapa (se já posicionado)
    if (typeof MapWidget !== 'undefined') MapWidget.atualizarMarcadorUsuario();
  }

  static _instancia() {
    return typeof App !== 'undefined' ? App : Pro;
  }

  static _prefix() {
    return typeof App !== 'undefined' ? 'App' : 'Pro';
  }

  static _atualizarUI(perfil, user) {
    const nome  = perfil?.full_name || user?.email?.split('@')[0] || 'Usuário';
    const email = user?.email || '';
    const p     = AuthService._prefix();

    // Header — nome (logado)
    const label = document.getElementById('header-user-label');
    if (label) label.textContent = nome.split(' ')[0];

    const headerBtn = document.getElementById('header-avatar-btn');
    if (headerBtn) headerBtn.setAttribute('onclick', `${p}.nav('perfil')`);

    // Avatars — aplica URL e persiste no cache local
    if (perfil?.avatar_path) {
      const url = SupabaseService.client.storage
        .from('avatars').getPublicUrl(perfil.avatar_path).data.publicUrl;
      AuthService._aplicarAvatar(url);
      SessionCache.salvarAvatar(url);
    }

    // Menu — nome + email
    const mu = document.getElementById('menu-username');
    if (mu) mu.innerHTML = `${nome} <small id="menu-user-sub">${email}</small>`;

    // Ativa botão de upload do avatar
    document.getElementById('menu-avatar')?.classList.add('logado');

    // Hint de GPS — mostra primeiro nome do usuário
    const hintNome = document.getElementById('nearby-hint-nome');
    if (hintNome) hintNome.textContent = nome.split(' ')[0];

    // Atualiza menu lateral + footer via NavConfig e Router
    AuthService._instancia()?.entrar();
    AuthService._renderizarMenu(true);
  }

  static _limparUI() {
    const p = AuthService._prefix();

    const label = document.getElementById('header-user-label');
    if (label) label.textContent = 'Entrar';

    const headerBtn = document.getElementById('header-avatar-btn');
    if (headerBtn) headerBtn.setAttribute('onclick', `${p}.irParaLogin()`);

    ['header-avatar-img', 'menu-avatar-img'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = '/shared/img/icones-perfil.png';
    });
    // Volta o marcador do usuário no mapa para o ícone padrão
    if (typeof MapWidget !== 'undefined') MapWidget.atualizarMarcadorUsuario();

    const mu = document.getElementById('menu-username');
    // Remove botão de upload do avatar
    document.getElementById('menu-avatar')?.classList.remove('logado');

    // Hint de GPS — volta para Anônimo
    const hintNome = document.getElementById('nearby-hint-nome');
    if (hintNome) hintNome.textContent = 'Anônimo';

    const nomeVisitante = typeof App !== 'undefined' ? 'Visitante Cliente' : 'Visitante Profissional';
    if (mu) mu.innerHTML = `${nomeVisitante} <small id="menu-user-sub">Faça login para continuar</small>`;

    // Atualiza menu lateral + footer via NavConfig e Router
    AuthService._instancia()?.sair();
    AuthService._renderizarMenu(false);
  }

  /**
   * Renderiza os itens do menu lateral usando NavConfig como fonte única.
   * Menu e rodapé sempre terão as mesmas opções.
   * @param {boolean} logado
   */
  static _renderizarMenu(logado) {
    const lista = document.querySelector('.menu-list-nav');
    if (!lista) return;
    lista.innerHTML = NavConfig.renderMenuHtml(logado);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — helpers UI de formulário
  // ═══════════════════════════════════════════════════════════

  static _erro(el, msg, tipo = 'error') {
    if (!el) return;
    el.textContent = msg;
    el.className = `form-erro form-erro--${tipo}`;
    el.style.display = msg ? 'block' : 'none';
  }

  static _setLoading(loading, inputs) {
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
