'use strict';
// LojaMarker.js — Componente HTML/CSS do marcador de barbearia no mapa.
// Substitui a imagem estática de fachada por design puro HTML + CSS,
// garantindo que a imagem de capa fique exatamente dentro da moldura dourada
// com object-fit: cover, sem dependência de asset externo.
// Camada: interfaces | Reutilizável em: MapWidget

class LojaMarker {
  /** @type {[number,number]} Dimensões do ícone Leaflet [largura, altura] */
  static get ICON_SIZE()    { return [116, 128]; }

  /** @type {[number,number]} Ponto de ancoragem [x, y] — ponta do pin */
  static get ICON_ANCHOR()  { return [58,   82]; }

  /** @type {[number,number]} Deslocamento do popup em relação ao anchor */
  static get POPUP_ANCHOR() { return [0,   -84]; }

  /**
   * Gera o HTML string do marcador da barbearia.
   * Todos os parâmetros de texto devem estar pré-sanitizados (XSS-safe).
   *
   * @param {object}       opts
   * @param {string}       opts.nomeCurto    - Nome abreviado da barbearia (badge topo)
   * @param {string}       opts.iniciais     - Iniciais para fallback de avatar
   * @param {string|null}  opts.avatarUrl    - URL da imagem de capa ou null
   * @param {string}       opts.rua          - Nome da rua/avenida para o label inferior
   * @param {string}       opts.nomeEndereco - Número do endereço ou string vazia
   * @param {boolean|null} opts.isOpen       - true=aberta | false=fechado | null=desconhecido
   * @returns {string}
   */
  static html({ nomeCurto, iniciais, avatarUrl, rua, nomeEndereco, isOpen }) {
    const imgHtml = avatarUrl
      ? `<img src="${avatarUrl}" class="loja-marker__img" alt="${iniciais}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const initialsInline = avatarUrl ? ' style="display:none"' : '';

    const statusClass = isOpen === true  ? 'aberta'
                      : isOpen === false ? 'fechado'
                      : '';
    const statusTexto = isOpen === true  ? 'Aberta'
                      : isOpen === false ? 'Fechado'
                      : '';
    const statusHtml = statusClass
      ? `<span class="loja-marker__status loja-marker__status--${statusClass}">${statusTexto}</span>`
      : '';

    const numHtml = nomeEndereco
      ? `<span class="loja-marker__number">N&ordm; ${nomeEndereco}</span>`
      : '';

    const ruaHtml = rua || numHtml
      ? `<span class="loja-marker__name">${rua || ''}</span>`
      : '';

    return `<div class="loja-marker">
  <div class="loja-marker__building">
    <div class="loja-marker__roof">
      <span class="loja-marker__roof-sign">&#9988; BARBER</span>
    </div>
    <div class="loja-marker__facade">
      ${statusHtml}
      <div class="loja-marker__frame">
        ${imgHtml}
        <span class="loja-marker__initials"${initialsInline}>${iniciais}</span>
      </div>
    </div>
    <div class="loja-marker__base"></div>
  </div>
  <div class="loja-marker__pin"></div>
  <div class="loja-marker__store-name">${nomeCurto}</div>
  <div class="loja-marker__label">
    ${ruaHtml}
    ${numHtml}
  </div>
</div>`;
  }
}
