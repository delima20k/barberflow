'use strict';

// =============================================================
// MediaManager.js — Sistema híbrido de mídia reusável.
// Camada: application
//
// ARQUITETURA HÍBRIDA:
//
//   PRIMÁRIO  — P2P (presigned URL):
//     O cliente faz PUT direto ao Cloudflare R2.
//     O arquivo NUNCA passa pelo servidor Express.
//     Latência mínima; sem sobrecarga no backend.
//
//   FALLBACK  — R2 (CDN permanente):
//     Arquivos armazenados no Cloudflare R2 com URL pública.
//     Disponíveis mesmo quando o uploader está offline.
//
//   METADATA  — Supabase (PostgreSQL):
//     Apenas metadados (path, publicUrl, tipo, dono).
//     Supabase NÃO armazena o arquivo em si.
//
// FLUXO P2P COMPLETO:
//   1. Frontend → POST /api/media/presigned
//      Recebe: { uploadUrl, path, publicUrl, token, expiresAt }
//   2. Frontend → PUT uploadUrl (direto ao R2, sem servidor)
//      P2P: browser ↔ R2, servidor fora do caminho dos bytes
//   3. Frontend → POST /api/media/confirmar
//      Servidor: verifica HMAC + HEAD no R2 + salva em media_files
//
// CONTEXTOS SUPORTADOS:
//   stories | avatars | services | portfolio
//
// REUSABILIDADE:
//   Um único MediaManager serve todos os casos de uso de mídia.
//   Diferencie pelo parâmetro `contexto`.
//
// Dependências: R2Client, BaseService, InputValidator
// =============================================================

const crypto      = require('crypto');
const BaseService = require('../infra/BaseService');

// ── Mapeamento MIME → extensão de arquivo ──────────────────────
const MIME_PARA_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'video/mp4':  'mp4',
  'video/webm': 'webm',
});

