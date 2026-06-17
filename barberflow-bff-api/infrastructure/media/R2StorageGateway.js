'use strict';

const R2Client = require('../../../src/infra/R2Client');
const AppError = require('../../utils/AppError');
const { StoryR2PathValidator } = require('../../application/stories/StoryR2PathValidator');

/**
 * R2StorageGateway — adapter Cloudflare R2 para o pipeline de mídia.
 *
 * Implementa a mesma interface de SupabaseMediaStorageGateway para troca transparente via DI.
 * Upload P2P: browser → R2 via presigned PUT. Servidor fora do caminho dos bytes.
 *
 * Variáveis de ambiente obrigatórias (herdadas de R2Client):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 *
 * Camada: infra
 */
class R2StorageGateway {
  /** @type {R2Client} */
  #r2;

  constructor() {
    this.#r2 = R2Client.getInstance();
  }

  // ── Upload ──────────────────────────────────────────────────

  /**
   * Gera URL presigned de upload (PUT) para o R2.
   * O browser envia o arquivo diretamente ao R2 via esta URL.
   *
   * @param {{ path: string, contentType: string, expiresIn?: number }} params
   * @returns {Promise<{ uploadUrl: string, expiresAt: string, publicUrl: string }>}
   */
  async createSignedUpload({ path, contentType, expiresIn = 300 }) {
    const uploadUrl = await this.#r2.presignedPut(path, contentType, expiresIn);
    return {
      uploadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      publicUrl: this.#r2.publicUrl(path),
    };
  }

  // ── Confirmação ─────────────────────────────────────────────

  /**
   * Verifica se o objeto existe no R2 após o upload do browser.
   * Usa HEAD em vez de download para evitar tráfego desnecessário.
   *
   * @param {{ path: string }} params
   * @returns {Promise<{ sizeBytes: number, contentType: string }>}
   * @throws {AppError} 400 se o objeto não existir
   */
  async assertObjectExists({ path }) {
    const meta = await this.#r2.head(path);
    if (!meta) throw AppError.badRequest('Arquivo não encontrado no R2 após upload.');
    return { sizeBytes: meta.tamanhoBytes, contentType: meta.contentType };
  }

  // ── Acesso assinado ─────────────────────────────────────────

  /**
   * Gera URL presigned de leitura (GET) para o R2.
   * Usado ao servir mídia privada ao cliente.
   *
   * @param {{ path: string, expiresInSeconds?: number }} params
   * @returns {Promise<{ signedUrl: string }>}
   */
  async createSignedAccess({ path, expiresInSeconds = 60 }) {
    const signedUrl = await this.#r2.presignedGet(path, expiresInSeconds);
    return { signedUrl };
  }

  // ── Pipeline assíncrono ─────────────────────────────────────

  /**
   * Baixa o arquivo fonte do R2 para processamento no pipeline.
   * Usado pelo MediaPipelineProcessor após confirmação do upload.
   *
   * @param {string} path
   * @returns {Promise<Buffer>}
   */
  async downloadSource(path) {
    return this.#r2.getBuffer(path);
  }

  /**
   * Faz upload de uma variante processada de volta ao R2.
   * Usado pelo CDNPublishStep no pipeline de mídia.
   *
   * @param {{ path: string, bytes: Buffer, contentType: string }} variant
   */
  async putVariant(variant) {
    await this.#r2.putBuffer(variant.path, variant.bytes, variant.contentType);
  }

  // ── Deleção (cleanup) ────────────────────────────────────────

  /**
   * Remove um objeto do R2 pertencente ao prefixo de Stories.
   * Idempotente: objeto já inexistente é tratado como sucesso.
   * Valida a key via StoryR2PathValidator antes de qualquer operação.
   *
   * @param {string} path — object key (deve iniciar com 'stories/')
   * @returns {Promise<void>}
   */
  async deleteObject(path) {
    const validKey = StoryR2PathValidator.validar(path);
    await this.#r2.delete(validKey);
  }

  /**
   * Generator assíncrono que itera objetos do prefixo 'stories/' página a página.
   * Nunca carrega o bucket inteiro na memória — usa ContinuationToken internamente.
   *
   * @param {string} prefix   — deve iniciar com 'stories/'
   * @param {number} [pageSize] — objetos por página (padrão: 200)
   * @yields {{ key: string, sizeBytes: number, lastModified: Date }[]}
   */
  listObjectsByPrefixPaginated(prefix, pageSize = 200) {
    if (!prefix || !prefix.startsWith(StoryR2PathValidator.ALLOWED_PREFIX)) {
      throw AppError.badRequest(`Prefixo inválido para listagem: deve iniciar com "${StoryR2PathValidator.ALLOWED_PREFIX}".`);
    }
    return this.#r2.listObjectsByPrefixPaginated(prefix, pageSize);
  }

  // ── Metadados ───────────────────────────────────────────────

  /**
   * Nome do bucket R2 (equivalente ao sourceBucket do gateway Supabase).
   * Usado pelo MediaPipelineProcessor como metadado da fonte.
   * @returns {string}
   */
  get sourceBucket() {
    return process.env.R2_BUCKET_NAME ?? '';
  }

  /**
   * Tenta criar uma instância de R2StorageGateway sem lançar exceção.
   * Retorna null se as variáveis R2 estiverem ausentes.
   * Usar em factories de rotas para evitar falha global no boot.
   *
   * @returns {R2StorageGateway|null}
   */
  static tryCreate() {
    try {
      return new R2StorageGateway();
    } catch (err) {
      console.warn('[R2StorageGateway] Indisponível —', err.message);
      return null;
    }
  }
}

module.exports = { R2StorageGateway };
