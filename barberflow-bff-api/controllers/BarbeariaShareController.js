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

  /**
   * @param {object} deps
   * @param {{ getPublicShareData(id:string):Promise<object|null> }} deps.repo
   * @param {{ build(o:object):string }} deps.builder
   * @param {string} deps.appBaseUrl   — base da SPA cliente (ex.: https://app.berberflow.shop)
   * @param {string} deps.supabaseUrl  — base do Supabase (para montar URL pública da logo)
   * @param {string} [deps.siteName]
   */
  constructor({ repo, builder, appBaseUrl, supabaseUrl, siteName = 'BarberFlow' }) {
    if (!repo?.getPublicShareData) throw new Error('BarbeariaShareController requer repo com getPublicShareData.');
    if (!builder?.build) throw new Error('BarbeariaShareController requer builder com build().');
    this.#repo        = repo;
    this.#builder     = builder;
    this.#appBaseUrl  = String(appBaseUrl || '').replace(/\/$/, '');
    this.#supabaseUrl = String(supabaseUrl || '').replace(/\/$/, '');
    this.#siteName    = siteName;
  }

  /** Express handler — GET /b/:id */
  handle = async (req, res) => {
    const id = String(req.params.id ?? '');
    const canonicalUrl = `${req.protocol}://${req.get('host')}/b/${encodeURIComponent(id)}`;
    const homeUrl = this.#appBaseUrl || '/';

    let shop = null;
    try {
      shop = await this.#repo.getPublicShareData(id);
    } catch (_) {
      shop = null; // UUID inválido ou erro de leitura → cai no fallback genérico
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

    // ?og=1 → o canvas foi enviado ao Supabase; usa a arte gerada como og:image.
    const useOgCard = req.query?.og === '1';
    const image = useOgCard ? this.#ogCardUrl(shop.id) : this.#imagemUrl(shop);

    const html = this.#builder.build({
      title: shop.name || this.#siteName,
      description: this.#descricao(shop),
      image,
      canonicalUrl,
      redirectUrl: `${homeUrl}/?barbearia=${encodeURIComponent(shop.id)}`,
      siteName: this.#siteName,
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    logger?.info?.('[share] barbearia servida', { id: shop.id });
    return res.status(200).send(html);
  };

  #descricao(shop) {
    const local = [shop.city, shop.state].filter(Boolean).join(' - ');
    return local
      ? `${local} · Veja a barbearia no BarberFlow.`
      : 'Veja a barbearia no BarberFlow.';
  }

  /** URL do canvas gerado pelo barbeiro (Supabase Storage, bucket barbershops). */
  #ogCardUrl(shopId) {
    if (!shopId || !this.#supabaseUrl) return null;
    return `${this.#supabaseUrl}/storage/v1/object/public/barbershops/${encodeURIComponent(shopId)}/og-card.png`;
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
