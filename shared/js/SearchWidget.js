'use strict';

// =============================================================
// DigText — Animação de digitação letra por letra ("dig")
//
// Reutilizável em qualquer tela:
//   const dig = new DigText(containerEl, textos, opts);
//   dig.iniciar();  → sorteia texto e digita letra por letra
//   dig.parar();    → cancela e limpa o container
//
// Opções: { velocidade:38, pausaFinal:0, loop:false }
// CSS necessário: classe .dig-ativo no container + @keyframes dig-cursor
// =============================================================
class DigText {

  #el         = null;
  #textos     = [];
  #velocidade = 38;
  #pausaFinal = 0;
  #loop       = false;
  #onTick     = null;   // cb(textoAtual) chamado a cada letra
  #timer      = null;
  #ativo      = false;

  /**
   * @param {HTMLElement} container — elemento que receberá o texto animado
   * @param {string[]}    textos    — array de frases; uma é sorteada aleatoriamente
   * @param {object}      [opts]    — { velocidade, pausaFinal, loop, onTick }
   */
  constructor(container, textos, opts = {}) {
    this.#el         = container;
    this.#textos     = textos;
    this.#velocidade = opts.velocidade ?? 38;
    this.#pausaFinal = opts.pausaFinal ?? 0;
    this.#loop       = opts.loop       ?? false;
    this.#onTick     = opts.onTick     ?? null;
  }