// ── Configuração por contexto ───────────────────────────────────
const CONTEXTOS = Object.freeze({
  stories:   {
    maxBytes: 50 * 1024 * 1024,
    mimes: new Set(['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']),
  },
  avatars:   {
    maxBytes: 2 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  services:  {
    maxBytes: 5 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  portfolio: {
    maxBytes: 10 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
});

// Janela de validade da URL presigned (5 minutos)
const PRESIGNED_EXPIRES_SECS = 300;

class MediaManager extends BaseService {

  /** @type {import('../infra/R2Client')} */
  #r2;

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /** @type {string} */
  #signingSecret;

  /**
   * @param {import('../infra/R2Client')} r2Client  — instância do R2Client
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(r2Client, supabase) {
    super('MediaManager');
    this.#r2       = r2Client;
    this.#supabase = supabase;
    this.#signingSecret = process.env.MEDIA_SIGNING_SECRET ?? '';
    if (!this.#signingSecret) {
      throw new Error('[MediaManager] MEDIA_SIGNING_SECRET é obrigatório no .env');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ETAPA 1 — Gerar URL de upload P2P direto ao R2
  // ══════════════════════════════════════════════════════════════

  /**
   * Gera uma URL presigned para upload P2P direto ao Cloudflare R2.
   * O arquivo nunca transita pelo servidor — sobe direto do browser para o R2.
   *
   * @param {object} params
   * @param {string} params.contexto    — 'stories' | 'avatars' | 'services' | 'portfolio'
   * @param {string} params.ownerId     — UUID do usuário autenticado (auth.uid)
   * @param {string} params.contentType — MIME type do arquivo (ex: 'image/webp')
   * @returns {Promise<{
   *   uploadUrl: string,
   *   path:      string,
   *   publicUrl: string,
   *   token:     string,
   *   expiresAt: number
   * }>}
   */
  async gerarUrlPresigned({ contexto, ownerId, contentType }) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    const cfg = CONTEXTOS[contexto];
    if (!cfg.mimes.has(contentType)) {
      throw this._erro(
        `Tipo de arquivo não permitido para "${contexto}": ${contentType}`,
        415
      );
    }

    const ext  = MIME_PARA_EXT[contentType];
    const path = `${contexto}/${ownerId}/${crypto.randomUUID()}.${ext}`;
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGNED_EXPIRES_SECS;
    const token     = this.#assinarToken(path, ownerId, expiresAt);
    const uploadUrl = await this.#r2.presignedPut(path, contentType, PRESIGNED_EXPIRES_SECS);
    const publicUrl = this.#r2.publicUrl(path);

    return { uploadUrl, path, publicUrl, token, expiresAt };
  }

  // ══════════════════════════════════════════════════════════════
  // ETAPA 2 — Confirmar upload + persistir metadados
  // ══════════════════════════════════════════════════════════════

  /**
   * Confirma que o upload P2P foi realizado e persiste os metadados no Supabase.
   * Valida o HMAC para garantir que a URL foi gerada por este servidor.
   * Verifica a existência do arquivo no R2 via HEAD antes de persistir.
   *
   * @param {object} params
   * @param {string} params.path       — caminho no R2 (retornado por gerarUrlPresigned)
   * @param {string} params.ownerId    — UUID do usuário autenticado
   * @param {string} params.contexto
   * @param {string} params.token      — HMAC recebido em gerarUrlPresigned
   * @param {number} params.expiresAt  — timestamp retornado por gerarUrlPresigned
   * @param {object} [params.metadata] — dados extras livres (ex: { barbershopId, title })
   * @returns {Promise<{id: string, path: string, publicUrl: string, tamanhoBytes: number}>}
   */
  async confirmarUpload({ path, ownerId, contexto, token, expiresAt, metadata = {} }) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    if (!path || typeof path !== 'string') {
      throw this._erro('path inválido.', 400);
    }
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw this._erro('expiresAt inválido.', 400);
    }

    // ── Verificar HMAC (timing-safe) ─────────────────────────────
    const esperado  = this.#assinarToken(path, ownerId, expiresAt);
    const bufTok    = Buffer.from(typeof token === 'string' ? token : '', 'hex');
    const bufEsp    = Buffer.from(esperado, 'hex');
    const tokenValido = bufTok.length === bufEsp.length &&
                        crypto.timingSafeEqual(bufTok, bufEsp);
    if (!tokenValido) {
      throw this._erro('Token inválido.', 401);
    }

    // ── Verificar expiração ───────────────────────────────────────
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      throw this._erro('Token expirado. Solicite uma nova URL de upload.', 401);
    }

    // ── Verificar upload no R2 (HEAD) ─────────────────────────────
    const info = await this.#r2.head(path);
    if (!info) {
      throw this._erro('Arquivo não encontrado no storage. Realize o upload antes de confirmar.', 404);
    }

    const { tamanhoBytes, contentType } = info;

    // ── Validar tamanho ────────────────────────────────────────────
    const cfg = CONTEXTOS[contexto];
    if (tamanhoBytes > cfg.maxBytes) {
      // Remove o arquivo para não consumir quota
      await this.#r2.delete(path).catch(() => {});
      throw this._erro(
        `Arquivo excede o limite de ${cfg.maxBytes / 1024 / 1024} MB para "${contexto}".`,
        413
      );
    }

    const publicUrl = this.#r2.publicUrl(path);

    // ── Persistir metadados no Supabase ────────────────────────────
    const { data, error } = await this.#supabase
      .from('media_files')
      .insert({
        owner_id:      ownerId,
        contexto,
        path,
        public_url:    publicUrl,
        content_type:  contentType,
        tamanho_bytes: tamanhoBytes,
        metadata:      Object.keys(metadata).length > 0 ? metadata : null,
      })
      .select('id')
      .single();

    if (error) {
      throw Object.assign(new Error(error.message), { status: 500 });
    }

    return { id: data.id, path, publicUrl, tamanhoBytes };
  }

  // ══════════════════════════════════════════════════════════════
  // Deleção
  // ══════════════════════════════════════════════════════════════

  /**
   * Remove um arquivo do R2 e seu registro de metadados do Supabase.
   * Valida propriedade: somente o dono pode deletar.
   *
   * @param {string} mediaId  — UUID do registro em media_files
   * @param {string} ownerId  — UUID do usuário autenticado
   */
  async deletar(mediaId, ownerId) {
    this._uuid('mediaId', mediaId);
    this._uuid('ownerId', ownerId);

    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, owner_id')
      .eq('id', mediaId)
      .single();

    if (error || !data) throw this._erro('Mídia não encontrada.', 404);
    if (data.owner_id !== ownerId) throw this._erro('Acesso negado.', 403);

    // Deleta do R2 primeiro (falha aqui não deixa registro órfão)
    await this.#r2.delete(data.path);

    await this.#supabase.from('media_files').delete().eq('id', mediaId);
  }

  // ══════════════════════════════════════════════════════════════
  // Listagem
  // ══════════════════════════════════════════════════════════════

  /**
   * Lista todos os arquivos de um contexto pertencentes ao usuário.
   *
   * @param {string} contexto
   * @param {string} ownerId
   * @returns {Promise<Array<{
   *   id:           string,
   *   path:         string,
   *   publicUrl:    string,
   *   contentType:  string,
   *   tamanhoBytes: number,
   *   metadata:     object|null,
   *   criadoEm:     string
   * }>>}
   */
  async listar(contexto, ownerId) {
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));
    this._uuid('ownerId', ownerId);

    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, public_url, content_type, tamanho_bytes, metadata, created_at')
      .eq('contexto', contexto)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw Object.assign(new Error(error.message), { status: 500 });

    return (data ?? []).map(r => ({
      id:           r.id,
      path:         r.path,
      publicUrl:    r.public_url,
      contentType:  r.content_type,
      tamanhoBytes: r.tamanho_bytes,
      metadata:     r.metadata,
      criadoEm:     r.created_at,
    }));
  }

  // ══════════════════════════════════════════════════════════════
  // Helper público
  // ══════════════════════════════════════════════════════════════

  /**
   * Retorna a URL pública de um path no R2.
   * Conveniente para montar URLs sem acessar o R2Client diretamente.
   *
   * @param {string} path
   * @returns {string}
   */
  publicUrl(path) {
    return this.#r2.publicUrl(path);
  }

  // ══════════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════════

  /**
   * Gera um HMAC-SHA256 que vincula path + ownerId + expiresAt.
   * Impede que um token de uma requisição seja reutilizado para outra.
   *
   * @param {string} path
   * @param {string} ownerId
   * @param {number} expiresAt — Unix timestamp (segundos)
   * @returns {string} hex digest
   */
  #assinarToken(path, ownerId, expiresAt) {
    return crypto
      .createHmac('sha256', this.#signingSecret)
      .update(`${path}:${ownerId}:${expiresAt}`)
      .digest('hex');
  }

  /**
   * Retorna os nomes de contexto válidos.
   * @returns {string[]}
   */
  static get contextos() {
    return Object.keys(CONTEXTOS);
  }
}

module.exports = MediaManager;
