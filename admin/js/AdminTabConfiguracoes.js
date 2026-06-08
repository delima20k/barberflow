'use strict';

// =============================================================
// AdminTabConfiguracoes.js — Aba de configuração do Cloudflare R2.
//
// Autenticação:
//   Usa Supabase Auth (email + senha) + tabela admin_users no BFF.
//   Independente do token admin legado das outras abas.
//
// Comunicação:
//   GET  /api/v1/admin/config/r2          — carregar
//   POST /api/v1/admin/config/r2          — salvar
//   POST /api/v1/admin/config/r2/testar   — testar conexão
//   GET  /api/v1/admin/config/r2/secret   — gerar secret
//
// Dependências (carregadas antes deste arquivo):
//   supabase.min.js  — SDK Supabase (window.supabase)
// =============================================================

class AdminTabConfiguracoes {

  static #SUPABASE_URL  = 'https://jfvjisqnzapxxagkbxcu.supabase.co';
  static #SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmdmppc3FuemFweHhhZ2tieGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTAzODUsImV4cCI6MjA5MTA2NjM4NX0.HnPEnl_H-2hap53Q9y1NtR5ffBWddNQJkAB7Grw0-9A';
  static #BFF_URL       = window.location.hostname === 'localhost'
    ? 'http://localhost:3002'
    : 'https://bff.berberflow.shop';

  /** @type {AdminToast} */
  #toast;

  /** @type {import('@supabase/supabase-js').SupabaseClient|null} */
  #supabase = null;

  /** @type {string|null} */
  #accessToken = null;

  // ── Elementos DOM ────────────────────────────────────────
  #tela         = null;
  #loginSection = null;
  #formSection  = null;
  #loginForm    = null;
  #loginErro    = null;
  #configForm   = null;
  #btnSalvar    = null;
  #btnTestar    = null;
  #testeResult  = null;

  /**
   * @param {AdminToast} toast
   */
  constructor(toast) {
    this.#toast = toast;
  }

  init() {
    this.#tela         = document.getElementById('adm-aba-configuracoes');
    this.#loginSection = document.getElementById('adm-cfg-login');
    this.#formSection  = document.getElementById('adm-cfg-form');
    this.#loginForm    = document.getElementById('adm-cfg-login-form');
    this.#loginErro    = document.getElementById('adm-cfg-login-erro');
    this.#configForm   = document.getElementById('adm-cfg-r2-form');
    this.#btnSalvar    = document.getElementById('adm-cfg-btn-salvar');
    this.#btnTestar    = document.getElementById('adm-cfg-btn-testar');
    this.#testeResult  = document.getElementById('adm-cfg-teste-resultado');

    this.#supabase = window.supabase.createClient(
      AdminTabConfiguracoes.#SUPABASE_URL,
      AdminTabConfiguracoes.#SUPABASE_ANON,
      { auth: { persistSession: false } },
    );

