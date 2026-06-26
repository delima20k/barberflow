'use strict';

/**
 * BarbeariaSharePanel — card "Divulgue sua barbearia" na página minha-barbearia.
 *
 * Preview: canvas 1080×1080 exibido na página em tamanho reduzido (CSS).
 *
 * Compartilhamento: envia APENAS a URL do BFF (/b/:id) via Web Share API —
 * o WhatsApp lê as meta tags Open Graph dessa URL e monta automaticamente
 * um card clicável com a foto, nome e botão que abre a barbearia no app
 * cliente. Nenhum texto extra é enviado junto.
 *
 * Fallback: abre wa.me com a URL do BFF (mesmo resultado — OG card).
 * Botão "Copiar" copia a URL do app cliente (link direto, sem redirect).
 *
 * Camada: interfaces (UI). Sem regra de negócio.
 */
class BarbeariaSharePanel {
  /** URL base do app cliente — usada apenas no botão "Copiar". */
  static APP_URL = 'https://app.berberflow.shop';

  #root;
  #linkInput   = null;
  #shareBtn    = null;
  #copyBtn     = null;
  #statusEl    = null;
  #previewEl   = null;
  #statusTimer = null;

  #barbershopId  = null;
  #nome          = '';
  #coverUrl      = null;
  #bffBase       = '';   // base do BFF para a URL de OG (ex.: https://bff.berberflow.shop)
  #cardUrl       = null; // URL pública do card após upload para Supabase Storage
  #uploadPromise = null; // Promise do upload em andamento
  #cardFile      = null; // Arquivo (File) do card gerado — enviado direto no WhatsApp

  constructor(rootEl) {
    this.#root = rootEl || null;
    // Em produção, usa sempre bff.berberflow.shop.
    // Localhost: lê window.BFF_URL para apontar para a BFF local.
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    this.#bffBase = isLocal
      ? ((typeof window !== 'undefined' && window.BFF_URL) || 'http://localhost:3000')
      : 'https://bff.berberflow.shop';
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
   * Atualiza com os dados da barbearia carregada.
   * @param {{ barbershopId?: string, nome?: string, coverUrl?: string }} dados
   */
  atualizar({ barbershopId, nome, coverUrl } = {}) {
    this.#barbershopId  = barbershopId || null;
    this.#nome          = String(nome || '');
    this.#coverUrl      = coverUrl || null;
    this.#cardUrl       = null;
    this.#uploadPromise = null;
    this.#cardFile      = null;

    const ok = !!this.#barbershopId;
    if (this.#root) this.#root.hidden = !ok;
    if (!ok) return this;

    // Input de cópia mostra a URL do app cliente (link direto)
    if (this.#linkInput) this.#linkInput.value = this.#appUrl();

    // Gera preview visual do card no canvas (async, não bloqueia)
    if (this.#previewEl) void this.#atualizarPreview();
    return this;
  }

  // ── URLs ───────────────────────────────────────────────────

  /**
   * URL de compartilhamento: app.berberflow.shop/b/{id}?v={token}
   * O Vercel proxy redireciona /b/:id → BFF, que serve as meta OG (card).
   *
   * O `?v=` é um cache-buster ÚNICO por compartilhamento: o WhatsApp trata cada
   * link como novo e raspa as OG tags na hora, evitando mostrar um preview velho
   * que ficou em cache. O servidor ignora o parâmetro e resolve o card pela
   * existência do arquivo og-card no Storage.
   */
  #ogUrl() {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return `${BarbeariaSharePanel.APP_URL}/b/${this.#barbershopId}?v=${token}`;
  }

  /** URL do app cliente — usada no botão "Copiar". */
  #appUrl() {
    return `${BarbeariaSharePanel.APP_URL}/?barbearia=${this.#barbershopId}`;
  }

  // ── Ações ──────────────────────────────────────────────────

  async #compartilhar() {
    if (!this.#barbershopId) return;

    // Compartilha a URL → o WhatsApp monta o CARD DE PREVIEW CLICÁVEL (imagem +
    // nome) a partir das meta tags Open Graph que a BFF serve em /b/:id. Ao clicar
    // no card, abre a página pública da barbearia. O `?v=` força raspagem fresca.
    //
    // NÃO aguarda nada assíncrono antes de navigator.share — qualquer await perde
    // o contexto de gesto do usuário (iOS bloqueia a ação).
    const url = this.#ogUrl();

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    // Fallback (desktop / sem Web Share): abre o WhatsApp com a URL no texto.
    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank', 'noopener');
    }
  }

  async #copiar() {
    if (!this.#barbershopId) return;
    const url = this.#appUrl();
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

  // ── Canvas preview ─────────────────────────────────────────

  async #atualizarPreview() {
    try {
      const file = await this.#gerarCardBlob();
      // Guarda o arquivo para enviar DIRETO no WhatsApp (imagem garantida).
      this.#cardFile = file;
      if (!this.#previewEl) return;
      const old = this.#previewEl.src;
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      this.#previewEl.src = URL.createObjectURL(file);
      this.#previewEl.hidden = false;
      // Sobe o canvas para o Supabase; o BFF usa essa imagem como og:image (fallback).
      this.#uploadPromise = this.#uploadOgCard(file);
    } catch (_) { /* preview opcional */ }
  }

  /** Envia o card PNG para o BFF (que tem service-role e grava no Storage). */
  async #uploadOgCard(file) {
    this.#cardUrl = null;
    if (!this.#barbershopId) return;
    if (typeof BffApiService === 'undefined') return;
    try {
      const buffer = await file.arrayBuffer();
      const { error } = await BffApiService.barbearias.salvarOgCard(buffer);
      if (!error) this.#cardUrl = 'ready';
    } catch (_) {}
  }

  async #gerarCardBlob() {
    const W = 1080, H = 1080;
    const canvas = typeof document !== 'undefined'
      ? document.createElement('canvas') : null;
    if (!canvas) throw new Error('Canvas não disponível');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Fundo: capa da barbearia (cover-crop)
    let fundoOk = false;
    if (this.#coverUrl) {
      try {
        const img = await BarbeariaSharePanel.#carregarImg(this.#coverUrl);
        const sc  = Math.max(W / img.width, H / img.height);
        ctx.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2,
                      img.width * sc, img.height * sc);
        fundoOk = true;
      } catch (_) { /* fallback */ }
    }
    if (!fundoOk) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#0d0d0d');
      g.addColorStop(1, '#1a1205');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Overlays de escurecimento
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    ctx.fillRect(0, 0, W, H);
    const topG = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    topG.addColorStop(0, 'rgba(0,0,0,0.6)');
    topG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topG; ctx.fillRect(0, 0, W, H * 0.35);
    const botG = ctx.createLinearGradient(0, H * 0.5, 0, H);
    botG.addColorStop(0, 'rgba(0,0,0,0)');
    botG.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = botG; ctx.fillRect(0, 0, W, H);

    // 3. Pill creme "BarberFlow" (sem logo) + chamada abaixo
    ctx.textAlign = 'center';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    const pillRy = 52, pillRh = 68;
    ctx.fillStyle = '#F5EDD4';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 180, pillRy, 360, pillRh, pillRh / 2);
    ctx.fill();
    ctx.fillStyle = '#3b1f08';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText('💈 BarberFlow', W / 2, pillRy + 45);

