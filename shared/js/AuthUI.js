'use strict';

// =============================================================
// AuthUI.js — Camada de apresentação de autenticação
//
// Responsabilidade ÚNICA: atualizar o DOM em resposta a eventos
// disparados pelo AuthService (auth:login, auth:logout,
// auth:avatar, auth:menu, auth:error).
//
// NUNCA contém lógica de negócio.
// NUNCA é chamada diretamente — opera exclusivamente via eventos.
//
// Dependências (carregadas antes): AuthService.js, NavConfig.js,
//   PerfilEditor.js, SessionCache.js, SupabaseService.js,
//   InputValidator.js, MapWidget.js (opcionais — verificados via typeof)
// =============================================================

const AuthUI = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // UTILITÁRIOS DE FORMULÁRIO (públicos — usados pelo AuthController)
  // ═══════════════════════════════════════════════════════════

  /**
   * Exibe ou limpa uma mensagem num elemento de erro de formulário.
   * @param {HTMLElement|null} el
   * @param {string}           msg  — vazio para limpar
   * @param {string}           tipo — 'error' | 'success'
   */
  function mostrarErroForm(el, msg, tipo = 'error') {
    if (!el) return;
    el.textContent = msg;
    el.className   = `form-erro form-erro--${tipo}`;
    el.style.display = msg ? 'block' : 'none';
  }

  /**
   * Habilita ou desabilita um conjunto de inputs de formulário.
   * @param {boolean}           loading
   * @param {HTMLElement[]}     inputs
   */
  function setLoading(loading, inputs) {
    inputs.forEach(el => { if (el) el.disabled = loading; });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — helpers DOM
  // ═══════════════════════════════════════════════════════════

  /** Aplica URL de avatar em todos os slots de imagem de avatar no DOM */
  function _aplicarAvatar(url) {
    if (!url) return;
    const IDS = ['header-avatar-img', 'menu-avatar-img', 'perfil-avatar-img'];
    const aplicar = () => {
      IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.src = url; el.onerror = null; }
      });
    };
    aplicar();
    // Retry após 600 ms — race condition no DOM em mobile
    setTimeout(aplicar, 600);
    // Atualiza o marcador do usuário no mapa
    if (typeof MapWidget !== 'undefined') MapWidget.atualizarMarcadorUsuario();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — helpers de formatação de texto (pertencem à camada UI)
  // ═══════════════════════════════════════════════════════════

  /** Primeira letra maiúscula, restante minúsculo. @param {string} str */
  function _capitalize(str) {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Capitalização inteligente de nome completo.
   * Normaliza para Title Case apenas quando o nome estiver todo maiúsculo
   * ou todo minúsculo; caso contrário respeita a digitação original.
   * @param {string} nome
   * @returns {string}
   */
  function _capitalizarNome(nome) {
    if (!nome) return nome;
    const semEspacos = nome.trim();
    const tudoMaius  = semEspacos === semEspacos.toUpperCase();
    const tudoMinus  = semEspacos === semEspacos.toLowerCase();
    if (tudoMaius || tudoMinus) {
      return semEspacos
        .split(/\s+/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }
    return semEspacos;
  }

  /**
   * Formata a data de cadastro para exibição na tela de perfil.
   * @param {string|null} isoDate — created_at do Supabase Auth
   * @param {string} role — 'client' | 'professional'
   * @param {string|null} proType — null | 'barbearia'
   * @returns {string}
   */
  function _formatarDataCadastro(isoDate, role = 'client', proType = null) {
    let prefixo;
    if (role === 'professional') {
      prefixo = proType === 'barbearia' ? 'Barbeiro c/ Barbearia' : 'Barbeiro';
    } else {
      prefixo = 'Cliente';
    }
    if (!isoDate) return `${prefixo} BarberFlow`;
    const d   = new Date(isoDate);
    const mes = d.toLocaleString('pt-BR', { month: 'long' });
    const ano = d.getFullYear();
    return `${prefixo} desde ${mes} de ${ano}`;
  }

  /** Renderiza os itens do menu lateral usando NavConfig como fonte única */
  function _renderizarMenu(logado) {
    const lista = document.querySelector('.menu-list-nav');
    if (!lista || typeof NavConfig === 'undefined') return;
    lista.innerHTML = NavConfig.renderMenuHtml(logado);
  }

  /**
   * Atualiza o botão variável do footer no app profissional de acordo com o
   * pro_type do usuário logado:
   *   - 'barbearia' → mantém "Minha Barbearia" (tela minha-barbearia)
   *   - qualquer outro valor (null ou 'barbeiro') → "Barbearias Parceiras"
   * Chamado logo após o login para refletir o tipo do usuário.
   */
  function _atualizarFooterNavPro(perfil) {
    const btn = document.getElementById('footer-nav-barbearia-btn');
    if (!btn) return; // só existe no app profissional
    if (perfil?.pro_type === 'barbearia') {
      btn.dataset.tela     = 'minha-barbearia';
      btn.setAttribute('onclick', "Pro.nav('minha-barbearia')");
      const img = btn.querySelector('img');
      if (img) img.alt = 'Minha Barbearia';
      const label = btn.querySelector('.nav-label');
      if (label) label.textContent = 'Minha Barbearia';
    } else {
      btn.dataset.tela     = 'barbearias';
      btn.setAttribute('onclick', "Pro.nav('barbearias')");
      const img = btn.querySelector('img');
      if (img) img.alt = 'Barbearias Parceiras';
      const label = btn.querySelector('.nav-label');
      if (label) label.textContent = 'Barbearias Parceiras';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — handler auth:login
  // ═══════════════════════════════════════════════════════════

  function _onLogin({ perfil, user }) {
    const nomeRaw = perfil?.full_name || user?.email?.split('@')[0] || 'Usuário';
    const nome    = _capitalizarNome(nomeRaw);
    const email   = user?.email || '';
    const p       = AuthService._prefix();

    // Header — "Olá, Nome"
    const label = document.getElementById('header-user-label');
    if (label) {
      const primeiro = nome.split(' ')[0];
      label.textContent = 'Olá, ' + _capitalize(primeiro);
    }

    const headerBtn = document.getElementById('header-avatar-btn');
    if (headerBtn) headerBtn.setAttribute('onclick', `${p}.nav('perfil')`);

    // Tela de perfil — nome e subtítulo
    const perfilNome = document.getElementById('perfil-nome');
    if (perfilNome) perfilNome.textContent = nome;

    const perfilSub = document.getElementById('perfil-sub');
    if (perfilSub) {
      const createdAt = perfil?._created_at || user?.created_at || null;
      perfilSub.textContent = _formatarDataCadastro(
        createdAt, perfil?.role, perfil?.pro_type
      );
    }

    // Tela de perfil — campos editáveis (PerfilEditor)
    if (typeof PerfilEditor !== 'undefined') {
      const extras       = SessionCache.getExtras(perfil?.id);
      const dadosCompl   = extras ? { ...perfil, ...extras } : perfil;
      PerfilEditor.popular(dadosCompl);
    }

    // Avatar — aplica URL e persiste no cache local
    if (perfil?.avatar_path) {
      const url = SupabaseService.getAvatarUrl(perfil.avatar_path);
      _aplicarAvatar(url);
      SessionCache.salvarAvatar(url);
    }

    // Menu lateral — nome + email (sem innerHTML — previne XSS)
    const mu = document.getElementById('menu-username');
    if (mu) {
      mu.textContent = '';
      const small = document.createElement('small');
      small.id          = 'menu-user-sub';
      small.textContent = InputValidator.sanitizar(email);
      mu.appendChild(document.createTextNode(InputValidator.sanitizar(nome) + ' '));
      mu.appendChild(small);
    }

    // Habilita botão de upload de avatar
    document.getElementById('menu-avatar')?.classList.add('logado');

    // Hint de GPS — primeiro nome do usuário
    const hintNome = document.getElementById('nearby-hint-nome');
    if (hintNome) hintNome.textContent = nome.split(' ')[0];

    // Router e menu
    AuthService._instancia()?.entrar();
    _renderizarMenu(true);
    _atualizarFooterNavPro(perfil);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — handler auth:logout
  // ═══════════════════════════════════════════════════════════

  function _onLogout() {
    const p = AuthService._prefix();

    const label = document.getElementById('header-user-label');
    if (label) label.textContent = 'Entrar';

    const headerBtn = document.getElementById('header-avatar-btn');
    if (headerBtn) headerBtn.setAttribute('onclick', `${p}.irParaLogin()`);

    // Avatares — imagem padrão
    ['header-avatar-img', 'menu-avatar-img', 'perfil-avatar-img'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.src = '/shared/img/icones-perfil.png';
    });

    // Tela de perfil
    const perfilNome = document.getElementById('perfil-nome');
    if (perfilNome) perfilNome.textContent = '';
    const perfilSub = document.getElementById('perfil-sub');
    if (perfilSub)  perfilSub.textContent  = '';
    if (typeof PerfilEditor !== 'undefined') PerfilEditor.limpar();

    // Mapa — volta para ícone padrão
    if (typeof MapWidget !== 'undefined') MapWidget.atualizarMarcadorUsuario();

    // Menu lateral
    document.getElementById('menu-avatar')?.classList.remove('logado');

    const hintNome = document.getElementById('nearby-hint-nome');
    if (hintNome) hintNome.textContent = 'Anônimo';

    const nomeVisitante = typeof App !== 'undefined' ? 'Visitante Cliente' : 'Visitante Profissional';
    const mu = document.getElementById('menu-username');
    if (mu) {
      mu.textContent = '';
      const small = document.createElement('small');
      small.id          = 'menu-user-sub';
      small.textContent = 'Faça login para continuar';
      mu.appendChild(document.createTextNode(nomeVisitante + ' '));
      mu.appendChild(small);
    }

    // Router e menu
    AuthService._instancia()?.sair();
    _renderizarMenu(false);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — handler auth:error (context-aware)
  // ═══════════════════════════════════════════════════════════

  function _onError({ message, context }) {
    if (context === 'login') {
      const el = document.getElementById('login-erro');
      mostrarErroForm(el, message, 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════

  /**
   * Registra todos os listeners de eventos de autenticação.
   * Chamado automaticamente quando o DOM estiver pronto.
   * Seguro chamar múltiplas vezes — usa flag de guarda.
   */
  let _iniciado = false;
  function init() {
    if (_iniciado) return;
    _iniciado = true;

    document.addEventListener('auth:login',  e => _onLogin(e.detail));
    document.addEventListener('auth:logout', () => _onLogout());
    document.addEventListener('auth:avatar', e => _aplicarAvatar(e.detail.url));
    document.addEventListener('auth:menu',   e => _renderizarMenu(e.detail.logado));
    document.addEventListener('auth:error',  e => _onError(e.detail));
  }

  /**
   * Força reaplicação do avatar em cache a todos os slots no DOM.
   * Mantém compatibilidade com chamadas externas a AuthService.reaplicarAvatar().
   */
  function reaplicarAvatar() {
    // Delega para o AuthService que dispara auth:avatar com a URL armazenada
    if (typeof AuthService !== 'undefined') AuthService.reaplicarAvatar();
  }

  // Auto-inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return Object.freeze({ init, reaplicarAvatar, mostrarErroForm, setLoading });
})();
