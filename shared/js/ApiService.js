'use strict';

// =============================================================
// ApiQuery — construtor de queries PostgREST via fetch nativo.
// Classe interna: use ApiService.from(table) como ponto de entrada.
// =============================================================
class ApiQuery {

  #table;
  #baseUrl;
  #getHeaders;
  #params;
  #method    = 'GET';
  #body      = null;
  #single    = false;
  #maybe     = false;
  #upsertPrefer   = null;
  #upsertConflict = null;

  constructor(table, baseUrl, getHeaders) {
    this.#table      = table;
    this.#baseUrl    = baseUrl;
    this.#getHeaders = getHeaders;
    this.#params     = new URLSearchParams();
  }

  // ── Projeção ─────────────────────────────────────────────

  /**
   * Define os campos retornados (SELECT).
   * Quando chamado após insert/update/delete, adiciona ?select= para retornar as colunas.
   */
  select(fields) {
    // PostgREST rejeita espaços nos nomes de coluna (URLSearchParams codifica como +).
    // Normaliza removendo espaços ao redor de vírgulas e no início/fim.
    if (fields) this.#params.set('select', fields.replace(/\s*,\s*/g, ',').trim());
    return this;
  }

  // ── Filtros ──────────────────────────────────────────────

  eq(col, val)         { this.#params.append(col, `eq.${val}`);              return this; }
  neq(col, val)        { this.#params.append(col, `neq.${val}`);             return this; }
  gt(col, val)         { this.#params.append(col, `gt.${val}`);              return this; }
  lt(col, val)         { this.#params.append(col, `lt.${val}`);              return this; }
  gte(col, val)        { this.#params.append(col, `gte.${val}`);             return this; }
  lte(col, val)        { this.#params.append(col, `lte.${val}`);             return this; }
  in(col, vals)        { this.#params.append(col, `in.(${vals.join(',')})`); return this; }
  or(filterStr)        { this.#params.set('or',   `(${filterStr})`);         return this; }
  is(col, val)         { this.#params.append(col, `is.${val}`);              return this; }
  not(col, op, val)    { this.#params.append(col, `not.${op}.${val}`);       return this; }
  filter(col, op, val) { this.#params.append(col, `${op}.${val}`);           return this; }

  // ── Ordenação / paginação ────────────────────────────────

  /** Suporta múltiplas chamadas — concatena com vírgula (PostgREST). */
  order(col, { ascending = true } = {}) {
    const entry   = `${col}.${ascending ? 'asc' : 'desc'}`;
    const current = this.#params.get('order');
    this.#params.set('order', current ? `${current},${entry}` : entry);
    return this;
  }

  limit(n)            { this.#params.set('limit', String(n)); return this; }
  range(from, to)     {
    this.#params.set('offset', String(from));
    this.#params.set('limit',  String(to - from + 1));
    return this;
  }

  // ── Modificadores de resultado ───────────────────────────

  /** Retorna objeto único; erro se 0 ou múltiplas linhas. */
  single()      { this.#single = true;                    return this; }
  /** Retorna objeto único ou null sem erro quando 0 linhas. */
  maybeSingle() { this.#single = true; this.#maybe = true; return this; }

  // ── Mutações ─────────────────────────────────────────────

  insert(data) { this.#method = 'POST';  this.#body = data; return this; }
  update(data) { this.#method = 'PATCH'; this.#body = data; return this; }
  delete()     { this.#method = 'DELETE';                   return this; }

  /**
   * Upsert via POST com header Prefer de resolução.
   * @param {object|object[]} data
   * @param {{ onConflict?: string, ignoreDuplicates?: boolean }} opts
   */
  upsert(data, { onConflict, ignoreDuplicates = false } = {}) {
    this.#method = 'POST';
    this.#body   = data;
    this.#upsertPrefer   = ignoreDuplicates
      ? 'resolution=ignore-duplicates'
      : 'resolution=merge-duplicates';
    if (onConflict) this.#upsertConflict = onConflict;
    return this;
  }

  // ── Execução ─────────────────────────────────────────────

  async #exec() {
    const headers = { ...this.#getHeaders() };

    // Accept para objeto único (single / maybeSingle)
    if (this.#single) headers['Accept'] = 'application/vnd.pgrst.object+json';

    // Prefer: return=representation para mutations que devolvem dados
    if (this.#method === 'POST' || this.#method === 'PATCH') {
      headers['Prefer'] = this.#upsertPrefer
        ? `return=representation,${this.#upsertPrefer}`
        : 'return=representation';
    } else if (this.#upsertPrefer) {
      headers['Prefer'] = this.#upsertPrefer;
    }

    // Content-Type para mutations com body
    if (this.#body !== null && this.#method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
    }

    if (this.#upsertConflict) {
      this.#params.set('on_conflict', this.#upsertConflict);
    }

    const qs  = this.#params.toString();
    const url = `${this.#baseUrl}/rest/v1/${this.#table}${qs ? '?' + qs : ''}`;

    let res;
    try {
      res = await fetch(url, {
        method:  this.#method,
        headers,
        body:    this.#body !== null ? JSON.stringify(this.#body) : undefined,
      });
    } catch (_) {
      return { data: null, error: new Error('Sem conexão com a internet.') };
    }

    // maybeSingle: sem linhas não é erro
    if (this.#maybe && (res.status === 406 || res.status === 404)) {
      return { data: null, error: null };
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // PGRST116 = nenhuma linha (PostgREST) — tratado como null para maybeSingle
      if (this.#maybe && body?.code === 'PGRST116') return { data: null, error: null };
      const err = Object.assign(
        new Error(body?.message ?? `HTTP ${res.status}`),
        { status: res.status, code: body?.code ?? null }
      );
      return { data: null, error: err };
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { data, error: null };
  }

  /** Torna o objeto thenable — permite `const { data, error } = await ApiService.from(...)...` */
  then(resolve, reject) { return this.#exec().then(resolve, reject); }
}

// =============================================================
// ApiService — ponto único de acesso à API REST do Supabase.
//
// Substitui o Supabase JS SDK para todas as queries CRUD.
// Auth, Realtime e Storage continuam em SupabaseService (fases 3/4).
//
// Dependências: nenhuma (usa fetch e localStorage nativos do browser)
// =============================================================
class ApiService {

  static #URL      = 'https://jfvjisqnzapxxagkbxcu.supabase.co';
  static #ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmdmppc3FuemFweHhhZ2tieGN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTAzODUsImV4cCI6MjA5MTA2NjM4NX0.HnPEnl_H-2hap53Q9y1NtR5ffBWddNQJkAB7Grw0-9A';

  // Chave de armazenamento do JWT pelo SDK Supabase v2
  static #STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  /** Lê o access_token da sessão persistida pelo SDK no localStorage. */
  static #jwt() {
    try {
      const raw = localStorage.getItem(ApiService.#STORAGE_KEY);
      return raw ? (JSON.parse(raw)?.access_token ?? null) : null;
    } catch { return null; }
  }

  /** Headers base injetados em toda requisição. */
  static #headers() {
    const jwt = ApiService.#jwt();
    return {
      'apikey': ApiService.#ANON_KEY,
      ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
    };
  }

  // ── Query builder ────────────────────────────────────────

  /**
   * Inicia um query builder fluente para a tabela indicada.
   * Exemplo:
   *   const { data, error } = await ApiService.from('barbershops')
   *     .select('id, name')
   *     .eq('is_active', true)
   *     .order('rating_score', { ascending: false })
   *     .limit(10);
   *
   * @param {string} table — nome da tabela/view no PostgREST
   * @returns {ApiQuery}
   */
  static from(table) {
    return new ApiQuery(table, ApiService.#URL, () => ApiService.#headers());
  }

  // ── RPC ──────────────────────────────────────────────────

  /**
   * Chama uma função PostgreSQL via PostgREST RPC.
   * @param {string} fn    — nome da função
   * @param {object} body  — parâmetros
   * @returns {Promise<{data: any, error: Error|null}>}
   */
  static async rpc(fn, body = {}) {
    const headers = {
      ...ApiService.#headers(),
      'Content-Type': 'application/json',
      'Prefer':        'return=representation',
    };
    try {
      const res = await fetch(`${ApiService.#URL}/rest/v1/rpc/${fn}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: Object.assign(new Error(err.message ?? `HTTP ${res.status}`), { status: res.status }) };
      }
      const text = await res.text();
      return { data: text ? JSON.parse(text) : null, error: null };
    } catch (_) {
      return { data: null, error: new Error('Sem conexão com a internet.') };
    }
  }

  // ── URL helpers de Storage (sem SDK) ────────────────────

  /**
   * Retorna a URL pública de um avatar a partir de um path relativo.
   * @param {string} path — avatar_path relativo (ex: "userId/avatar.jpeg")
   * @returns {string}
   */
  static getAvatarUrl(path) {
    return path ? `${ApiService.#URL}/storage/v1/object/public/avatars/${path}` : '';
  }

  /**
   * Resolve a URL pública do avatar garantindo:
   *  - Suporte a paths relativos E URLs completas (OAuth, legado)
   *  - Cache-bust derivado de updated_at para evitar imagem obsoleta no browser
   *
   * @param {string|null} path       — avatar_path da tabela profiles
   * @param {string|null} updatedAt  — profiles.updated_at (ISO string)
   * @returns {string}
   */
  static resolveAvatarUrl(path, updatedAt = null) {
    if (!path) return '';
    const base = path.startsWith('http') ? path : ApiService.getAvatarUrl(path);
    const cleanBase = base.split('?')[0];
    const ts = updatedAt ? new Date(updatedAt).getTime() : null;
    return ts ? `${cleanBase}?t=${ts}` : cleanBase;
  }

  /**
   * Retorna a URL pública de um logo de barbearia.
   * @param {string} path — logo_path / cover_path da tabela barbershops
   * @returns {string}
   */
  static getLogoUrl(path) {
    return path ? `${ApiService.#URL}/storage/v1/object/public/barbershops/${path}` : '';
  }

  /**
   * Retorna a URL pública de uma thumbnail do portfólio.
   * @param {string} path — thumbnail_path
   * @returns {string}
   */
  static getPortfolioThumbUrl(path) {
    return path ? `${ApiService.#URL}/storage/v1/object/public/portfolio/${path}` : '';
  }
}
