'use strict';

// =============================================================
// FallbackService.js — Sistema de download com fallback em cascata.
// Camada: application
//
// RESPONSABILIDADE:
//   Garantir disponibilidade de arquivos tentando fontes em ordem
//   de preferência (custo ↑ à medida que desce na cascata).
//   Cada fonte recebe até `maxRetries` tentativas antes do próximo.
//
// ORDEM DE PRIORIDADE (nunca violada):
//   1. P2P   — peer-to-peer; zero egress; mais barato
//   2. Cache — memória local; latência zero de rede
//   3. R2    — Cloudflare R2; armazenamento permanente; garantia final
//
// POLÍTICA DE RETRY:
//   - Throw (erro transiente) → nova tentativa até esgotar maxRetries
//   - null/undefined         → miss determinístico; avança imediatamente
//                              (cache vazio não é erro transiente)
//   - Buffer retornado       → sucesso imediato; encerra a cascata
//
// CUSTO × DISPONIBILIDADE:
//   P2P:   máxima economia em egress; depende de peers online
//   Cache: custo zero; volátil (processo)
//   R2:    custo pago de egress; permanente e confiável
//   BOTH (via ReplicationService): reduz dependência do R2 em alta demanda
//
// USO:
//   // Criar providers (injectable — sua implementação concreta):
//   const svc = new FallbackService({
//     p2pProvider:   new MeuP2PProvider(peerConfig),
//     cacheProvider: new MemoryCacheProvider(),
//     r2Provider:    new MeuR2Provider(r2Client, supabase),
//   });
//
//   // Baixar um arquivo com fallback automático:
//   const buffer = await svc.download(fileId); // Buffer
//
// INTERFACE DO PROVIDER (cada fonte deve implementar):
//   { get(fileId: string): Promise<Buffer|null> }
//     Buffer → conteúdo do arquivo
//     null   → arquivo não disponível nesta fonte (miss/inexistente)
//     throw  → falha transiente (rede, timeout, etc.) → dispara retry
//
// CLASSES EXPORTADAS:
//   FallbackService       — orquestrador da cascata
//   MemoryCacheProvider   — cache em memória pronto para uso em produção
//
// Dependências: BaseService
// =============================================================

const BaseService = require('../infra/BaseService');

const DEFAULT_MAX_RETRIES = 3;

// =============================================================
// MemoryCacheProvider — implementação de cache em memória.
//
// Pode ser usada diretamente como `cacheProvider` do FallbackService.
// Em produção, popule o cache após downloads bem-sucedidos de P2P/R2
// para acelerar requisições futuras.
//
// Uso:
//   const cache = new MemoryCacheProvider();
//   cache.set(fileId, buffer);   // popular manualmente
//   cache.has(fileId);           // verificar antes de download
//   cache.delete(fileId);        // invalidar entrada
//   cache.clear();               // limpar tudo
// =============================================================

class MemoryCacheProvider {

  /** @type {Map<string, Buffer>} */
  #store = new Map();

  /**
   * Retorna o Buffer cacheado para o fileId, ou null se não existir.
   * Sempre resolve (nunca lança) — miss é null, não um erro.
   *
   * @param {string} fileId
   * @returns {Promise<Buffer|null>}
   */
  async get(fileId) {
    return this.#store.get(fileId) ?? null;
  }

  /**
   * Armazena um Buffer no cache.
   * @param {string} fileId
   * @param {Buffer} buffer
   * @returns {this}
   */
  set(fileId, buffer) {
    this.#store.set(fileId, buffer);
    return this;
  }

  /**
   * Remove uma entrada do cache.
   * @param {string} fileId
   * @returns {this}
   */
  delete(fileId) {
    this.#store.delete(fileId);
    return this;
  }

  /**
   * Verifica se um fileId existe no cache.
   * @param {string} fileId
   * @returns {boolean}
   */
  has(fileId) {
    return this.#store.has(fileId);
  }

  /**
   * Limpa todas as entradas do cache.
   * @returns {this}
   */
  clear() {
    this.#store.clear();
    return this;
  }

  /** Número de entradas atualmente no cache. @type {number} */
  get size() {
    return this.#store.size;
  }
}

// =============================================================
// FallbackService
// =============================================================

class FallbackService extends BaseService {

  /** @type {{ get(fileId: string): Promise<Buffer|null> }} */
  #p2p;

  /** @type {{ get(fileId: string): Promise<Buffer|null> }} */
  #cache;

  /** @type {{ get(fileId: string): Promise<Buffer|null> }} */
  #r2;

