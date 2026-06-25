'use strict';

/**
 * BarbeariaSharePanel — card "Divulgue sua barbearia" na página minha-barbearia.
 *
 * Gera uma imagem-convite via Canvas (capa/logo da barbearia + logo BarberFlow +
 * texto de convite para a fila) e compartilha como arquivo de imagem + link
 * direto do app cliente via Web Share API (fallback: abre WhatsApp com o link).
 *
 * O link compartilhado aponta para o app cliente diretamente:
 *   https://app.berberflow.shop/?barbearia=<id>
 *
 * Camada: interfaces (UI). Sem regra de negócio.
 */
class BarbeariaSharePanel {
  /** URL base do app cliente (destino do link compartilhado). */
  static APP_URL = 'https://app.berberflow.shop';

  #root;
  #linkInput  = null;
  #shareBtn   = null;
  #copyBtn    = null;
  #statusEl   = null;
  #previewEl  = null;
  #statusTimer = null;

  #barbershopId = null;
  #nome         = '';
  #coverUrl     = null;   // URL pública da capa/logo da barbearia

  constructor(rootEl) {
    this.#root = rootEl || null;
  }

  /** Liga os listeners dos botões (chamar uma vez em bind). */
  montar() {
    if (!this.#root) return this;
    this.#linkInput = this.#root.querySelector('[data-mb-share-link]');
    this.#shareBtn  = this.#root.querySelector('[data-mb-share-whats]');
    this.#copyBtn   = this.#root.querySelector('[data-mb-share-copy]');
    this.#statusEl  = this.#root.querySelector('[data-mb-share-status]');
    this.#previewEl = this.#root.querySelector('[data-mb-share-preview]');
    this.#shareBtn?.addEventListener('click', () => { void this.#compartilhar(); });
    this.#copyBtn?.addEventListener('click', () => { void this.#copiar(); });
    return this;
  }

  /**
   * Atualiza o card com os dados da barbearia carregada.
   * @param {{ barbershopId?: string, nome?: string, coverUrl?: string }} dados
   */
  atualizar({ barbershopId, nome, coverUrl } = {}) {
    this.#barbershopId = barbershopId || null;
    this.#nome = String(nome || '');
    this.#coverUrl = coverUrl || null;

    const ok = !!this.#barbershopId;
    if (this.#root) this.#root.hidden = !ok;
    if (!ok) return this;

    if (this.#linkInput) this.#linkInput.value = this.#shareUrl();

    // Gera preview assíncrono do card (não bloqueia)
    if (this.#previewEl) void this.#atualizarPreview();
    return this;
  }

  // ── Internos ───────────────────────────────────────────────

  #shareUrl() {
    return `${BarbeariaSharePanel.APP_URL}/?barbearia=${this.#barbershopId}`;
  }

  async #compartilhar() {
    if (!this.#barbershopId) return;
    const url  = this.#shareUrl();
    const nome = this.#nome || 'Barbearia';
    const msg  = `${nome} · BarberFlow\nVocê está convidado! Entre na fila agora 💈`;

    // Tenta gerar o card-imagem
    let cardFile = null;
    try {
      cardFile = await this.#gerarCardBlob();
    } catch (_) { /* sem imagem — compartilha só texto+link */ }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const shareData = { title: nome, text: msg, url };
        if (cardFile && navigator.canShare?.({ files: [cardFile] })) {
          shareData.files = [cardFile];
        }
        await navigator.share(shareData);
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
        // outro erro → fallback WhatsApp
      }
    }

    const wa = `https://wa.me/?text=${encodeURIComponent(`${msg}\n${url}`)}`;
    if (typeof window !== 'undefined') window.open(wa, '_blank', 'noopener');
  }

  async #copiar() {
    if (!this.#barbershopId) return;
    const url = this.#shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.#feedback('Link copiado!');
      return;
    } catch (_) { /* fallback */ }
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

  // ── Canvas card ────────────────────────────────────────────

  /** Atualiza o <img> de preview com o card gerado. */
  async #atualizarPreview() {
    try {
      const file = await this.#gerarCardBlob();
      if (!this.#previewEl) return;
      const old = this.#previewEl.src;
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      this.#previewEl.src = URL.createObjectURL(file);
      this.#previewEl.hidden = false;
    } catch (_) { /* preview opcional — falha silenciosa */ }
  }

  /**
   * Gera o card como File PNG pronto para Web Share API.
   * @returns {Promise<File>}
   */
  async #gerarCardBlob() {
    const W = 1080, H = 1080;
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : null;
    if (!canvas) throw new Error('Canvas não disponível');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── 1. Fundo: capa da barbearia (cover-crop) ────────────
    let fundoOk = false;
    if (this.#coverUrl) {
      try {
        const img = await BarbeariaSharePanel.#carregarImg(this.#coverUrl);
        const sc  = Math.max(W / img.width, H / img.height);
        const dw  = img.width  * sc;
        const dh  = img.height * sc;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        fundoOk = true;
      } catch (_) { /* fallback abaixo */ }
    }
    if (!fundoOk) {
      // Gradiente escuro elegante
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0d0d0d');
      g.addColorStop(1, '#1a1205');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // ── 2. Overlay escuro (legibilidade do texto) ───────────
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);

    // Gradiente superior (para logo)
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    topGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, H * 0.35);