    this.#bindLogin();
    this.#bindForm();
    this.#bindToggleSenha();
    this.#bindGerarSecret();
  }

  /**
   * Chamado quando o usuário ativa a aba Configurações.
   * Verifica sessão e exibe login ou formulário conforme o estado.
   */
  async ativar() {
    if (!this.#accessToken) {
      this.#mostrarLogin();
      return;
    }
    await this.#carregarConfig();
  }

  // ── Auth ─────────────────────────────────────────────────

  #bindLogin() {
    this.#loginForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = this.#loginForm.querySelector('[name="email"]')?.value?.trim();
      const senha  = this.#loginForm.querySelector('[name="senha"]')?.value;
      const btn    = this.#loginForm.querySelector('button[type="submit"]');

      if (this.#loginErro) this.#loginErro.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Entrando…';

      try {
        const { data, error } = await this.#supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw new Error(error.message);

        this.#accessToken = data.session?.access_token ?? null;
        if (!this.#accessToken) throw new Error('Sessão inválida. Tente novamente.');

        await this.#carregarConfig();
      } catch (err) {
        if (this.#loginErro) this.#loginErro.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });
  }

  // ── Formulário ────────────────────────────────────────────

  #bindForm() {
    this.#btnSalvar?.addEventListener('click', () => this.#salvar());
    this.#btnTestar?.addEventListener('click', () => this.#testarConexao());
  }

  #bindToggleSenha() {
    this.#tela?.querySelectorAll('[data-toggle-senha]').forEach(btn => {
      const targetId = btn.dataset.toggleSenha;
      btn.addEventListener('click', () => this.#toggleSenha(targetId, btn));
    });
  }

  #bindGerarSecret() {
    document.getElementById('adm-cfg-btn-gerar-secret')
      ?.addEventListener('click', () => this.#gerarSecret());
  }

  async #carregarConfig() {
    this.#mostrarForm();
    this.#setCarregando(true);

    try {
      const res  = await this.#bffFetch('GET', '/r2');
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          this.#toast.erro('Acesso negado. Verifique se seu e-mail está na tabela admin_users.');
          this.#accessToken = null;
          this.#mostrarLogin();
          return;
        }
        throw new Error(data.error ?? `Erro ${res.status}`);
      }

      this.#preencherFormulario(data.config ?? {});
    } catch (err) {
      this.#toast.erro(err.message);
    } finally {
      this.#setCarregando(false);
    }
  }

  async #salvar() {
    const campos = this.#coletarFormulario();
    this.#btnSalvar.disabled = true;
    this.#btnSalvar.textContent = 'Salvando…';

    try {
      const res  = await this.#bffFetch('POST', '/r2', campos);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);

      this.#toast.sucesso('Configurações salvas com sucesso.');
      await this.#carregarConfig();
    } catch (err) {
      this.#toast.erro(err.message);
    } finally {
      this.#btnSalvar.disabled = false;
      this.#btnSalvar.textContent = 'Salvar';
    }
  }

  async #testarConexao() {
    this.#btnTestar.disabled = true;
    this.#btnTestar.textContent = 'Testando…';
    if (this.#testeResult) {
      this.#testeResult.textContent = '';
      this.#testeResult.className   = 'adm-cfg-teste-resultado';
    }

    try {
      const res  = await this.#bffFetch('POST', '/r2/testar');
      const data = await res.json();

      if (this.#testeResult) {
        this.#testeResult.textContent = data.detalhes?.join('\n') ?? (data.ok ? 'Conexão OK' : 'Falha na conexão');
        this.#testeResult.className   = `adm-cfg-teste-resultado adm-cfg-teste-resultado--${data.ok ? 'ok' : 'erro'}`;
      }
      if (data.ok) {
        this.#toast.sucesso('Conexão com o Cloudflare R2 verificada com sucesso.');
      } else {
        this.#toast.erro('Falha na conexão. Verifique as credenciais.');
      }
    } catch (err) {
      this.#toast.erro(err.message);
    } finally {
      this.#btnTestar.disabled = false;
      this.#btnTestar.textContent = 'Testar Conexão';
    }
  }

  async #gerarSecret() {
    const btn = document.getElementById('adm-cfg-btn-gerar-secret');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }

    try {
      const res  = await this.#bffFetch('GET', '/r2/secret');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar secret.');

      const input = document.getElementById('adm-cfg-mediaConfirmSecret');
      if (input) {
        input.value = data.secret;
        input.type  = 'text';
        const toggleBtn = this.#tela?.querySelector('[data-toggle-senha="adm-cfg-mediaConfirmSecret"]');
        if (toggleBtn) toggleBtn.textContent = 'Ocultar';
      }
      this.#toast.info('Secret gerado. Clique em Salvar para persistir.');
    } catch (err) {
      this.#toast.erro(err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Gerar automaticamente'; }
    }
  }

  // ── Helpers DOM ───────────────────────────────────────────

  #mostrarLogin() {
    if (this.#loginSection) this.#loginSection.style.display = '';
    if (this.#formSection)  this.#formSection.style.display  = 'none';
    this.#loginForm?.reset();
    if (this.#loginErro) this.#loginErro.textContent = '';
  }

  #mostrarForm() {
    if (this.#loginSection) this.#loginSection.style.display = 'none';
    if (this.#formSection)  this.#formSection.style.display  = '';
  }

  #setCarregando(loading) {
    if (this.#btnSalvar) this.#btnSalvar.disabled = loading;
    if (this.#btnTestar) this.#btnTestar.disabled = loading;
  }

  #preencherFormulario(config) {
    const campos = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName', 'publicUrl', 'mediaConfirmSecret', 'storageBackend'];
    campos.forEach(campo => {
      const el = document.getElementById(`adm-cfg-${campo}`);
      if (!el) return;
      const val = config[campo] ?? '';
      if (el.tagName === 'SELECT') {
        el.value = val;
      } else {
        el.placeholder = val === '***' ? '(salvo — campo oculto por segurança)' : '';
        if (val !== '***') el.value = val;
      }
    });
  }

  #coletarFormulario() {
    const campos = {};
    const ids = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName', 'publicUrl', 'mediaConfirmSecret', 'storageBackend'];
    ids.forEach(campo => {
      const el = document.getElementById(`adm-cfg-${campo}`);
      if (!el) return;
      const val = el.value?.trim();
      if (val) campos[campo] = val;
    });
    return campos;
  }

  /**
   * @param {string} inputId
   * @param {HTMLButtonElement} btn
   */
  #toggleSenha(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword  = input.type === 'password';
    input.type        = isPassword ? 'text' : 'password';
    btn.textContent   = isPassword ? 'Ocultar' : 'Mostrar';
  }

  // ── Fetch ─────────────────────────────────────────────────

  /**
   * @param {'GET'|'POST'} method
   * @param {string}       path   — ex: '/r2', '/r2/testar'
   * @param {object}       [body]
   * @returns {Promise<Response>}
   */
  async #bffFetch(method, path, body = null) {
    const url = `${AdminTabConfiguracoes.#BFF_URL}/api/v1/admin/config${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (this.#accessToken) headers['Authorization'] = `Bearer ${this.#accessToken}`;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    return fetch(url, opts);
  }
}