  /** @type {number} */
  #maxRetries;

  /**
   * @param {Object} opts
   * @param {{ get(fileId: string): Promise<Buffer|null> }} opts.p2pProvider
   *   Fonte P2P — primeira tentativa (mais barata).
   * @param {{ get(fileId: string): Promise<Buffer|null> }} opts.cacheProvider
   *   Fonte cache — segunda tentativa (zero latência de rede).
   * @param {{ get(fileId: string): Promise<Buffer|null> }} opts.r2Provider
   *   Fonte R2 — fallback final (confiabilidade máxima).
   * @param {number} [opts.maxRetries=3]
   *   Máximo de tentativas por fonte antes de avançar para a próxima.
   *   Mínimo: 1. Padrão: 3.
   */
  constructor({
    p2pProvider,
    cacheProvider,
    r2Provider,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = {}) {
    super('FallbackService');

    if (!p2pProvider)   throw new TypeError('[FallbackService] p2pProvider é obrigatório');
    if (!cacheProvider) throw new TypeError('[FallbackService] cacheProvider é obrigatório');
    if (!r2Provider)    throw new TypeError('[FallbackService] r2Provider é obrigatório');

    if (!Number.isInteger(maxRetries) || maxRetries < 1) {
      throw new RangeError('[FallbackService] maxRetries deve ser um inteiro >= 1');
    }

    this.#p2p        = p2pProvider;
    this.#cache      = cacheProvider;
    this.#r2         = r2Provider;
    this.#maxRetries = maxRetries;
  }

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Baixa um arquivo respeitando a ordem de prioridade:
   *   1. P2P → 2. Cache → 3. R2
   *
   * A ordem NUNCA é ignorada.
   * Cada fonte recebe até `maxRetries` tentativas (erros transientes).
   * Um miss (null) avança imediatamente para a próxima fonte sem usar retries.
   *
   * @param {string} fileId — UUID do arquivo (media_files.id)
   * @returns {Promise<Buffer>}
   * @throws {Error{status:400}} fileId inválido (não-UUID)
   * @throws {Error{status:502}} nenhuma fonte conseguiu servir o arquivo
   */
  async download(fileId) {
    this._uuid('fileId', fileId);

    const fontes = [
      { nome: 'P2P',   provider: this.#p2p   },
      { nome: 'Cache', provider: this.#cache  },
      { nome: 'R2',    provider: this.#r2     },
    ];

    const erros = [];

    for (const { nome, provider } of fontes) {
      try {
        const buffer = await this.#tentar(provider, fileId);
        // Buffer → sucesso; null → miss determinístico (não é erro)
        if (Buffer.isBuffer(buffer)) return buffer;
      } catch (err) {
        // Todos os retries dessa fonte se esgotaram — registra e avança
        erros.push(`[${nome}] ${err.message}`);
      }
    }

    // Nenhuma fonte retornou conteúdo
    const detalhe = erros.length
      ? erros.join(' | ')
      : 'todos os sources retornaram miss';

    throw Object.assign(
      new Error(`[FallbackService] Arquivo não disponível: "${fileId}". ${detalhe}`),
      { status: 502 },
    );
  }

  /** Número máximo de tentativas por fonte. @type {number} */
  get maxRetries() { return this.#maxRetries; }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════════

  /**
   * Tenta obter o arquivo de um provider com até `#maxRetries` tentativas.
   *
   * Política de retry:
   *   - Throw (erro transiente) → nova tentativa até esgotar maxRetries
   *   - null/undefined          → miss determinístico → retorna null SEM retry
   *   - Buffer                  → retorna imediatamente
   *
   * @param {{ get(fileId: string): Promise<Buffer|null> }} provider
   * @param {string} fileId
   * @returns {Promise<Buffer|null>}  Buffer = sucesso; null = miss
   * @throws {Error} ao esgotar todas as tentativas com erros transientes
   */
  async #tentar(provider, fileId) {
    let ultimoErro;

    for (let tentativa = 1; tentativa <= this.#maxRetries; tentativa++) {
      try {
        const resultado = await provider.get(fileId);

        // null/undefined = miss determinístico — não adianta repetir
        if (resultado === null || resultado === undefined) return null;

        return resultado;
      } catch (err) {
        ultimoErro = err;
        // Tenta novamente até maxRetries
      }
    }

    // Retries esgotados com erro — propaga para download() decidir
    throw ultimoErro;
  }
}

module.exports = { FallbackService, MemoryCacheProvider };
