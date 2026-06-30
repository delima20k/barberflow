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
   * @param {string} deps.appBaseUrl   — base da SPA cliente (ex.: https://app.barberflow.live)
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

    // og:url é a URL pública canônica (domínio do app cliente), NÃO o host do
    // request — atrás do proxy Vercel req.get('host') seria bff.barberflow.live.
    // Mantém og:url == URL compartilhada == rota que o app resolve. Preserva ?og=1.
    const ogSuffix = req.query?.og === '1' ? '?og=1' : '';
    const canonicalUrl = `${homeUrl}/b/${encodeURIComponent(id)}${ogSuffix}`;

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
      BarbeariaShareController.#cspRedirect(res);
      return res.status(200).send(html);
    }

    const image = await this.#resolverImagem(shop);

    const html = this.#builder.build({
      title: shop.name || this.#siteName,
      description: this.#descricao(shop),
      // URL direta do arquivo .jpg no Storage — o WhatsApp renderiza de forma
      // confiável (URL com extensão de imagem). O card é 1080×1080.
      image: image.url,
      imageWidth: image.isCard ? 1080 : undefined,
      imageHeight: image.isCard ? 1080 : undefined,
      imageType: image.isCard ? 'image/jpeg' : undefined,
      canonicalUrl,
      redirectUrl: `${homeUrl}/?barbearia=${encodeURIComponent(shop.id)}`,
      siteName: this.#siteName,
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    BarbeariaShareController.#cspRedirect(res);
    logger?.info?.('[share] barbearia servida', { id: shop.id });
    return res.status(200).send(html);
  };

  /**
   * CSP só desta página de share: o helmet global usa `script-src 'self'`, que
   * BLOQUEIA o <script>location.replace</script> inline — fazendo o humano ficar
   * preso na página "Abrir …" em vez de ir direto. Aqui liberamos inline script
   * (página mínima, conteúdo escapado) para o redirect funcionar. Scrapers não
   * executam JS e só leem as OG tags.
   */
  static #cspRedirect(res) {
    res.set('Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline' 'self'; img-src https: data:; style-src 'unsafe-inline'");
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
    // Card gerado (og-card.*) tem prioridade — é a arte de convite, não a capa crua.
    for (const ext of ['jpg', 'png']) {
      const url = this.#ogCardUrl(shop.id, ext);
      if (url && await this.#objectExists(url)) return { url, isCard: true };
    }
    // Sem card: cai na capa/logo do perfil (sem dimensões conhecidas).
    return { url: this.#imagemUrl(shop), isCard: false };
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
