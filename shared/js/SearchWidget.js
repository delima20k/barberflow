'use strict';

// =============================================================
// SearchWidget.js — Busca dinâmica de barbearias (POO, Singleton)
//
// Responsabilidades:
//   - Debounce de 350ms no input
//   - Busca no Supabase por: nome, endereço, cidade, CEP
//   - Renderiza resultados como barber-rows dinâmicos (zero innerHTML)
//   - Gerencia estados: boas-vindas | loading | lista | vazio | erro
//
// Dependências: SupabaseService.js
//
// Uso (auto-inicializa no DOMContentLoaded):
//   SearchWidget.init('pesquisa-input', 'pesquisa-resultados')
// =============================================================

class SearchWidget {

  static #input        = null;
  static #container    = null;
  static #timer        = null;

  static #DEBOUNCE_MS  = 350;
  static #MIN_CHARS    = 2;
  static #LIMIT        = 20;

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

    SearchWidget.#bindEventos();
    SearchWidget.#renderBemVindo();
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Eventos
  // ═══════════════════════════════════════════════════════════

  static #bindEventos() {
    SearchWidget.#input.addEventListener('input', () => {
      clearTimeout(SearchWidget.#timer);
      const termo = SearchWidget.#input.value.trim();

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

    try {
      const { data, error } = await SupabaseService.client
        .from('barbershops')
        .select('id, name, address, city, zip_code, logo_path, is_open, rating_avg')
        .eq('is_active', true)
        .or(
          `name.ilike.%${termo}%,` +
          `address.ilike.%${termo}%,` +
          `city.ilike.%${termo}%,` +
          `zip_code.ilike.%${termo}%`
        )
        .order('rating_avg', { ascending: false })
        .limit(SearchWidget.#LIMIT);

      if (error) throw error;

      if (!data.length) {
        SearchWidget.#renderVazio(termo);
      } else {
        SearchWidget.#renderLista(data);
      }
    } catch {
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
    const wrap = SearchWidget.#criarPlaceholder('💈', 'Digite o nome, bairro, rua ou CEP para buscar');
    SearchWidget.#montar(wrap);
  }

  static #renderLoading() {
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
    const wrap = SearchWidget.#criarPlaceholder(
      '🔍',
      `Nenhuma barbearia encontrada para "${termo}"`
    );
    SearchWidget.#montar(wrap);
  }

  static #renderErro() {
    const wrap = SearchWidget.#criarPlaceholder('⚠️', 'Erro ao buscar. Verifique sua conexão.');
    SearchWidget.#montar(wrap);
  }

  static #renderLista(lista) {
    const wrap = document.createElement('div');
    wrap.className = 'nearby-lista';
    lista.forEach(b => wrap.appendChild(SearchWidget.#criarBarberRow(b)));
    SearchWidget.#montar(wrap);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO — Criação de DOM
  // ═══════════════════════════════════════════════════════════

  /**
   * Cria um estado de placeholder (ícone + mensagem).
   * @param {string} icone
   * @param {string} mensagem
   * @returns {HTMLElement}
   */
  static #criarPlaceholder(icone, mensagem) {
    const wrap = document.createElement('div');
    wrap.className = 'search-placeholder';

    const icon = document.createElement('span');
    icon.className = 'search-placeholder-icon';
    icon.textContent = icone;

    const msg = document.createElement('p');
    msg.className = 'nearby-gps-msg';
    msg.textContent = mensagem;

    wrap.appendChild(icon);
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
    row.className = 'barber-row';

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar gold';
    if (b.logo_path) {
      const img       = document.createElement('img');
      img.src         = b.logo_path;
      img.alt         = b.name;
      img.onerror     = () => { avatarWrap.textContent = '💈'; };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = '💈';
    }

    // Info
    const info = document.createElement('div');
    info.className = 'barber-info';

    const nome = document.createElement('p');
    nome.className  = 'barber-name';
    nome.textContent = b.name;

    const sub = document.createElement('p');
    sub.className  = 'barber-sub';
    sub.textContent = [b.address, b.city].filter(Boolean).join(' · ');

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
    return row;
  }
}

// Auto-inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () =>
  SearchWidget.init('pesquisa-input', 'pesquisa-resultados')
);