  /** Expõe o elemento DOM para ser inserido em qualquer container. */
  get elemento() { return this.#el; }

  /** Sorteia um texto e começa a digitar. */
  iniciar() {
    this.parar();
    this.#ativo = true;
    const texto = this.#textos[Math.floor(Math.random() * this.#textos.length)];
    this.#el.textContent = '';
    this.#el.classList.add('dig-ativo');
    this.#digitar(texto, 0);
  }

  /** Cancela a animação e limpa o conteúdo. */
  parar() {
    this.#ativo = false;
    clearTimeout(this.#timer);
    if (this.#el) {
      this.#el.textContent = '';
      this.#el.classList.remove('dig-ativo');
    }
  }

  #digitar(texto, i) {
    if (!this.#ativo) return;
    if (i <= texto.length) {
      this.#el.textContent = texto.slice(0, i);
      this.#onTick?.(this.#el.textContent);
      this.#timer = setTimeout(() => this.#digitar(texto, i + 1), this.#velocidade);
    } else {
      // Animação concluída — remove cursor piscante, mantém o texto visível
      this.#el.classList.remove('dig-ativo');
      if (this.#loop && this.#pausaFinal > 0) {
        this.#timer = setTimeout(() => { if (this.#ativo) this.iniciar(); }, this.#pausaFinal);
      }
    }
  }
}

// =============================================================
// SearchWidget.js — Busca dinâmica de barbearias (POO, Singleton)
//
// Responsabilidades:
//   - Debounce de 350ms no input
//   - Busca no Supabase por: nome, endereço, cidade, CEP
//   - Renderiza resultados como barber-rows dinâmicos (zero innerHTML)
//   - Gerencia estados: boas-vindas | loading | lista | vazio | erro
//   - Animação "dig" (digitação) via DigText na tela de boas-vindas
//
// Dependências: SupabaseService.js
// =============================================================

class SearchWidget {

  static #input        = null;
  static #container    = null;
  static #timer        = null;
  static #dig          = null;

  static #DEBOUNCE_MS  = 350;
  static #MIN_CHARS    = 2;
  static #LIMIT        = 20;

  static #TEXTOS_DIG = [
    'Busque agora a barbearia mais perto e aguarde sua vez com conforto, no seu lar. Ao chegar a sua vez, você será notificado.',
    'Busque a barbearia mais próxima e espere sua vez, relaxando no seu sofá. Assim que for sua vez, você receberá a notificação.',
    'Encontre a barbearia ideal e fique na sua vez, no conforto da sua casa. Assim que for sua vez, você receberá a notificação.',
  ];

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * @param {string} inputId      — id do <input> de busca
   * @param {string} containerId  — id do container de resultados
   */
  static init(inputId, containerId) {
    SearchWidget.#input     = document.getElementById(inputId);
    SearchWidget.#container = document.getElementById(containerId);
    if (!SearchWidget.#input || !SearchWidget.#container) return;

    SearchWidget.#initDig();          // cria elemento dig antes do primeiro render
    SearchWidget.#bindEventos();
    SearchWidget.#renderBemVindo();   // já inclui o dig no placeholder
  }

  static #initDig() {
    // Cria o elemento dinamicamente — sem ID necessário no HTML
    const digEl = document.createElement('p');
    digEl.className = 'search-dig';
    digEl.setAttribute('aria-live', 'polite');

    SearchWidget.#dig = new DigText(digEl, SearchWidget.#TEXTOS_DIG, { velocidade: 36 });

    // MutationObserver: ao entrar na tela → re-renderiza boas-vindas (com dig)
    //                   ao sair da tela   → para animação
    const telaPesquisa = document.getElementById('tela-pesquisa');
    if (telaPesquisa) {
      new MutationObserver(() => {
        if (telaPesquisa.classList.contains('ativa')) {
          SearchWidget.#renderBemVindo();
        } else {
          SearchWidget.#dig.parar();
        }
      }).observe(telaPesquisa, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Eventos
  // ═══════════════════════════════════════════════════════════

  static #bindEventos() {
    SearchWidget.#input.addEventListener('input', () => {
      clearTimeout(SearchWidget.#timer);
      const termo = SearchWidget.#input.value.trim();

      // Para o dig ao começar a digitar
      SearchWidget.#dig?.parar();

      if (termo.length < SearchWidget.#MIN_CHARS) {
        SearchWidget.#renderBemVindo();
        return;
      }

      SearchWidget.#timer = setTimeout(
        () => SearchWidget.#buscar(termo),
        SearchWidget.#DEBOUNCE_MS
      );
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Busca de dados
  // ═══════════════════════════════════════════════════════════

  static async #buscar(termo) {
    SearchWidget.#renderLoading();

    const t = InputValidator.escaparFiltroPostgREST(termo);
    try {
      const [shopRes, profRes] = await Promise.all([
        ApiService.from('barbershops')
          .select('id, name, address, city, zip_code, logo_path, is_open, rating_avg, likes_count, dislikes_count, rating_score, close_reason, cover_path, font_key')
          .eq('is_active', true)
          .or(
            `name.ilike.%${t}%,` +
            `address.ilike.%${t}%,` +
            `city.ilike.%${t}%,` +
            `zip_code.ilike.%${t}%`
          )
          .order('rating_avg', { ascending: false })
          .limit(SearchWidget.#LIMIT),

        ApiService.from('profiles_public')
          .select('id, full_name, avatar_path, pro_type, rating_count, updated_at')
          .eq('role', 'professional')
          .in('pro_type', ['barbeiro', 'barbearia'])
          .ilike('full_name', `%${t}%`)
          .order('rating_count', { ascending: false })
          .limit(10),
      ]);

      const shops = shopRes.error ? [] : (shopRes.data ?? []);
      const profs = profRes.error ? [] : (profRes.data ?? []);

      if (!shops.length && !profs.length) {
        SearchWidget.#renderVazio(termo);
      } else {
        SearchWidget.#renderLista(shops, profs);
      }
    } catch (err) {
      console.error('[SearchWidget] buscar exception:', err);
      SearchWidget.#renderErro();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Renderização
  // ═══════════════════════════════════════════════════════════

  static #montar(node) {
    SearchWidget.#container.innerHTML = '';
    SearchWidget.#container.appendChild(node);
  }

  static #renderBemVindo() {
    const logo = document.createElement('img');
    logo.src       = '/shared/img/Logo01.png';
    logo.alt       = 'BarberFlow';
    logo.className = 'search-placeholder-logo';
    logo.onerror   = () => { logo.style.display = 'none'; };
    const wrap = SearchWidget.#criarPlaceholder(logo, 'Digite o nome, bairro, rua ou CEP para buscar');

    // Injeta texto dig abaixo do .nearby-gps-msg e inicia animação
    if (SearchWidget.#dig) {
      wrap.appendChild(SearchWidget.#dig.elemento);
      SearchWidget.#dig.iniciar();
    }

    SearchWidget.#montar(wrap);
  }

  static #renderLoading() {
    SearchWidget.#dig?.parar();
    const wrap = document.createElement('div');
    wrap.className = 'nearby-loading';

    const spinner = document.createElement('span');
    spinner.className = 'nearby-spinner';

    const msg = document.createElement('p');
    msg.textContent = 'Buscando…';

    wrap.appendChild(spinner);
    wrap.appendChild(msg);
    SearchWidget.#montar(wrap);
  }

  static #renderVazio(termo) {
    SearchWidget.#dig?.parar();
    const wrap = SearchWidget.#criarPlaceholder(
      '🔍',
      `Nenhuma barbearia encontrada para "${termo}"`
    );
    SearchWidget.#montar(wrap);
  }

  static #renderErro() {
    SearchWidget.#dig?.parar();
    const wrap = SearchWidget.#criarPlaceholder('⚠️', 'Erro ao buscar. Verifique sua conexão.');
    SearchWidget.#montar(wrap);
  }


  static #renderLista(barbearias = [], profissionais = []) {
    SearchWidget.#dig?.parar();
    const wrap = document.createElement('div');
    wrap.className = 'nearby-lista';

    if (barbearias.length) {
      if (profissionais.length) {
        const h = document.createElement('p');
        h.className   = 'nearby-gps-msg';
        h.textContent = 'Barbearias';
        h.style.cssText = 'margin:8px 0 4px;font-weight:700;font-size:.8rem;opacity:.7;';
        wrap.appendChild(h);
      }
      barbearias.forEach(b => wrap.appendChild(SearchWidget.#criarBarberRow(b)));
    }

    if (profissionais.length) {
      if (barbearias.length) {
        const h = document.createElement('p');
        h.className   = 'nearby-gps-msg';
        h.textContent = 'Barbeiros';
        h.style.cssText = 'margin:12px 0 4px;font-weight:700;font-size:.8rem;opacity:.7;';
        wrap.appendChild(h);
      }
      profissionais.forEach(p => wrap.appendChild(SearchWidget.#criarProfissionalRow(p)));
    }

    SearchWidget.#montar(wrap);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Criação de DOM
  // ═══════════════════════════════════════════════════════════

  /**
   * Cria um estado de placeholder (ícone ou elemento + mensagem).
   * @param {string|HTMLElement} icone — texto emoji ou elemento DOM
   * @param {string} mensagem
   * @returns {HTMLElement}
   */
  static #criarPlaceholder(icone, mensagem) {
    const wrap = document.createElement('div');
    wrap.className = 'search-placeholder';

    if (icone instanceof HTMLElement) {
      wrap.appendChild(icone);
    } else {
      const icon = document.createElement('span');
      icon.className = 'search-placeholder-icon';
      icon.textContent = icone;
      wrap.appendChild(icon);
    }

    const msg = document.createElement('p');
    msg.className = 'nearby-gps-msg';
    msg.textContent = mensagem;

    wrap.appendChild(msg);
    return wrap;
  }

  /**
   * Cria uma .barber-row para barbearia — mesmo padrão de NearbyBarbershopsWidget.
   * @param {object} b — dados da barbearia (barbershops)
   * @returns {HTMLElement}
   */
  static #criarBarberRow(b) {
    const likes    = Number(b.likes_count    ?? 0);
    const dislikes = Number(b.dislikes_count ?? 0);
    const score    = b.rating_score != null
      ? Number(b.rating_score)
      : (BarbershopService.calcRatingScore(likes, dislikes) || Number(b.rating_avg ?? 0));

    const row = document.createElement('div');
    row.className = 'barber-row barber-card';
    if (b.id) row.dataset.barbershopId = b.id;
    row.dataset.likes    = likes;
    row.dataset.dislikes = dislikes;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img   = document.createElement('img');
      img.src     = b.logo_path.startsWith('http')
        ? b.logo_path
        : (SupabaseService.getLogoUrl(b.logo_path) || '');
      img.alt     = b.name;
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else { avatarWrap.textContent = '💈'; }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nomeEl = document.createElement('p');
    nomeEl.className   = 'barber-name';
    nomeEl.textContent = b.name;
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nomeEl, b.font_key);

    const sub = document.createElement('p');
    sub.className   = 'barber-sub';
    sub.textContent = `📍 ${[b.address, b.city].filter(Boolean).join(' · ')} · Barbearia`;

    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `${BarbershopService.criarEstrelasHTML(score)}<span class="dc-rating-num">${score.toFixed(1)}</span><button type="button" class="top-card__likes" data-action="barbershop-like" aria-label="Curtir barbearia" title="Curtir barbearia"><span class="tcl-ico">👍</span><span class="dc-count">${likes}</span></button>`;

    info.appendChild(nomeEl);
    info.appendChild(sub);
    info.appendChild(starsRow);
    row.appendChild(avatarWrap);
    row.appendChild(info);

    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(row, b.cover_path);

    if (b.id) {
      const actions = document.createElement('div');
      actions.className = 'top-card__actions';
      const badge = document.createElement('span');
      const _sfm  = typeof StatusFechamentoModal !== 'undefined' ? StatusFechamentoModal : null;
      badge.className   = `dc-badge ${_sfm ? _sfm.classBadge(b.is_open, b.close_reason ?? null).replace('bp-badge', 'dc-badge') : (b.is_open ? 'dc-badge--open' : 'dc-badge--closed')}`;
      badge.textContent = _sfm ? _sfm.labelStatus(b.is_open, b.close_reason ?? null) : (b.is_open ? 'Aberto' : 'Fechado');
      actions.appendChild(badge);
      if (typeof BarbershopService !== 'undefined' && BarbershopService.criarBotaoFavoritoCard) {
        actions.appendChild(BarbershopService.criarBotaoFavoritoCard(b.id));
      }
      row.appendChild(actions);
    }

    return row;
  }

  /**
   * Cria uma .barber-row para barbeiro profissional — mesmo padrão de BarbeirosPage.
   * @param {object} p — dados do profissional (profiles_public)
   * @returns {HTMLElement}
   */
  static #criarProfissionalRow(p) {
    const ratingCount = parseInt(p.rating_count || 0, 10);
    const ratingVal   = ProfessionalService.estrelasPorCurtidas(ratingCount);

    const row = document.createElement('div');
    row.className          = 'barber-row barber-card';
    row.dataset.professionalId = p.id;
    row.dataset.barberId       = p.id;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (p.avatar_path) {
      const img   = document.createElement('img');
      img.alt     = p.full_name || 'Barbeiro';
      img.loading = 'lazy';
      img.onerror = () => { avatarWrap.textContent = '💈'; };
      img.src     = SupabaseService.resolveAvatarUrl(p.avatar_path, p.updated_at) || '';
      avatarWrap.appendChild(img);
    } else { avatarWrap.textContent = '💈'; }

    const info = document.createElement('div');
    info.className = 'barber-info';

    const nomeEl = document.createElement('p');
    nomeEl.className   = 'barber-name';
    nomeEl.textContent = p.full_name || 'Barbeiro';
    info.appendChild(nomeEl);

    if (p.pro_type === 'barbearia') {
      const ownerBadge = document.createElement('span');
      ownerBadge.className   = 'barber-owner-badge';
      ownerBadge.textContent = '🏪 Tem Barbearia';
      info.appendChild(ownerBadge);
    }

    const starsRow = document.createElement('div');
    starsRow.className = 'top-card__stars';
    starsRow.innerHTML = `${BarbershopService.criarEstrelasHTML(ratingVal)}<span class="dc-rating-num">${ratingVal.toFixed(1)}</span>`;
    starsRow.appendChild(ProfessionalService.criarBotaoLike(p.id, ratingCount));
    info.appendChild(starsRow);

    row.appendChild(avatarWrap);
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'top-card__actions card-actions-brand';

    const brand = document.createElement('div');
    brand.className = 'card-brand';
    const brandImg = document.createElement('img');
    brandImg.src       = '/shared/img/nomeAppBarber.png';
    brandImg.alt       = 'BarberFlow';
    brandImg.loading   = 'lazy';
    brandImg.className = 'card-brand-logo';
    brand.appendChild(brandImg);
    actions.appendChild(brand);

    actions.appendChild(ProfessionalService.criarBotaoFavorito(p.id));
    row.appendChild(actions);

    return row;
  }

  /**
   * Ponto de entrada autoático — chame no DOMContentLoaded do app.
   * Encapsulado na classe para manter OOP completo.
   */
  static boot() {
    SearchWidget.init('pesquisa-input', 'pesquisa-resultados');
  }
}

/* Ponto de entrada — método da própria classe, sem código solto */
document.addEventListener('DOMContentLoaded', () => SearchWidget.boot());
