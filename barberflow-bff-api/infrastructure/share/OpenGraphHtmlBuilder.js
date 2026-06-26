'use strict';

/**
 * OpenGraphHtmlBuilder — gera uma página HTML mínima com meta tags
 * Open Graph / Twitter Card para gerar preview rico ao ser compartilhada
 * (ex.: WhatsApp) e que redireciona o visitante humano para a SPA.
 *
 * Puro: não acessa rede/DB. Recebe dados já resolvidos e devolve string HTML.
 * Todo conteúdo dinâmico é escapado para evitar injeção de HTML/atributo.
 *
 * Camada: infra (apresentação server-side)
 */
class OpenGraphHtmlBuilder {
  /**
   * @param {object} dados
   * @param {string} dados.title        — título do card (og:title)
   * @param {string} dados.description  — descrição do card (og:description)
   * @param {string} [dados.image]      — URL absoluta da imagem (og:image)
   * @param {string} dados.canonicalUrl — URL canônica desta página de share (og:url)
   * @param {string} dados.redirectUrl  — destino humano (SPA da barbearia pública)
   * @param {string} [dados.siteName]   — og:site_name
   * @returns {string} HTML completo
   */
  build({ title, description, image, imageWidth, imageHeight, imageType, canonicalUrl, redirectUrl, siteName = 'BarberFlow' }) {
    const t   = OpenGraphHtmlBuilder.#escHtml(title || siteName);
    const d   = OpenGraphHtmlBuilder.#escHtml(description || '');
    const url = OpenGraphHtmlBuilder.#escAttr(canonicalUrl || '');
    const dst = OpenGraphHtmlBuilder.#escAttr(redirectUrl || '');
    const dstJs = OpenGraphHtmlBuilder.#escJsString(redirectUrl || '');
    const site = OpenGraphHtmlBuilder.#escHtml(siteName);
    const img = image ? OpenGraphHtmlBuilder.#escAttr(image) : '';
    // og:image:width/height/type ajudam (e às vezes são exigidos) o WhatsApp a
    // renderizar a imagem do preview. secure_url reforça o carregamento HTTPS.
    const imgTag = image
      ? `\n  <meta property="og:image" content="${img}">` +
        `\n  <meta property="og:image:secure_url" content="${img}">` +
        (imageType   ? `\n  <meta property="og:image:type" content="${OpenGraphHtmlBuilder.#escAttr(imageType)}">` : '') +
        (imageWidth  ? `\n  <meta property="og:image:width" content="${OpenGraphHtmlBuilder.#escAttr(String(imageWidth))}">` : '') +
        (imageHeight ? `\n  <meta property="og:image:height" content="${OpenGraphHtmlBuilder.#escAttr(String(imageHeight))}">` : '') +
        `\n  <meta property="og:image:alt" content="${t}">` +
        `\n  <meta name="twitter:image" content="${img}">`
      : '';
    const twitterCard = image ? 'summary_large_image' : 'summary';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>
  <meta name="description" content="${OpenGraphHtmlBuilder.#escAttr(description || '')}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${site}">
  <meta property="og:title" content="${OpenGraphHtmlBuilder.#escAttr(title || siteName)}">
  <meta property="og:description" content="${OpenGraphHtmlBuilder.#escAttr(description || '')}">
  <meta property="og:url" content="${url}">${imgTag}
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${OpenGraphHtmlBuilder.#escAttr(title || siteName)}">
  <meta name="twitter:description" content="${OpenGraphHtmlBuilder.#escAttr(description || '')}">
  <script>location.replace(${dstJs});</script>
</head>
<body>
  <p><a href="${dst}">Abrir ${t}</a></p>
</body>
</html>`;
  }

  // ── Escapes ─────────────────────────────────────────────────

  static #escHtml(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  static #escAttr(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Para interpolar com segurança dentro de string JS entre aspas.
  static #escJsString(v) {
    return JSON.stringify(String(v ?? ''));
  }
}

module.exports = { OpenGraphHtmlBuilder };
