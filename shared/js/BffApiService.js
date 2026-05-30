'use strict';

// =============================================================
// BffApiService.js — Cliente HTTP para a BFF BarberFlow.
//
// Responsabilidades:
//   - Centralizar todas as chamadas HTTP ao BFF (porta 3002 dev /
//     https://bff.berberflow.shop prod)
//   - Retornar { data, total, error } para padronizar tratamento
//   - Endpoints públicos: sem token | Endpoints autenticados: Bearer JWT
//   - Timeout de 8s via AbortController
//   - Nunca lança exceção — erros sempre em { error }
//
// Dependências: nenhuma (fetch nativo do browser)
// =============================================================

class BffApiService {

  static #BASE_URL = (() => {
    const { hostname } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3002'
      : 'https://bff.berberflow.shop';
  })();

  static #TIMEOUT_MS   = 8000;
  static #STORAGE_KEY  = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  // ── HTTP ─────────────────────────────────────────────────────────

  /**
   * Executa GET na BFF com timeout e retorno estruturado.
   * Inclui Authorization Bearer se o usuário estiver autenticado.
   * @param {string}                           path   — ex: '/api/v1/barbearias'
   * @param {Record<string, string|number>}    [params] — query string
   * @returns {Promise<{ data: any, total: number|null, error: Error|null }>}
   */
  static async get(path, params = {}) {
    const url = BffApiService.#buildUrl(path, params);
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        headers: authHeaders,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, total: null, error: err };
      }
      return { data: json?.dados ?? json, total: json?.meta?.total ?? null, error: null };
    } catch (err) {
      return { data: null, total: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa PATCH autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/clientes/localizacao'
   * @param {object} body   — payload JSON
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async patch(path, body) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa PATCH autenticado na BFF com corpo binário (imagens).
   * @param {string}      path        — ex: '/api/v1/barbearias/minha/imagem?tipo=logo'
   * @param {ArrayBuffer} buffer
   * @param {string}      contentType — ex: 'image/jpeg'
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async patchBinario(path, buffer, contentType) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const upload = await BffApiService.#prepareBinaryUpload(buffer, contentType);
      const res = await BffApiService.#fetchComTimeout(url, {
        method:  'PATCH',
        headers: { 'Content-Type': upload.contentType, ...authHeaders },
        body:    upload.buffer,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa POST autenticado na BFF com corpo binário (imagens).
   * @param {string}      path        — ex: '/api/v1/profissionais/me/portfolio'
   * @param {ArrayBuffer} buffer
   * @param {string}      contentType — ex: 'image/jpeg'
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async postBinario(path, buffer, contentType) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const upload = await BffApiService.#prepareBinaryUpload(buffer, contentType);
      const res = await BffApiService.#fetchComTimeout(url, {
        method:  'POST',
        headers: { 'Content-Type': upload.contentType, ...authHeaders },
        body:    upload.buffer,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa POST autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/notificacoes/push-barbeiro'
   * @param {object} body   — payload JSON
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async post(path, body) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body:    JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: json?.dados ?? null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  /**
   * Executa DELETE autenticado na BFF com timeout e retorno estruturado.
   * @param {string} path   — ex: '/api/v1/mensalistas/abc-123'
   * @returns {Promise<{ data: null, error: Error|null }>}
   */
  static async delete(path) {
    const url = `${BffApiService.#BASE_URL}${path}`;
    try {
      const authHeaders = await BffApiService.#authHeaders();
      const res  = await BffApiService.#fetchComTimeout(url, {
        method:  'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const err  = new Error(json?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        return { data: null, error: err };
      }
      return { data: null, error: null };
    } catch (err) {
      return { data: null, error: BffApiService.#parseErroRede(err) };
    }
  }

  // ── Namespace: mensalistas ────────────────────────────────────────

  /**
   * Métodos de acesso ao endpoint /api/v1/mensalistas.
   *
   * Uso:
   *   const { data, error } = await BffApiService.mensalistas.verificar(shopId, clientId);
   *   const { data, error } = await BffApiService.mensalistas.listar(shopId);
   */
  static mensalistas = {
    adicionar:                 (barbershopId, clientId, monthlyFee = 0) =>
      BffApiService.post('/api/v1/mensalistas', {
        barbershop_id: barbershopId,
        client_id:     clientId,
        monthly_fee:   monthlyFee,
      }),

    listar:                    (barbershopId) =>
      BffApiService.get('/api/v1/mensalistas', { barbershop_id: barbershopId }),

    verificar:                 (barbershopId, clientId) =>
      BffApiService.get('/api/v1/mensalistas/verificar', { barbershop_id: barbershopId, client_id: clientId }),

    remover:                   (id) =>
      BffApiService.delete(`/api/v1/mensalistas/${encodeURIComponent(id)}`),

    buscarClientesDisponiveis: (barbershopId, q = '') =>
      BffApiService.get('/api/v1/mensalistas/clientes-disponiveis', { barbershop_id: barbershopId, q }),

    favoritosElegiveis:        (barbershopId) =>
      BffApiService.get('/api/v1/mensalistas/favoritos-elegiveis', { barbershop_id: barbershopId }),

    favoritosModal:            (barbershopId, professionalId) =>
      BffApiService.get('/api/v1/mensalistas/favoritos-modal', { barbershop_id: barbershopId, professional_id: professionalId }),

    incrementarCortes:         (barbershopId, clientId) =>
      BffApiService.post('/api/v1/mensalistas/incrementar-cortes', {
        barbershop_id: barbershopId,
        client_id:     clientId,
      }),
  };

  // ── Namespace: barbearias ─────────────────────────────────────────

  static barbearias = {
    salvarImagem: (tipo, buffer, mime) =>
      BffApiService.patchBinario(
        `/api/v1/barbearias/minha/imagem?tipo=${encodeURIComponent(tipo)}`,
        buffer,
        mime,
      ),

    salvarImagemServico: (buffer, mime) =>
      BffApiService.patchBinario('/api/v1/barbearias/minha/servicos/imagem', buffer, mime),

    gestaoVinculada: (barbershopId) =>
      BffApiService.get(`/api/v1/barbearias/${encodeURIComponent(barbershopId)}/gestao`),

    portfolio: (barbershopId, params = {}) =>
      BffApiService.get(`/api/v1/barbearias/${encodeURIComponent(barbershopId)}/portfolio`, params),

    publicarStory: (barbershopId, payload) =>
      BffApiService.post(`/api/v1/barbearias/${encodeURIComponent(barbershopId)}/stories`, payload),
  };

  // ── Namespace: financeiro ────────────────────────────────────

  static profissionais = {
    perfilPublico: (professionalId) =>
      BffApiService.get(`/api/v1/profissionais/${encodeURIComponent(professionalId)}/perfil-publico`),

    atualizarMeuPerfilPublico: (payload) =>
      BffApiService.patch('/api/v1/profissionais/me/public-profile', payload),

    iniciarMensagemBarbearia: (professionalId, payload = {}) =>
      BffApiService.post(`/api/v1/profissionais/${encodeURIComponent(professionalId)}/mensagem-barbearia`, payload ?? {}),

    portfolio: (professionalId, params = {}) =>
      BffApiService.get(`/api/v1/profissionais/${encodeURIComponent(professionalId)}/portfolio`, params),

    atualizarPortfolioImagem: (imageId, payload) =>
      BffApiService.patch(`/api/v1/profissionais/me/portfolio/${encodeURIComponent(imageId)}`, payload),

    removerPortfolioImagem: (imageId) =>
      BffApiService.delete(`/api/v1/profissionais/me/portfolio/${encodeURIComponent(imageId)}`),

    listarMeuPortfolio: (params = {}) =>
      BffApiService.get('/api/v1/profissionais/me/portfolio', params),

    uploadPortfolioImagem: (buffer, mime) =>
      BffApiService.postBinario('/api/v1/profissionais/me/portfolio', buffer, mime),

    listarBarbeariasVinculadas: () =>
      BffApiService.get('/api/v1/profissionais/me/barbearias-vinculadas'),

    listarCurtidasPortfolio: (imageIds = []) =>
      BffApiService.get('/api/v1/profissionais/me/portfolio/likes', {
        ids: Array.isArray(imageIds) ? imageIds.filter(Boolean).join(',') : '',
      }),

    curtirPortfolioImagem: (imageId) =>
      BffApiService.post(`/api/v1/profissionais/me/portfolio/${encodeURIComponent(imageId)}/like`, {}),

    descurtirPortfolioImagem: (imageId) =>
      BffApiService.delete(`/api/v1/profissionais/me/portfolio/${encodeURIComponent(imageId)}/like`),
  };

  static chat = {
    listarMensagens: (conversationId, params = {}) =>
      BffApiService.get(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`, params),
  };

  static financeiro = {
    dashboard: ({ barbershopId, periodo = 'mes', de = null, ate = null } = {}) =>
      BffApiService.get('/api/v1/financeiro/dashboard', {
        barbershop_id: barbershopId,
        periodo,
        de,
        ate,
      }),

    extratoBarbeiro: (barbershopId, professionalId, { periodo = 'mes', de = null, ate = null } = {}) =>
      BffApiService.get(
        `/api/v1/financeiro/barbeiros/${encodeURIComponent(professionalId)}/extrato`,
        { barbershop_id: barbershopId, periodo, de, ate },
      ),

    aplicarTaxaMetodo: ({ barbershopId, metodo, porcentagem, periodo = 'mes', de = null, ate = null } = {}) =>
      BffApiService.patch('/api/v1/financeiro/taxas-metodo', {
        barbershop_id: barbershopId,
        metodo,
        porcentagem,
        periodo,
        de,
        ate,
      }),
  };

  // ── Getter público (usado por GeoService para montar URL da fila offline) ──

  /** @returns {string} URL base da BFF */
  static get baseUrl() { return BffApiService.#BASE_URL; }

  // ── Privados ─────────────────────────────────────────────────────

  /**
   * Executa fetch com AbortController e timeout configurado.
   * Lança AbortError se o tempo esgotar.
   * @param {string}      url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  static async #fetchComTimeout(url, options) {
    const ctrl    = new AbortController();
    const timerId = setTimeout(() => ctrl.abort(), BffApiService.#TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timerId);
      return res;
    } catch (err) {
      clearTimeout(timerId);
      throw err;
    }
  }

  static async #prepareBinaryUpload(buffer, contentType) {
    const mime = String(contentType ?? '').toLowerCase();
    const canCompress = mime.startsWith('image/')
      && typeof ImageCompressionService !== 'undefined'
      && typeof ImageCompressionService.compress === 'function';
    if (!canCompress) return { buffer, contentType };
    const compressed = await ImageCompressionService.compress(buffer, {
      contentType: mime,
      preset: 'FULL',
    });
    return {
      buffer: compressed.buffer,
      contentType: compressed.contentType || mime,
    };
  }

  /**
   * Converte erro de rede/timeout em Error com mensagem amigável.
   * @param {Error} err
   * @returns {Error}
   */
  static #parseErroRede(err) {
    const msg = err?.name === 'AbortError'
      ? 'Timeout: BFF não respondeu a tempo.'
      : (err?.message ?? 'Sem conexão com a BFF.');
    return new Error(msg);
  }

  /**
   * Retorna headers de autenticação se o usuário estiver logado.
   * @returns {Promise<Record<string, string>>}
   */
  static async #authHeaders() {
    const token = await BffApiService.#getTokenAsync();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Prioriza a sessão viva do Supabase SDK e usa localStorage só como fallback.
   * @returns {Promise<string|null>}
   */
  static async #getTokenAsync() {
    try {
      if (typeof SupabaseService !== 'undefined' && typeof SupabaseService.getSession === 'function') {
        const session = await SupabaseService.getSession();
        if (session?.access_token) return session.access_token;
      }
    } catch {
      // Fallback abaixo mantém compatibilidade quando o SDK ainda não carregou.
    }
    return BffApiService.#getToken();
  }

  /**
   * Lê o access_token JWT do localStorage (Supabase).
   * Retorna null se ausente, se não houver expires_at, ou se o token estiver expirado.
   * @returns {string|null}
   */
  static #getToken() {
    try {
      const raw = localStorage.getItem(BffApiService.#STORAGE_KEY);
      if (!raw) return null;
      const parsed    = JSON.parse(raw);
      const token     = parsed?.access_token ?? null;
      const expiresAt = parsed?.expires_at;   // Unix timestamp em segundos
      if (!token) return null;
      // expires_at é obrigatório — sem ele o token é tratado como inválido
      // (protege contra sessões malformadas que não carregam expiração).
      if (!expiresAt) return null;
      // Buffer de 60s para cobrir clock skew entre cliente e servidor + latência de rede
      if (Date.now() / 1000 > expiresAt - 60) return null;
      return token;
    } catch {
      return null;
    }
  }

  /**
   * Retorna true se há um token válido (não expirado) no localStorage.
   * Usado por GeoService e similares para evitar chamadas sem auth.
   * @returns {boolean}
   */
  static temTokenValido() {
    return BffApiService.#getToken() !== null;
  }

  /**
   * Constrói URL com query string a partir de um objeto de parâmetros.
   * @param {string}                          path
   * @param {Record<string, string|number>}   params
   * @returns {string}
   */
  static #buildUrl(path, params) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${BffApiService.#BASE_URL}${path}${qs ? `?${qs}` : ''}`;
  }
}
