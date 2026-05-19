'use strict';

// =============================================================
// StorageService.js — Abstração de armazenamento híbrido.
// Camada: application
//
// Encapsula o roteamento entre Supabase Storage (imagens) e
// Cloudflare R2 (vídeos, áudio, mídia criptografada), isolando
// MediaManager de detalhes de cada provedor.
//
// Regra de roteamento:
//   avatars | services | portfolio → Supabase Storage
//   stories | encrypted            → Cloudflare R2
// =============================================================

const SupabaseStorageClient = require('../infra/SupabaseStorageClient');

// Roteamento de storage por contexto
const CONTEXTO_BACKEND = Object.freeze({
  avatars:   'supabase',
  services:  'supabase',
  portfolio: 'supabase',
  stories:   'r2',
});

// Bucket Supabase Storage para cada contexto de imagem
const CONTEXTO_BUCKET = Object.freeze({
  avatars:   SupabaseStorageClient.BUCKET_IMAGES,
  services:  SupabaseStorageClient.BUCKET_IMAGES,
  portfolio: SupabaseStorageClient.BUCKET_IMAGES,
});

class StorageService {

  /** @type {import('../infra/R2Client')} */
  #r2;

  /** @type {import('../infra/SupabaseStorageClient')|null} */
  #supabaseStorage;

  /**
   * @param {import('../infra/R2Client')} r2Client
   * @param {import('../infra/SupabaseStorageClient')|null} [supabaseStorageClient]
   */
  constructor(r2Client, supabaseStorageClient = null) {
    this.#r2              = r2Client;
    this.#supabaseStorage = supabaseStorageClient;
  }

  // ── Roteamento ────────────────────────────────────────────────

  /**
   * Retorna `true` se o contexto usa Supabase Storage.
   * @param {string} contexto
   */
  ehSupabase(contexto) {
    return CONTEXTO_BACKEND[contexto] === 'supabase';
  }

  /**
   * Retorna o nome do backend de storage para um contexto.
   * @param {string} contexto
   * @returns {'supabase'|'r2'}
   */
  backendPara(contexto) {
    return CONTEXTO_BACKEND[contexto] ?? 'r2';
  }

  // ── URL presigned para upload P2P ─────────────────────────────

  /**
   * Gera URL presigned de PUT para upload direto do cliente.
   *
   * @param {string} contexto
   * @param {string} path
   * @param {string} contentType
   * @param {number} expiresSecs
   * @returns {Promise<string>} uploadUrl
   */
  async presignedPut(contexto, path, contentType, expiresSecs) {
    if (this.ehSupabase(contexto)) {
      this.#garantirSupabaseStorage(contexto);
      return this.#supabaseStorage.presignedPut(CONTEXTO_BUCKET[contexto], path);
    }
    return this.#r2.presignedPut(path, contentType, expiresSecs);
  }

  // ── URL pública ───────────────────────────────────────────────

  /**
   * Retorna a URL pública de um path no storage correto.
   *
   * @param {string} contexto
   * @param {string} path
   * @returns {string}
   */
  publicUrl(contexto, path) {
    if (this.ehSupabase(contexto)) {
      this.#garantirSupabaseStorage(contexto);
      return this.#supabaseStorage.publicUrl(CONTEXTO_BUCKET[contexto], path);
    }
    return this.#r2.publicUrl(path);
  }

  // ── HEAD (verificar existência + metadados) ───────────────────

  /**
   * Verifica existência e retorna metadados básicos do arquivo.
   * Retorna `null` se o arquivo não existir.
   *
   * @param {string} contexto
   * @param {string} path
   * @returns {Promise<{tamanhoBytes: number, contentType: string}|null>}
   */
  async head(contexto, path) {
    if (this.ehSupabase(contexto)) {
      this.#garantirSupabaseStorage(contexto);
      return this.#supabaseStorage.head(CONTEXTO_BUCKET[contexto], path);
    }
    return this.#r2.head(path);
  }

  // ── Deleção ───────────────────────────────────────────────────

  /**
   * Remove um arquivo do storage correto.
   *
   * @param {string} contexto
   * @param {string} path
   * @returns {Promise<void>}
   */
  async delete(contexto, path) {
    if (this.ehSupabase(contexto)) {
      this.#garantirSupabaseStorage(contexto);
      return this.#supabaseStorage.delete(CONTEXTO_BUCKET[contexto], path);
    }
    return this.#r2.delete(path);
  }

  // ── R2 direto (mídia criptografada / binários) ────────────────

  /**
   * Faz PUT de um Buffer diretamente no R2.
   * Usado pelo pipeline de upload criptografado.
   *
   * @param {string} path
   * @param {Buffer} buffer
   * @param {string} contentType
   * @returns {Promise<void>}
   */
  async putBuffer(path, buffer, contentType) {
    return this.#r2.putBuffer(path, buffer, contentType);
  }

  /**
   * Faz GET de um Buffer diretamente do R2.
   * Usado pelo pipeline de download criptografado.
   *
   * @param {string} path
   * @returns {Promise<Buffer|null>}
   */
  async getBuffer(path) {
    return this.#r2.getBuffer(path);
  }

  // ── Guard interno ─────────────────────────────────────────────

  /**
   * Lança 500 se supabaseStorage não foi injetado.
   * Falha cedo com mensagem descritiva.
   * @param {string} contexto
   */
  #garantirSupabaseStorage(contexto) {
    if (!this.#supabaseStorage) {
      const err = new Error(
        `[StorageService] supabaseStorage não foi injetado (necessário para contexto "${contexto}").`
      );
      err.status = 500;
      throw err;
    }
  }
}

module.exports = StorageService;