    // Gradiente inferior (para textos)
    const botGrad = ctx.createLinearGradient(0, H * 0.5, 0, H);
    botGrad.addColorStop(0, 'rgba(0,0,0,0)');
    botGrad.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, 0, W, H);

    // ── 3. Logo BarberFlow (topo) ───────────────────────────
    try {
      const logo = await BarbeariaSharePanel.#carregarImg('/shared/img/Logo01.png');
      const lh   = 90;
      const lw   = logo.width * (lh / logo.height);
      ctx.drawImage(logo, (W - lw) / 2, 60, lw, lh);
    } catch (_) {
      // Fallback textual
      ctx.fillStyle = '#D4A017';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💈 BarberFlow', W / 2, 110);
    }

    // ── 4. Nome da barbearia ────────────────────────────────
    ctx.textAlign  = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 16;

    const nome = this.#nome || 'Barbearia';
    ctx.fillStyle = '#FFFFFF';
    ctx.font      = `bold ${nome.length > 18 ? 62 : 76}px sans-serif`;
    BarbeariaSharePanel.#desenharTextoQuebrado(ctx, nome, W / 2, H * 0.61, W - 100, 86);

    // ── 5. Faixa dourada "Você está convidado!" ─────────────
    const faixaY = H * 0.73;
    const faixaH = 78;
    ctx.shadowBlur = 0;
    const faixaGrad = ctx.createLinearGradient(0, faixaY, W, faixaY);
    faixaGrad.addColorStop(0, 'rgba(212,160,23,0)');
    faixaGrad.addColorStop(0.15, 'rgba(212,160,23,0.22)');
    faixaGrad.addColorStop(0.85, 'rgba(212,160,23,0.22)');
    faixaGrad.addColorStop(1, 'rgba(212,160,23,0)');
    ctx.fillStyle = faixaGrad;
    ctx.fillRect(0, faixaY - 6, W, faixaH);

    ctx.fillStyle = '#FFD966';
    ctx.font      = 'bold 44px sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur  = 10;
    ctx.fillText('Você está convidado! 💈', W / 2, faixaY + faixaH * 0.55);

    // ── 6. Subtexto ─────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font      = '36px sans-serif';
    ctx.shadowBlur = 8;
    ctx.fillText('Entre na fila pelo BarberFlow', W / 2, H * 0.87);

    // ── 7. Rodapé: URL do app ───────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font      = '26px sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillText('app.berberflow.shop', W / 2, H - 46);

    // Linha separadora no rodapé
    ctx.strokeStyle = 'rgba(212,160,23,0.4)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(120, H - 70);
    ctx.lineTo(W - 120, H - 70);
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas vazio')); return; }
        resolve(new File([blob], 'convite-barbearia.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  /** Carrega uma imagem com CORS anônimo. */
  static #carregarImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`img não carregou: ${src}`));
      img.src = src;
    });
  }

  /** Desenha texto com quebra de linha automática. */
  static #desenharTextoQuebrado(ctx, texto, x, y, maxW, lineH) {
    const palavras = texto.split(' ');
    let linha = '';
    let cy = y;
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (ctx.measureText(teste).width > maxW && linha) {
        ctx.fillText(linha, x, cy);
        linha = p;
        cy += lineH;
      } else {
        linha = teste;
      }
    }
    if (linha) ctx.fillText(linha, x, cy);
  }
}

// UMD — permite require() nos testes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BarbeariaSharePanel };
}
