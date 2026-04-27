'use strict';

// =============================================================
// SecureMediaAccessService.js — Acesso seguro a mídia privada via R2.
// Camada: application
//
// MODELO DE SEGURANÇA:
//
//   Bucket PRIVADO (Cloudflare R2):
//     - Zero objetos com URL pública direta
//     - Todo download passa por aqui: valida autenticidade + ownership
//     - URL assinada de curta duração (60s) — expira automaticamente
//
//   Controle de acesso:
//     - validateAccess() → somente o dono pode acessar o arquivo
//     - generateSignedUrl() → rejeita acesso não autorizado antes de gerar a URL
//     - Signed URL: apenas para quem foi validado; expira em SIGNED_URL_EXPIRES_SECS
//
//   Sem URL pública:
//     - publicUrl() do R2Client NUNCA é chamado aqui
//     - O front-end recebe apenas a URL assinada temporária
//
// FLUXO COMPLETO:
//   1. Frontend → GET /api/media/secure/:fileId  (com Bearer token)
//   2. AuthMiddleware valida JWT → popula req.user
//   3. SecureMediaAccessService.generateSignedUrl(fileId, userId)
//      a. Busca media_files WHERE id=fileId → 404 se não existir
//      b. Verifica owner_id === userId → 403 se não for dono
//      c. R2Client.presignedGet(path, 60s) → URL assinada temporária
//   4. Frontend usa a URL assinada para buscar o arquivo diretamente do R2
//      O arquivo nunca transita pelo servidor Express
//
// Dependências: R2Client, BaseService
// =============================================================

const BaseService = require('../infra/BaseService');

// Tempo de vida de cada URL assinada de download (segundos)
const SIGNED_URL_EXPIRES_SECS = 60;

class SecureMediaAccessService extends BaseService {

  /** @type {import('../infra/R2Client')} */
  #r2;

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /**
   * @param {import('../infra/R2Client')} r2Client
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(r2Client, supabase) {
    super('SecureMediaAccessService');
    this.#r2       = r2Client;
    this.#supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se o usuário é dono de um arquivo registrado em media_files.
   *
   * @param {string} userId — UUID do usuário autenticado
   * @param {string} fileId — UUID do registro em media_files
   * @returns {Promise<boolean>} true se o usuário é o dono; false caso contrário
   */
  async validateAccess(userId, fileId) {
    this._uuid('userId', userId);
    this._uuid('fileId', fileId);

    const { data } = await this.#supabase
      .from('media_files')
      .select('id')
      .eq('id',       fileId)
      .eq('owner_id', userId)
      .maybeSingle();

    return !!data;
  }

  /**
   * Gera URL de download assinada de curta duração para um arquivo privado no R2.
   *
   * Valida propriedade ANTES de gerar a URL — usuário não autorizado
   * jamais recebe uma URL, nem mesmo sabe se o arquivo existe (404 genérico).
   *
   * @param {string} fileId — UUID do registro em media_files
   * @param {string} userId — UUID do usuário autenticado
   * @returns {Promise<{ url: string, expiresIn: number }>}
   *   url       — URL assinada temporária (válida por SIGNED_URL_EXPIRES_SECS segundos)
   *   expiresIn — tempo de vida em segundos (para o cliente configurar o cache)
   * @throws {Error{status:401}} userId ou fileId inválidos
   * @throws {Error{status:404}} arquivo não encontrado
   * @throws {Error{status:403}} usuário não é o dono do arquivo
   */
  async generateSignedUrl(fileId, userId) {
    this._uuid('userId', userId);
    this._uuid('fileId', fileId);

    // Busca o arquivo sem filtrar por owner_id — distingue 404 de 403
    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, owner_id')
      .eq('id', fileId)
      .maybeSingle();

    if (error) throw Object.assign(new Error(error.message), { status: 500 });

    // Arquivo não encontrado: resposta genérica — não revela se existe
    if (!data) throw this._erro('Arquivo não encontrado.', 404);

    // Ownership check — 403 quando o arquivo existe mas não pertence ao usuário
    if (data.owner_id !== userId) throw this._erro('Acesso negado.', 403);

    const url = await this.#r2.presignedGet(data.path, SIGNED_URL_EXPIRES_SECS);
    return { url, expiresIn: SIGNED_URL_EXPIRES_SECS };
  }

  // ── Getter estático (util para testes) ───────────────────────
  static get SIGNED_URL_EXPIRES_SECS() {
    return SIGNED_URL_EXPIRES_SECS;
  }
}

module.exports = SecureMediaAccessService;
