'use strict';

// =============================================================
// CriarBarbeariaPage.js — Tela "Criar Barbearia" do app profissional.
// Permite que um barbeiro sem barbearia crie uma com nome e telefone.
// Após salvar, navega automaticamente para "Minha Barbearia".
//
// Dependências: SupabaseService.js, AuthService.js, InputValidator.js,
//               NotificationService.js
// =============================================================

class CriarBarbeariaPage {

  #telaEl    = null;
  #inputNome = null;
  #inputTel  = null;
  #btnCriar  = null;
  #msgEl     = null;

  constructor() {}

  bind() {
    this.#telaEl = document.getElementById('tela-criar');
    if (!this.#telaEl) return;

    this.#inputNome = document.getElementById('criar-nome');
    this.#inputTel  = document.getElementById('criar-tel');
    this.#btnCriar  = document.getElementById('criar-btn');
    this.#msgEl     = document.getElementById('criar-msg');

    this.#btnCriar?.addEventListener('click', () => this.#criar());

    // Enter no input também confirma
    [this.#inputNome, this.#inputTel].forEach(el => {
      el?.addEventListener('keydown', e => { if (e.key === 'Enter') this.#criar(); });
    });

    // Ao entrar na tela, pré-preenche e limpa mensagens antigas
    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privados ────────────────────────────────────────────────

  #aoEntrar() {
    if (this.#msgEl) this.#msgEl.textContent = '';
    if (this.#btnCriar) {
      this.#btnCriar.disabled    = false;
      this.#btnCriar.textContent = 'Criar Barbearia';
    }

    // Pré-preenche nome com o nome do profissional se campo vazio
    if (this.#inputNome && !this.#inputNome.value.trim()) {
      const perfil = AuthService.getPerfil?.();
      if (perfil?.full_name) {
        this.#inputNome.value = `${perfil.full_name} Barbearia`;
      }
    }
  }

  async #criar() {
    const nome = this.#inputNome?.value?.trim() ?? '';
    const tel  = this.#inputTel?.value?.trim()  ?? '';

    // Validação do nome
    if (!nome) {
      this.#setMsg('Digite o nome da barbearia.', true);
      this.#inputNome?.focus();
      return;
    }

    const rNome = InputValidator.textoLivre(nome, 100);
    if (!rNome.ok) {
      this.#setMsg(rNome.msg, true);
      return;
    }

    // Usuário logado — usa cache local (sem rede extra)
    const perfil = AuthService.getPerfil?.();
    if (!perfil?.id) {
      this.#setMsg('Você precisa estar logado para criar uma barbearia.', true);
      return;
    }

    // Verifica se já existe barbearia (evita duplicata)
    const { data: existente } = await SupabaseService.barbershops()
      .select('id')
      .eq('owner_id', perfil.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      this.#setMsg('Você já possui uma barbearia cadastrada.', true);
      setTimeout(() => {
        if (typeof Pro !== 'undefined') Pro.nav('minha-barbearia');
      }, 1500);
      return;
    }

    // Desabilita botão durante requisição
    if (this.#btnCriar) {
      this.#btnCriar.disabled    = true;
      this.#btnCriar.textContent = 'Criando…';
    }
    this.#setMsg('');

    try {
      const payload = {
        owner_id:  perfil.id,
        name:      rNome.valor,
        is_active: true,
        is_open:   false,
      };
      if (tel) payload.phone = tel;

      const { error } = await SupabaseService.barbershops().insert(payload);
      if (error) throw error;

      // Atualiza pro_type no banco — barbeiro agora é dono de barbearia
      await SupabaseService.profiles()
        .update({ pro_type: 'barbearia' })
        .eq('id', perfil.id);

      // Atualiza UI imediatamente sem precisar de reload
      this.#atualizarUIPosCriacao();

      this.#setMsg('✅ Barbearia criada com sucesso!', false);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast(
          'Barbearia criada!',
          'Configure a localização para aparecer no mapa dos clientes.',
          NotificationService.TIPOS?.SISTEMA ?? 'sistema'
        );
      }

      // Limpa campos e navega para Minha Barbearia após 1,2s
      if (this.#inputNome) this.#inputNome.value = '';
      if (this.#inputTel)  this.#inputTel.value  = '';

      setTimeout(() => {
        if (typeof Pro !== 'undefined') Pro.nav('minha-barbearia');
      }, 1200);

    } catch (e) {
      this.#setMsg(e?.message ?? 'Erro ao criar barbearia. Tente novamente.', true);
      if (this.#btnCriar) {
        this.#btnCriar.disabled    = false;
        this.#btnCriar.textContent = 'Criar Barbearia';
      }
    }
  }

  /**
   * Após criação bem-sucedida, atualiza o DOM imediatamente:
   * oculta o botão "+ Criar" e troca o nav do footer para "Minha Barbearia".
   */
  #atualizarUIPosCriacao() {
    // Oculta botão "+ Criar" — não faz mais sentido após ter barbearia
    const btnCriar = document.getElementById('btn-perfil-criar');
    if (btnCriar) btnCriar.style.display = 'none';

    // Atualiza footer nav para refletir novo estado
    const footerBtn = document.getElementById('footer-nav-barbearia-btn');
    if (footerBtn) {
      footerBtn.dataset.tela = 'minha-barbearia';
      footerBtn.setAttribute('onclick', "Pro.nav('minha-barbearia')");
      const img   = footerBtn.querySelector('img');
      const label = footerBtn.querySelector('.nav-label');
      if (img)   img.alt           = 'Minha Barbearia';
      if (label) label.textContent = 'Minha Barbearia';
    }
  }

  #setMsg(texto, isErro = false) {
    if (!this.#msgEl) return;
    this.#msgEl.textContent = texto;
    this.#msgEl.className   = isErro ? 'form-erro criar-msg' : 'criar-msg criar-msg--ok';
  }
}