    // Chamada de ação abaixo da pill
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.font = 'italic 31px sans-serif';
    BarbeariaSharePanel.#desenharTextoQuebrado(
      ctx,
      'Seu barbeiro não te responde? Clique no card e seja o próximo na fila',
      W / 2, pillRy + pillRh + 52, W - 120, 40,
    );

    // 4. Nome da barbearia
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 18;
    ctx.fillStyle = '#FFFFFF';
    const nome = this.#nome || 'Barbearia';
    ctx.font = `bold ${nome.length > 18 ? 58 : 72}px sans-serif`;
    BarbeariaSharePanel.#desenharTextoQuebrado(ctx, nome, W / 2, H * 0.54, W - 100, 84);

    // 5. Faixa dourada
    const faixaY = H * 0.70;
    ctx.shadowBlur = 0;
    const faixaG = ctx.createLinearGradient(0, faixaY, W, faixaY);
    faixaG.addColorStop(0, 'rgba(212,160,23,0)');
    faixaG.addColorStop(0.12, 'rgba(212,160,23,0.25)');
    faixaG.addColorStop(0.88, 'rgba(212,160,23,0.25)');
    faixaG.addColorStop(1, 'rgba(212,160,23,0)');
    ctx.fillStyle = faixaG; ctx.fillRect(0, faixaY - 6, W, 78);
    ctx.fillStyle = '#FFD966';
    ctx.font = 'bold 42px sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12;
    ctx.fillText('Você está convidado! 💈', W / 2, faixaY + 42);

    // 6. Subtexto
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '34px sans-serif'; ctx.shadowBlur = 8;
    ctx.fillText('Entre na fila pelo BarberFlow', W / 2, H * 0.855);

    // 7. Rodapé URL
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '26px sans-serif'; ctx.shadowBlur = 0;
    ctx.fillText('app.berberflow.shop', W / 2, H - 46);
    ctx.strokeStyle = 'rgba(212,160,23,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(120, H - 70); ctx.lineTo(W - 120, H - 70);
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas vazio')); return; }
        resolve(new File([blob], 'convite-barbearia.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  static #carregarImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error(`img: ${src}`));
      img.src = src;
    });
  }

  static #desenharTextoQuebrado(ctx, texto, x, y, maxW, lh) {
    const palavras = texto.split(' ');
    let linha = '', cy = y;
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (ctx.measureText(teste).width > maxW && linha) {
        ctx.fillText(linha, x, cy); linha = p; cy += lh;
      } else { linha = teste; }
    }
    if (linha) ctx.fillText(linha, x, cy);
  }
}

// UMD — permite require() nos testes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BarbeariaSharePanel };
}
