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
      const { data, error } = await ApiService.from('barbershops')
        .select('id, name, address, city, zip_code, logo_path, is_open, rating_avg')
        .eq('is_active', true)
        .or(
          `name.ilike.%${t}%,` +
          `address.ilike.%${t}%,` +
          `city.ilike.%${t}%,` +
          `zip_code.ilike.%${t}%`
        )
        .order('rating_avg', { ascending: false })
        .limit(SearchWidget.#LIMIT);

      if (error) {
        console.error('[SearchWidget] Supabase error:', error);
        throw error;
      }

      if (!data.length) {
        SearchWidget.#renderVazio(termo);
      } else {
        SearchWidget.#renderLista(data);
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


  static #renderLista(lista) {
    SearchWidget.#dig?.parar();
    const wrap = document.createElement('div');
    wrap.className = 'nearby-lista';
    lista.forEach(b => wrap.appendChild(SearchWidget.#criarBarberRow(b)));
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
   * Cria uma .barber-row a partir dos dados de uma barbearia.
   * @param {{ name, address, city, logo_path, is_open, rating_avg }} b
   * @returns {HTMLElement}
   */
  static #criarBarberRow(b) {
    const row = document.createElement('div');
    row.className = 'barber-row barber-card';

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    const avatarImg       = document.createElement('img');
    avatarImg.src         = b.logo_path || '/shared/img/Logo01.png';
    avatarImg.alt         = b.name;
    avatarImg.onerror     = () => { avatarImg.src = '/shared/img/Logo01.png'; };
    avatarWrap.appendChild(avatarImg);

    // Info
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className  = 'barber-name';
    nome.textContent = b.name;
    if (typeof FonteSalao !== 'undefined') FonteSalao.aplicarFonte(nome, b.font_key);

    const sub = document.createElement('p');
    sub.className  = 'barber-sub';
    sub.textContent = `📍 ${[b.address, b.city].filter(Boolean).join(' · ')} · ⭐ ${Number(b.rating_avg ?? 0).toFixed(1)} · Barbearia`;

    info.appendChild(nome);
    info.appendChild(sub);

    // Meta
    const meta = document.createElement('div');
    meta.className = 'barber-meta';

    const stars = document.createElement('span');
    stars.className  = 'stars';
    stars.textContent = `★ ${Number(b.rating_avg ?? 0).toFixed(1)}`;

    const badge = document.createElement('span');
    badge.className  = b.is_open ? 'badge' : 'badge closed';
    badge.textContent = b.is_open ? 'Aberto' : 'Fechado';

    meta.appendChild(stars);
    meta.appendChild(badge);

    row.appendChild(avatarWrap);
    row.appendChild(info);
    row.appendChild(meta);
    if (typeof CapaBarbearia !== 'undefined') CapaBarbearia.aplicarCapa(row, b.cover_path);
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
