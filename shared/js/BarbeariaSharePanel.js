'use strict';

/**
 * BarbeariaSharePanel — card da página "Minha Barbearia" que permite ao dono
 * divulgar o link público da barbearia via WhatsApp (Web Share API com fallback
 * wa.me) e copiar o link.
 *
 * O link aponta para a rota /b/:id do BFF, que renderiza preview rico
 * (Open Graph) e redireciona o visitante para a página pública da barbearia
 * no app cliente (?barbearia=<id>).
 *
 * Camada: interfaces (UI). Sem regra de negócio — só apresenta e dispara o
 * compartilhamento nativo do dispositivo.
 */
class BarbeariaSharePanel {
  #root;
  #linkInput = null;
  #shareBtn  = null;
  #copyBtn   = null;
  #statusEl  = null;
  #statusTimer = null;

  #barbershopId = null;
  #nome = '';
  #bffBaseUrl;

  /**
   * @param {HTMLElement} rootEl — a <section> do card
   * @param {object} [opts]
   * @param {string} [opts.bffBaseUrl] — base do BFF (ex.: https://bff.berberflow.shop)
   */
  constructor(rootEl, { bffBaseUrl } = {}) {
    this.#root = rootEl || null;
    const base = bffBaseUrl
      ?? (typeof window !== 'undefined' ? window.BFF_URL : '')
      ?? '';
    this.#bffBaseUrl = String(base).replace(/\/$/, '');
  }

  /** Liga os listeners dos botões (idempotente — chamar uma vez). */
  montar() {
    if (!this.#root) return this;
    this.#linkInput = this.#root.querySelector('[data-mb-share-link]');
    this.#shareBtn  = this.#root.querySelector('[data-mb-share-whats]');
    this.#copyBtn   = this.#root.querySelector('[data-mb-share-copy]');
    this.#statusEl  = this.#root.querySelector('[data-mb-share-status]');
    this.#shareBtn?.addEventListener('click', () => { void this.#compartilhar(); });
    this.#copyBtn?.addEventListener('click', () => { void this.#copiar(); });
    return this;
  }

  /**
   * Atualiza o card com a barbearia atual. Oculta se faltar id ou base do BFF.
   * @param {{ barbershopId?: string, nome?: string }} [dados]
   */
  atualizar({ barbershopId, nome } = {}) {
    this.#barbershopId = barbershopId || null;
    this.#nome = String(nome || '');
    const ok = !!(this.#barbershopId && this.#bffBaseUrl);
    if (this.#root) this.#root.hidden = !ok;
    if (ok && this.#linkInput) this.#linkInput.value = this.#shareUrl();
    return this;
  }

  // ── Internos ───────────────────────────────────────────────

  #shareUrl() {
    return `${this.#bffBaseUrl}/b/${this.#barbershopId}`;
  }

  #mensagem() {
    const nome = this.#nome || 'minha barbearia';
    return `Agende seu horário na ${nome}! 💈\n${this.#shareUrl()}`;
  }

  async #compartilhar() {
    if (!this.#barbershopId) return;
    const url   = this.#shareUrl();
    const nome  = this.#nome || 'minha barbearia';
    const texto = `Agende seu horário na ${nome}! 💈`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: this.#nome || 'BarberFlow', text: texto, url });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return; // usuário cancelou o menu nativo
      // qualquer outro erro → cai no fallback wa.me
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(this.#mensagem())}`;
    window.open(wa, '_blank', 'noopener');
  }

  async #copiar() {
    if (!this.#barbershopId) return;
    const url = this.#shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.#feedback('Link copiado!');
      return;
    } catch (_) { /* tenta fallback abaixo */ }
    try {
      this.#linkInput?.focus();
      this.#linkInput?.select();
      document.execCommand?.('copy');
      this.#feedback('Link copiado!');
    } catch (__) {
      this.#feedback('Não foi possível copiar.');
    }
  }

  #feedback(msg) {
    if (!this.#statusEl) return;
    this.#statusEl.textContent = msg;
    clearTimeout(this.#statusTimer);
    this.#statusTimer = setTimeout(() => {
      if (this.#statusEl) this.#statusEl.textContent = '';
    }, 2500);
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BarbeariaSharePanel };
}
