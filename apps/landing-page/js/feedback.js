'use strict';

class FeedbackFormController {
  constructor(form, service = new FeedbackService(), analytics = null) {
    this.form = form;
    this.message = form?.querySelector('[name="message"]') ?? null;
    this.counter = form?.querySelector('[data-feedback-count]') ?? null;
    this.status = form?.querySelector('[data-feedback-status]') ?? null;
    this.submitButton = form?.querySelector('[type="submit"]') ?? null;
    this.loading = form?.querySelector('[data-feedback-loading]') ?? null;
    this.honeypot = form?.querySelector('[data-feedback-honeypot]') ?? null;
    this.service = service;
    this.analytics = analytics;
    this.isSubmitting = false;
    this.handleInput = this.handleInput.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  init() {
    if (!this.form || !this.message) return this;
    this.form.addEventListener('input', this.handleInput);
    this.form.addEventListener('submit', this.handleSubmit);
    this.updateCounter();
    return this;
  }

  handleInput(event) {
    if (event.target === this.message) this.updateCounter();
    if (this.status?.textContent) this.showStatus('');
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSubmitting) return;

    if (this.honeypot?.value) {
      this.form.reset();
      this.updateCounter();
      this.showStatus('Mensagem recebida. Obrigado por contribuir.', 'success');
      return;
    }

    if (!this.form.checkValidity()) {
      this.form.reportValidity();
      return;
    }

    this.setLoading(true);
    this.showStatus('');

    try {
      const formData = new FormData(this.form);
      const result = await this.service.submit({
        name: formData.get('name'),
        email: formData.get('email'),
        type: formData.get('type'),
        subject: formData.get('subject'),
        message: formData.get('message'),
        privacyConsent: formData.get('privacyConsent') === 'on',
      });

      if (result?.ok) {
        this.form.reset();
        this.updateCounter();
        this.showStatus(
          'Sugestão enviada com sucesso. Obrigado por ajudar o BarberFlow a evoluir.',
          'success',
        );
        this.analytics?.track?.('cta_click', { buttonName: 'feedback_form_submit' });
        return;
      }

      this.showStatus(
        result?.message ?? 'Não foi possível enviar sua sugestão.',
        'error',
      );
    } catch (error) {
      this.showStatus(
        error?.message ?? 'Não foi possível enviar sua sugestão agora.',
        'error',
      );
    } finally {
      this.setLoading(false);
    }
  }

  updateCounter() {
    if (!this.message || !this.counter) return;
    this.counter.textContent = `${this.message.value.length}/${this.message.maxLength}`;
  }

  setLoading(active) {
    this.isSubmitting = active;
    if (this.submitButton) {
      this.submitButton.disabled = active;
      this.submitButton.setAttribute('aria-busy', String(active));
    }
    if (this.loading) this.loading.hidden = !active;
  }

  showStatus(message, state = '') {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  destroy() {
    this.form?.removeEventListener('input', this.handleInput);
    this.form?.removeEventListener('submit', this.handleSubmit);
  }
}

globalThis.FeedbackFormController = FeedbackFormController;
