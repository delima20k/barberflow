'use strict';

const { logger } = require('../middlewares/logger');

/**
 * BarbeariaShareController — serve a página de compartilhamento público de uma
 * barbearia (rota GET /b/:id). Renderiza meta tags Open Graph (preview rico em
 * WhatsApp etc.) e redireciona o visitante humano para a SPA da barbearia
 * pública no app cliente (?barbearia=<id>).
 *
 * Sem autenticação (o scraper de preview não envia token). Apenas leitura.
 *
 * Camada: interface (controller HTTP)
 */
class BarbeariaShareController {
  #repo;
  #builder;
  #appBaseUrl;
  #supabaseUrl;
  #siteName;
  #objectExists;

  /**
   * @param {object} deps
   * @param {{ getPublicShareData(id:string):Promise<object|null> }} deps.repo
   * @param {{ build(o:object):string }} deps.builder
   * @param {string} deps.appBaseUrl   — base da SPA cliente (ex.: https://app.berberflow.shop)
   * @param {string} deps.supabaseUrl  — base do Supabase (para montar URL pública da logo)
   * @param {string} [deps.siteName]
   */
  constructor({ repo, builder, appBaseUrl, supabaseUrl, siteName = 'BarberFlow', objectExists }) {
    if (!repo?.getPublicShareData) throw new Error('BarbeariaShareController requer repo com getPublicShareData.');
    if (!builder?.build) throw new Error('BarbeariaShareController requer builder com build().');
    this.#repo         = repo;
    this.#builder      = builder;
    this.#appBaseUrl   = String(appBaseUrl || '').replace(/\/$/, '');
    this.#supabaseUrl  = String(supabaseUrl || '').replace(/\/$/, '');
    this.#siteName     = siteName;
    // Verificador de existência do og-card (injetável p/ teste). Default: HEAD.
    this.#objectExists = typeof objectExists === 'function'
      ? objectExists
      : BarbeariaShareController.#headExists;
  }

