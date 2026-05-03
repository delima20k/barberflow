'use strict';

// =============================================================
// BackendApiService.js — Cliente HTTP para a API Node.js BarberFlow.
//
// Substitui gradualmente as chamadas do ApiService.js (PostgREST)
// para tabelas que já têm endpoint no backend Node.js.
//
// Auth, Realtime e Storage continuam em SupabaseService.
// URLs de Storage públicas continuam em ApiService.
//
// Dependências: nenhuma (usa fetch nativo do browser)
// =============================================================
class BackendApiService {

  // Em produção: 'https://api.barberflow.app'
  // Em desenvolvimento: 'http://localhost:3001'
  static #BASE_URL = (() => {
    const { hostname } = window.location;
    return (hostname === 'localhost' || hostname === '127.0.0.1')
      ? 'http://localhost:3001'
      : 'https://api.barberflow.app';
  })();

  // Chave de armazenamento do JWT pelo SDK Supabase v2
  static #STORAGE_KEY = 'sb-jfvjisqnzapxxagkbxcu-auth-token';

  /** Lê o access_token da sessão Supabase do localStorage. */
  static #jwt() {
    try {
      const raw = localStorage.getItem(BackendApiService.#STORAGE_KEY);
      return raw ? (JSON.parse(raw)?.access_token ?? null) : null;
    } catch { return null; }
  }

  /** Headers padrão injetados em todas as requisições. */
  static #headers(extra = {}) {
    const jwt = BackendApiService.#jwt();
    return {
      'Content-Type': 'application/json',
      ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
      ...extra,
    };
  }

  /**
   * Executa uma requisição HTTP para o backend Node.js.
   * @param {string} method
   * @param {string} path — ex: '/api/profissionais/uuid-aqui'
   * @param {object} [body]
   * @returns {Promise<{ data: any, error: Error|null }>}
   */
  static async #req(method, path, body = undefined) {
    try {
      const res = await fetch(`${BackendApiService.#BASE_URL}${path}`, {
        method,
        headers: BackendApiService.#headers(),
        body:    body !== undefined ? JSON.stringify(body) : undefined,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const err = Object.assign(
          new Error(json?.error ?? `HTTP ${res.status}`),
          { status: res.status }
        );
        return { data: null, error: err };
      }

      return { data: json?.dados ?? json, error: null };
    } catch (err) {
      // Preserva mensagem original (ex: TypeError de fetch, AbortError de timeout)
      const msg = err?.message ?? 'Sem conexão com a internet.';
      return { data: null, error: new Error(msg) };
    }
  }

  // ── Profissionais ────────────────────────────────────────

  /** @param {string} id — UUID do profissional */
  static buscarProfissional(id) {
    return BackendApiService.#req('GET', `/api/profissionais/${id}`);
  }

  /** @param {string} barbershopId */
  static listarProfissionaisPorBarbearia(barbershopId) {
    return BackendApiService.#req('GET', `/api/profissionais/barbearia/${barbershopId}`);
  }

  /** @param {string} barbershopId */
  static listarCadeiras(barbershopId) {
    return BackendApiService.#req('GET', `/api/profissionais/${barbershopId}/cadeiras`);
  }

  /** @param {string} professionalId */
  static listarPortfolio(professionalId) {
    return BackendApiService.#req('GET', `/api/profissionais/${professionalId}/portfolio`);
  }

  /** @param {string} professionalId @param {{ image_url: string, caption?: string }} dados */
  static adicionarPortfolioImagem(professionalId, dados) {
    return BackendApiService.#req('POST', `/api/profissionais/${professionalId}/portfolio`, dados);
  }

  /** @param {string} professionalId @param {string} imageId */
  static removerPortfolioImagem(professionalId, imageId) {
    return BackendApiService.#req('DELETE', `/api/profissionais/${professionalId}/portfolio/${imageId}`);
  }

  // ── Social ────────────────────────────────────────────────

  /** @param {string} barbeariaId */
  static listarStories(barbeariaId) {
    return BackendApiService.#req('GET', `/api/social/stories/${barbeariaId}`);
  }

  /** @param {{ barbershop_id: string, media_url: string, type: string, caption?: string }} dados */
  static criarStory(dados) {
    return BackendApiService.#req('POST', '/api/social/stories', dados);
  }

  /** @param {string} storyId */
  static deletarStory(storyId) {
    return BackendApiService.#req('DELETE', `/api/social/stories/${storyId}`);
  }

  /** @param {string} storyId @param {string} texto */
  static comentarStory(storyId, texto) {
    return BackendApiService.#req('POST', `/api/social/stories/${storyId}/comentarios`, { texto });
  }

  /** @param {string} professionalId */
  static toggleLikeProfissional(professionalId) {
    return BackendApiService.#req('POST', `/api/social/profissionais/${professionalId}/like`);
  }

  /** @param {string} professionalId */
  static toggleFavoritoProfissional(professionalId) {
    return BackendApiService.#req('POST', `/api/social/profissionais/${professionalId}/favoritar`);
  }

  /** Lista favoritos do usuário autenticado */
  static listarFavoritos() {
    return BackendApiService.#req('GET', '/api/social/favoritos');
  }

  // ── Comunicação ───────────────────────────────────────────

  /** @param {number} [limit=30] */
  static listarNotificacoes(limit = 30) {
    return BackendApiService.#req('GET', `/api/comunicacao/notificacoes?limit=${limit}`);
  }

  /** @param {string} notificationId */
  static marcarNotificacaoLida(notificationId) {
    return BackendApiService.#req('PATCH', `/api/comunicacao/notificacoes/${notificationId}/lida`);
  }

  /** @param {string} contatoId @param {number} [limit=50] */
  static listarConversa(contatoId, limit = 50) {
    return BackendApiService.#req('GET', `/api/comunicacao/mensagens/${contatoId}?limit=${limit}`);
  }

  /** @param {string} destinatarioId @param {string} conteudo */
  static enviarMensagem(destinatarioId, conteudo) {
    return BackendApiService.#req('POST', '/api/comunicacao/mensagens', { destinatario_id: destinatarioId, conteudo });
  }

  // ── Fila ──────────────────────────────────────────────────

  /** @param {string} barbeariaId */
  static verFila(barbeariaId) {
    return BackendApiService.#req('GET', `/api/fila/${barbeariaId}`);
  }

  /** @param {string} barbeariaId @param {{ chair_id?: string, notes?: string }} [dados] */
  static entrarFila(barbeariaId, dados = {}) {
    return BackendApiService.#req('POST', `/api/fila/${barbeariaId}/entrar`, dados);
  }

  /** @param {string} barbeariaId @param {string} entradaId */
  static sairFila(barbeariaId, entradaId) {
    return BackendApiService.#req('DELETE', `/api/fila/${barbeariaId}/entradas/${entradaId}/sair`);
  }

  /** @param {string} barbeariaId @param {string} entradaId @param {string} status */
  static atualizarStatusFila(barbeariaId, entradaId, status) {
    return BackendApiService.#req('PATCH', `/api/fila/${barbeariaId}/entradas/${entradaId}/status`, { status });
  }

  // ── Barbearias (interações) ───────────────────────────────

  /** @param {string} barbeariaId @param {{ type: string }} dados */
  static interagirBarbearia(barbeariaId, dados) {
    return BackendApiService.#req('POST', `/api/barbearias/${barbeariaId}/interacao`, dados);
  }

  /** Lista barbearias favoritas do usuário */
  static listarBarbeariasFavoritas() {
    return BackendApiService.#req('GET', '/api/barbearias/favoritas');
  }

  // ── LGPD ─────────────────────────────────────────────────

  /** @param {string} userId */
  static verificarConsentimento(userId) {
    return BackendApiService.#req('GET', `/api/lgpd/consentimentos/${userId}`);
  }

  /** @param {{ version: string }} dados */
  static registrarConsentimento(dados) {
    return BackendApiService.#req('POST', '/api/lgpd/consentimentos', dados);
  }

  /** @param {string} motivo */
  static solicitarExclusaoDados(motivo) {
    return BackendApiService.#req('POST', '/api/lgpd/solicitacoes-exclusao', { motivo });
  }

  /** @param {{ target_user_id: string, data_type: string, purpose: string }} dados */
  static registrarLogAcesso(dados) {
    return BackendApiService.#req('POST', '/api/lgpd/acesso-dados-log', dados);
  }

  // ── Auth / Perfil ─────────────────────────────────────────

  /**
   * Cria perfil pós-signUp. Chamar imediatamente após SupabaseService.signUp().
   * @param {{ full_name: string, phone?: string, role?: string, pro_type?: string, barbearia?: string }} dados
   */
  static cadastrarPerfil(dados) {
    return BackendApiService.#req('POST', '/api/auth/cadastro-perfil', dados);
  }

  /** @param {string} userId */
  static buscarPerfilPublico(userId) {
    return BackendApiService.#req('GET', `/api/auth/perfil-publico/${userId}`);
  }

  // ── Usuários / Modal de clientes ─────────────────────────

  /**
   * Busca usuários por nome. Usado no modal de seleção de cliente.
   * @param {string} termo
   * @param {number} [limite=20]
   */
  static buscarClientes(termo, limite = 20) {
    const qs = new URLSearchParams({ termo, limite: String(limite) });
    return BackendApiService.#req('GET', `/api/usuarios/buscar?${qs}`);
  }

  /**
   * Retorna perfis de quem favoritou a barbearia ou o barbeiro.
   * @param {string} barbershopId
   * @param {string} professionalId
   */
  static getClientesFavoritosModal(barbershopId, professionalId) {
    const qs = new URLSearchParams({ barbershopId, professionalId });
    return BackendApiService.#req('GET', `/api/usuarios/favoritos-modal?${qs}`);
  }

  // ── Buscas (já em Node.js) ────────────────────────────────

  /** @param {string} id */
  static buscarBarbearia(id) {
    return BackendApiService.#req('GET', `/api/barbearias/${id}`);
  }

  /** @param {{ lat: number, lng: number, raio?: number }} params */
  static listarBarbeariasProximas({ lat, lng, raio = 5 }) {
    return BackendApiService.#req('GET', `/api/barbearias?lat=${lat}&lng=${lng}&raio=${raio}`);
  }

  /** @param {string} barbeariaId */
  static listarServicos(barbeariaId) {
    return BackendApiService.#req('GET', `/api/barbearias/${barbeariaId}/servicos`);
  }

  // ── Media ─────────────────────────────────────────────────

  /**
   * Envia buffer binário ao BFF com autenticação.
   * Retorna o Response nativo para que o caller inspecione .ok e leia .json().
   * @param {string} path — ex: '/api/media/upload-image?contexto=avatars'
   * @param {ArrayBuffer} buffer
   * @returns {Promise<Response>}
   */
  static async uploadBinario(path, buffer) {
    const jwt = BackendApiService.#jwt();
    return fetch(`${BackendApiService.#BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}),
      },
      body: buffer,
    });
  }
}
