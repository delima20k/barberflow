'use strict';

// =============================================================
// ProfessionalDocumentGuard.js — Exige CPF/CNPJ profissional via BFF
// =============================================================

class ProfessionalDocumentGuard {
  static #modalAberto = null;

  static async ensure({ perfil = null } = {}) {
    const perfilInicial = perfil || (typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null);
    if (perfilInicial?.hasDocument === true) return true;
    if (perfilInicial?.role && perfilInicial.role !== 'professional') return true;

    const perfilAtual = await ProfessionalDocumentGuard.#carregarPerfilSeguro();
    if (perfilAtual?.role && perfilAtual.role !== 'professional') return true;
    if (perfilAtual?.hasDocument === true) {
      ProfessionalDocumentGuard.#marcarDocumentoSalvo();
      return true;
    }

    const documento = await ProfessionalDocumentGuard.#abrirModalDocumento();
    const { error } = await BffApiService.auth.salvarDocumento(documento);
    if (error) {
      throw new Error(error.message || 'Nao foi possivel salvar o documento profissional.');
    }

    ProfessionalDocumentGuard.#marcarDocumentoSalvo();
    if (typeof AuthService !== 'undefined' && typeof AuthService.recarregarPerfil === 'function') {
      await AuthService.recarregarPerfil().catch(() => null);
    }
    return true;
  }

  static async #carregarPerfilSeguro() {
    if (typeof BffApiService === 'undefined' || !BffApiService.auth?.me) {
      return typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
    }
    const { data, error } = await BffApiService.auth.me();
    if (error) throw new Error(error.message || 'Nao foi possivel validar seu cadastro profissional.');
    const perfil = data?.perfil ?? null;
    if (perfil && typeof AuthService !== 'undefined') AuthService.patchPerfil?.(perfil);
    return perfil;
  }

  static #marcarDocumentoSalvo() {
    if (typeof AuthService !== 'undefined') AuthService.patchPerfil?.({ hasDocument: true });
  }

  static #abrirModalDocumento() {
    if (ProfessionalDocumentGuard.#modalAberto) return ProfessionalDocumentGuard.#modalAberto;

    ProfessionalDocumentGuard.#modalAberto = new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'pdoc-modal';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'pdoc-modal-title');

      const card = document.createElement('form');
      card.className = 'pdoc-modal__card';
      card.noValidate = true;

      const title = document.createElement('h2');
      title.id = 'pdoc-modal-title';
      title.className = 'pdoc-modal__title';
      title.textContent = 'Informe seu CPF ou CNPJ';

      const text = document.createElement('p');
      text.className = 'pdoc-modal__text';
      text.textContent = 'Para continuar com segurança, precisamos salvar seu documento profissional de forma criptografada.';

      const label = document.createElement('label');
      label.className = 'pdoc-modal__label';
      label.textContent = 'CPF ou CNPJ';

      const input = document.createElement('input');
      input.className = 'pdoc-modal__input';
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.placeholder = 'Digite somente numeros';
      input.maxLength = 18;
      label.appendChild(input);

      const erro = document.createElement('p');
      erro.className = 'pdoc-modal__erro';
      erro.setAttribute('aria-live', 'polite');

      const button = document.createElement('button');
      button.type = 'submit';
      button.className = 'btn btn-gold btn-full pdoc-modal__btn';
      button.textContent = 'Salvar e continuar';

      card.append(title, text, label, erro, button);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      document.body.classList.add('pdoc-modal-open');
      setTimeout(() => input.focus(), 0);

      card.addEventListener('submit', (event) => {
        event.preventDefault();
        const digits = String(input.value || '').replace(/\D/g, '');
        const valido = ProfessionalDocumentGuard.#validarDocumento(digits);
        if (!valido.ok) {
          erro.textContent = valido.msg;
          return;
        }
        input.value = '';
        document.body.classList.remove('pdoc-modal-open');
        overlay.remove();
        ProfessionalDocumentGuard.#modalAberto = null;
        resolve(digits);
      });
    });

    return ProfessionalDocumentGuard.#modalAberto;
  }

  static #validarDocumento(digits) {
    if (digits.length === 11) {
      if (typeof InputValidator !== 'undefined' && typeof InputValidator.cpf === 'function') {
        return InputValidator.cpf(digits, true);
      }
      return { ok: true, msg: '' };
    }
    if (digits.length === 14) {
      if (typeof InputValidator !== 'undefined' && typeof InputValidator.cnpj === 'function') {
        return InputValidator.cnpj(digits, true);
      }
      return { ok: true, msg: '' };
    }
    return { ok: false, msg: 'Informe um CPF com 11 digitos ou CNPJ com 14 digitos.' };
  }
}