  /** Express handler — GET /b/:id */
  handle = async (req, res) => {
    const id = String(req.params.id ?? '');
    const homeUrl = this.#appBaseUrl || '/';

    // /b/:id?img=1 → serve os BYTES da imagem do card pelo PRÓPRIO domínio
    // (app.berberflow.shop via proxy), em vez de apontar o og:image para o
    // Supabase. WhatsApp/Facebook renderizam de forma muito mais confiável
    // quando a imagem está no mesmo domínio da página.
    if (req.query?.img === '1') return this.#serveImage(id, res);
    // og:url é a URL pública canônica (domínio do app cliente), NÃO o host do
    // request — atrás do proxy Vercel req.get('host') seria bff.berberflow.shop.
    // Mantém og:url == URL compartilhada == rota que o app resolve. Preserva ?og=1.
    const ogSuffix = req.query?.og === '1' ? '?og=1' : '';
    const canonicalUrl = `${homeUrl}/b/${encodeURIComponent(id)}${ogSuffix}`;

    let shop = null;
    try {
      shop = await this.#repo.getPublicShareData(id);
    } catch (_) {
      shop = null; // UUID inválido ou erro de leitura → cai no fallback genérico
    }

    // Humano → 302 direto para a SPA, SEM a página intermediária "Redirecionando…".
    // Só o scraper de preview (WhatsApp/Facebook/etc.) recebe o HTML com OG tags.
    if (!BarbeariaShareController.#isScraper(req.get('user-agent'))) {
      const humanDest = shop ? `${homeUrl}/?barbearia=${encodeURIComponent(shop.id)}` : homeUrl;
      return res.redirect(302, humanDest);
    }

    if (!shop) {
      // Não encontrada/ inválida → preview genérico + manda para a home do app.
      const html = this.#builder.build({
        title: this.#siteName,
        description: 'Encontre as melhores barbearias no BarberFlow.',
        canonicalUrl,
        redirectUrl: homeUrl,
        siteName: this.#siteName,
      });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      return res.status(200).send(html);
    }

    const image = await this.#resolverImagem(shop);
    // og:image servido pelo próprio domínio (proxy dos bytes em ?img=1).
    const imageUrl = image.url ? `${homeUrl}/b/${encodeURIComponent(shop.id)}?img=1` : '';

    const html = this.#builder.build({
      title: shop.name || this.#siteName,
      description: this.#descricao(shop),
      image: imageUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      imageType: image.type,
      canonicalUrl,
      redirectUrl: `${homeUrl}/?barbearia=${encodeURIComponent(shop.id)}`,
      siteName: this.#siteName,
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    logger?.info?.('[share] barbearia servida', { id: shop.id });
    return res.status(200).send(html);
  };

  /**
   * GET /b/:id?img=1 — busca os bytes da imagem do card (Supabase) e os devolve
   * pelo próprio domínio, com Content-Type de imagem. Espelha o padrão de servir
   * a og:image na mesma origem da página (mais confiável p/ o scraper).
   */
  async #serveImage(id, res) {
    let shop = null;
    try { shop = await this.#repo.getPublicShareData(id); } catch { shop = null; }
    const src = shop ? (await this.#resolverImagem(shop)) : { url: '' };
    if (!src.url) return res.status(404).end();

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const upstream = await fetch(src.url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!upstream.ok) return res.status(404).end();
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', upstream.headers.get('content-type') || src.type || 'image/jpeg');
      res.set('Content-Length', String(buf.length));
      res.set('Cache-Control', 'public, max-age=300');
      return res.status(200).send(buf);
    } catch {
      return res.status(404).end();
    }
  }

  #descricao(shop) {
    const local = [shop.city, shop.state].filter(Boolean).join(' - ');
    return local
      ? `${local} · Veja a barbearia no BarberFlow.`
      : 'Veja a barbearia no BarberFlow.';
  }

  /**
   * og:image — prefere o card gerado (JPEG; o WhatsApp não renderiza WebP da
   * capa do perfil e ignora previews grandes). Usa o que existir no Storage:
   * og-card.jpg (novo, comprimido) e, por compat, og-card.png (legado). Baseado
   * na existência real do arquivo — independe do timing/flags do cliente.
   * Senão, cai na capa/logo do perfil.
   */
  async #resolverImagem(shop) {
    // O card é gerado 1080×1080 — dimensões conhecidas ajudam o WhatsApp a renderizar.
    for (const ext of ['jpg', 'png']) {
      const url = this.#ogCardUrl(shop.id, ext);
      if (url && await this.#objectExists(url)) {
        return { url, width: 1080, height: 1080, type: ext === 'jpg' ? 'image/jpeg' : 'image/png' };
      }
    }
    return { url: this.#imagemUrl(shop) };
  }

  /**
   * Detecta scraper de preview (WhatsApp/Facebook/Twitter/etc.) pelo User-Agent.
   * Só eles recebem o HTML com OG tags; humanos são redirecionados (302) direto.
   * Sem UA → trata como scraper (serve OG por segurança; navegador real sempre
   * envia UA e não casa com o regex, então humano cai no redirect).
   */
  static #isScraper(ua) {
    if (!ua) return true;
    return /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|linkedinbot|slackbot|discordbot|pinterest|googlebot|bingbot|applebot|embedly|redditbot|vkshare|skypeuripreview|preview|bot\b|crawler|spider/i.test(ua);
  }

  /** HEAD no Storage público; true se o objeto existe. Tolerante a falha/timeout. */
  static async #headExists(url) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** URL do card gerado pelo barbeiro (Supabase Storage, bucket barbershops). */
  #ogCardUrl(shopId, ext = 'jpg') {
    if (!shopId || !this.#supabaseUrl) return null;
    return `${this.#supabaseUrl}/storage/v1/object/public/barbershops/${encodeURIComponent(shopId)}/og-card.${ext}`;
  }

  /** Monta a URL pública absoluta da capa/logo (Supabase Storage). */
  #imagemUrl(shop) {
    const path = shop.cover_path || shop.logo_path;
    if (!path || !this.#supabaseUrl) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const clean = String(path).replace(/^\/+/, '');
    return `${this.#supabaseUrl}/storage/v1/object/public/barbershops/${clean}`;
  }
}

module.exports = BarbeariaShareController;
