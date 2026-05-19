// =============================================================
// AuthController.js — Binding programático dos formulários de auth
//
// Encapsula os addEventListener de submit nos 3 forms:
//   #login-form, #cad-form, #rec-form
//
// Elimina onsubmit="App.fazerLogin()" do HTML — a lógica de
// negócio não pertence ao template, pertence ao controller.
//
// Compartilhado entre app cliente e app profissional.
// Dependências: AuthService.js, AuthUI.js, InputValidator.js
// =============================================================

class AuthController {

  #navFn;       // (tela: string) => void — função de navegação do app
  #role;        // 'client' | 'professional'
  #getProType;  // () => 'barbeiro' | 'barbearia' | null

  /**
   * @param {function(string): void}  navFn      — ex: (tela) => App.nav(tela)
   * @param {'client'|'professional'} role
   * @param {function(): string|null} getProType — retorna pro_type atual (só Pro)
   */
  constructor(navFn, role = 'client', getProType = () => null) {
    this.#navFn      = navFn;
    this.#role       = role;
    this.#getProType = getProType;
  }

  /**
   * Registra os listeners nos 3 forms de auth.
   * Chame uma vez no constructor do App (o DOM já está parseado nesse momento).
   */
  bind() {
    this.#bindLogin();
    this.#bindCadastro();
    this.#bindRecuperacao();
  }

  // ── Privados ──────────────────────────────────────────────

  #bindLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById('login-email');
      const senhaEl = document.getElementById('login-senha');
      const erroEl  = document.getElementById('login-erro');

      AuthUI.setLoading(true, [emailEl, senhaEl]);
      await AuthService.login(
        emailEl?.value,
        senhaEl?.value,
        this.#navFn,
        (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo)
      );
      AuthUI.setLoading(false, [emailEl, senhaEl]);
    });
  }

  #bindCadastro() {
    const form = document.getElementById('cad-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erroEl = document.getElementById('cad-erro');
      const dados = {
        nome:     document.getElementById('cad-nome')?.value,
        email:    document.getElementById('cad-email')?.value,
        telefone: document.getElementById('cad-tel')?.value,
        senha:    document.getElementById('cad-senha')?.value,
        senha2:   document.getElementById('cad-senha2')?.value,
        role:     this.#role,
      };
      if (this.#role === 'professional') {
        dados.barbearia = document.getElementById('cad-barbearia')?.value;
        dados.cpf       = document.getElementById('cad-cpf')?.value  || null;
        dados.cnpj      = document.getElementById('cad-cnpj')?.value || null;
        dados.pro_type  = this.#getProType();
      }
      await AuthService.cadastro(dados, (tela) => {
        if (this.#role === 'professional' && typeof MonetizationGuard !== 'undefined') {
          MonetizationGuard.limpar();
        }
        this.#navFn(tela);
      }, (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo));
    });
  }

  #bindRecuperacao() {
    const form = document.getElementById('rec-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const erroEl = document.getElementById('rec-erro');
      await AuthService.recuperarSenha(
        document.getElementById('rec-email')?.value,
        this.#navFn,
        (msg, tipo = 'error') => AuthUI.mostrarErroForm(erroEl, msg, tipo)
      );
    });
  }
}

