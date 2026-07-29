'use strict';

class VoucherModal {
  #service;
  #availabilityChecked;
  #clipboard;
  #analytics;

  constructor(root = document, service = new VoucherService(), options = {}) {
    this.root = root;
    this.modal = root.querySelector('[data-voucher-modal]');
    this.openButtons = [...root.querySelectorAll('[data-open-voucher]')];
    this.closeButtons = [...(this.modal?.querySelectorAll('[data-modal-close]') ?? [])];
    this.form = this.modal?.querySelector('[data-voucher-form]') ?? null;
    this.formView = this.modal?.querySelector('[data-voucher-form-view]') ?? null;
    this.successView = this.modal?.querySelector('[data-voucher-success]') ?? null;
    this.availability = this.modal?.querySelector('[data-voucher-availability]') ?? null;
    this.availabilityNote = this.modal?.querySelector('[data-voucher-mode]') ?? null;
    this.error = this.modal?.querySelector('[data-voucher-error]') ?? null;
    this.loading = this.modal?.querySelector('[data-voucher-loading]') ?? null;
    this.submitButton = this.modal?.querySelector('[data-voucher-submit]') ?? null;
    this.copyButton = this.modal?.querySelector('[data-copy-voucher]') ?? null;
    this.copyStatus = this.modal?.querySelector('[data-copy-status]') ?? null;
    this.code = this.modal?.querySelector('[data-voucher-code]') ?? null;
    this.successTitle = this.modal?.querySelector('[data-voucher-success-title]') ?? null;
    this.lastFocused = null;
    this.#service = service;
    this.#availabilityChecked = false;
    this.#clipboard = options.clipboard ?? globalThis.navigator?.clipboard ?? null;
    this.#analytics = options.analytics ?? null;
    this.handleOpen = this.handleOpen.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  init() {
    if (!this.modal) return this;
    this.openButtons.forEach((button) => button.addEventListener('click', this.handleOpen));
    this.closeButtons.forEach((button) => button.addEventListener('click', this.handleClose));
    this.form?.addEventListener('submit', this.handleSubmit);
    this.copyButton?.addEventListener('click', this.handleCopy);
    this.root.addEventListener('keydown', this.handleKeydown);
    return this;
  }

  handleOpen(event) {
    event.preventDefault();
    this.open(event.currentTarget);
  }

  handleClose() {
    this.close();
  }

  handleKeydown(event) {
    if (this.modal.getAttribute('aria-hidden') !== 'false') return;

    if (event.key === 'Escape') {
      this.close();
      return;
    }

    if (event.key === 'Tab') this.keepFocusInside(event);
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (!this.form?.checkValidity()) {
      this.form?.reportValidity();
      return;
    }

    this.setLoading(true);
    this.showError('');
    try {
      const formData = new FormData(this.form);
      const result = await this.#service.generateVoucher({
        email: String(formData.get('email') ?? '').trim(),
        campaignConsent: true,
        company: String(formData.get('company') ?? '').trim(),
      });

      if (result?.ok && typeof result.code === 'string' && result.code.trim()) {
        this.showSuccess(result.code.trim());
        if (Number.isInteger(result.remaining)) {
          this.updateAvailabilityCount(result.remaining);
        }
        return;
      }

      this.showError(
        result?.message
          ?? 'Não foi possível gerar o voucher. Tente novamente mais tarde.',
      );
      if (Number.isInteger(result?.remaining)) {
        this.updateAvailabilityCount(result.remaining);
      }
    } catch {
      this.showError('A integração segura ainda não está disponível.');
    } finally {
      this.setLoading(false);
      if (this.availability?.dataset.state === 'unavailable' && this.submitButton) {
        this.submitButton.disabled = true;
      }
    }
  }

  async handleCopy() {
    const code = this.code?.value?.trim();
    if (!code || !this.#clipboard?.writeText) {
      this.setCopyStatus('Não foi possível copiar automaticamente.');
      return;
    }

    try {
      await this.#clipboard.writeText(code);
      this.setCopyStatus('Código copiado.');
    } catch {
      this.setCopyStatus('Não foi possível copiar automaticamente.');
    }
  }

  keepFocusInside(event) {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'details > summary',
    ].join(',');
    const focusable = [...this.modal.querySelectorAll(selector)]
      .filter((element) => !element.closest('[hidden]'));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && this.root.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && this.root.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  open(trigger) {
    this.lastFocused = trigger;
    this.modal.setAttribute('aria-hidden', 'false');
    this.root.body.classList.add('modal-open');
    this.modal.querySelector('.modal__close')?.focus();
    this.#analytics?.track?.('voucher_modal_open');
    if (!this.#availabilityChecked) this.checkAvailability();
  }

  close() {
    this.modal.setAttribute('aria-hidden', 'true');
    this.root.body.classList.remove('modal-open');
    this.lastFocused?.focus();
  }

  async checkAvailability() {
    this.#availabilityChecked = true;
    this.setAvailability('Consultando disponibilidade segura…', 'loading');
    try {
      const result = await this.#service.checkAvailability();
      if (result?.ok && Number.isInteger(result.remaining) && result.remaining >= 0) {
        const label = result.remaining === 1
          ? '1 voucher restante'
          : `${result.remaining} vouchers restantes`;
        this.setAvailability(label, result.remaining > 0 ? 'available' : 'unavailable');
        if (this.submitButton) this.submitButton.disabled = result.remaining === 0;
        return;
      }

      this.setAvailability(
        'Disponibilidade real ainda não conectada. Nenhuma contagem fictícia é exibida.',
        'development',
      );
    } catch {
      this.setAvailability('Não foi possível consultar a disponibilidade.', 'error');
    }
  }

  showSuccess(code) {
    this.code.value = code;
    this.formView.hidden = true;
    this.successView.hidden = false;
    this.successTitle?.focus();
    this.#analytics?.track?.('voucher_generated');
  }

  showError(message) {
    if (!this.error) return;
    this.error.textContent = message;
    this.error.hidden = !message;
  }

  setLoading(active) {
    if (this.loading) this.loading.hidden = !active;
    if (this.submitButton) {
      this.submitButton.disabled = active;
      this.submitButton.setAttribute('aria-busy', String(active));
    }
  }

  setAvailability(message, state) {
    if (!this.availability) return;
    this.availability.textContent = message;
    this.availability.dataset.state = state;
    if (this.availabilityNote) {
      const notes = {
        available: 'Saldo informado pela API segura da campanha.',
        unavailable: 'Saldo informado pela API segura da campanha.',
        development: 'Nenhum código ou contador é criado no navegador.',
        loading: 'Apenas informações fornecidas pelo servidor serão exibidas.',
        error: 'Tente consultar novamente mais tarde.',
      };
      this.availabilityNote.textContent = notes[state] ?? '';
    }
  }

  updateAvailabilityCount(remaining) {
    const label = remaining === 1
      ? '1 voucher restante'
      : `${remaining} vouchers restantes`;
    this.setAvailability(label, remaining > 0 ? 'available' : 'unavailable');
    if (this.submitButton) this.submitButton.disabled = remaining === 0;
  }

  setCopyStatus(message) {
    if (this.copyStatus) this.copyStatus.textContent = message;
  }

  destroy() {
    this.openButtons.forEach((button) => button.removeEventListener('click', this.handleOpen));
    this.closeButtons.forEach((button) => button.removeEventListener('click', this.handleClose));
    this.form?.removeEventListener('submit', this.handleSubmit);
    this.copyButton?.removeEventListener('click', this.handleCopy);
    this.root.removeEventListener('keydown', this.handleKeydown);
  }
}

globalThis.VoucherModal = VoucherModal;
