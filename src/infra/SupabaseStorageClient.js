'use strict';

// =============================================================
// SupabaseStorageClient.js — Cliente Supabase Storage para imagens.
// Camada: infra
//
// RESPONSABILIDADE:
//   Upload/download/deleção de imagens estáticas no Supabase Storage.
//   Usado pelo MediaManager para imagens (avatars, services, portfolio).
//   Vídeos/áudio continuam no Cloudflare R2 (sem limite, egress gratuito).
//
// BUCKET:
//   media-images — público (RLS: qualquer um lê; só o dono escreve/deleta)
//
// FLUXO P2P (sem passar pelo servidor):
//   1. presignedPut(bucket, path)  → signed URL
//   2. Frontend PUT direto ao Supabase Storage (arquivo nunca passa no Express)
//   3. head(bucket, path)          → confirma chegada do arquivo
//
// VARIÁVEIS DE AMBIENTE OBRIGATÓRIAS:
//   SUPABASE_URL — URL do projeto (ex: https://xxxxx.supabase.co)
//
// DEPENDÊNCIA: instância supabase-js com service_role key (SupabaseClient.js)
// =============================================================

class SupabaseStorageClient {

  static BUCKET_IMAGES = 'media-images';

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /** @type {string} — URL base do Supabase (sem barra final) */
  #supabaseUrl;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.#supabase    = supabase;
    this.#supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');

    if (!this.#supabaseUrl) {
      throw new Error('[SupabaseStorageClient] SUPABASE_URL é obrigatório no .env');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Upload P2P (presigned URL)
  // ══════════════════════════════════════════════════════════════

  /**
   * Gera URL assinada de upload direto ao Supabase Storage.
   * O browser faz PUT diretamente com esta URL — o arquivo nunca passa
   * pelo servidor Express.
   *
   * @param {string} bucket — nome do bucket (ex: SupabaseStorageClient.BUCKET_IMAGES)
   * @param {string} path   — chave no bucket (ex: 'avatars/uuid/uuid.webp')
   * @returns {Promise<string>} — URL assinada de upload
   * @throws {Error{status:500}} se a API do Supabase retornar erro
   */
  async presignedPut(bucket, path) {
    const { data, error } = await this.#supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      throw Object.assign(
        new Error(`[SupabaseStorage] presignedPut falhou: ${error.message}`),
        { status: 500 }
      );
    }

    return data.signedUrl;
  }

  // ══════════════════════════════════════════════════════════════
  // Verificação de existência
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se um arquivo existe no bucket e retorna metadados básicos.
   * Usado por confirmarUpload() para validar que o upload P2P ocorreu.
   *
   * Supabase Storage não possui HEAD nativo — lista a pasta e filtra pelo nome.
   *
   * @param {string} bucket
   * @param {string} path — caminho completo (ex: 'avatars/uuid/uuid.webp')
   * @returns {Promise<{tamanhoBytes: number, contentType: string} | null>}
   */
  async head(bucket, path) {
    const partes   = path.split('/');
    const filename = partes.pop();
    const folder   = partes.join('/');

    const { data, error } = await this.#supabase.storage
      .from(bucket)
      .list(folder, { search: filename });

    if (error || !data?.length) return null;

    const arquivo = data.find(f => f.name === filename);
    if (!arquivo) return null;

    return {
      tamanhoBytes: arquivo.metadata?.size     ?? 0,
      contentType:  arquivo.metadata?.mimetype ?? '',
    };
  }

  // ══════════════════════════════════════════════════════════════
  // URL pública
  // ══════════════════════════════════════════════════════════════

  /**
   * Retorna a URL pública de um arquivo em um bucket público.
   * Adequado para avatars e imagens de serviços (sem autenticação).
   *
   * @param {string} bucket
   * @param {string} path
   * @returns {string}
   */
  publicUrl(bucket, path) {
    return `${this.#supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  // ══════════════════════════════════════════════════════════════
  // Deleção
  // ══════════════════════════════════════════════════════════════

  /**
   * Remove um arquivo do bucket.
   * Silencia erros de "não encontrado" (operação idempotente).
   *
   * @param {string} bucket
   * @param {string} path
   * @returns {Promise<void>}
   * @throws {Error{status:500}} em erros de storage não relacionados a 404
   */
  async delete(bucket, path) {
    const { error } = await this.#supabase.storage
      .from(bucket)
      .remove([path]);

    if (error && !error.message?.includes('not found')) {
      throw Object.assign(
        new Error(`[SupabaseStorage] delete falhou: ${error.message}`),
        { status: 500 }
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Upload server-side (buffer direto — sem P2P)
  // ══════════════════════════════════════════════════════════════

  /**
   * Faz upload de um Buffer diretamente do servidor para o bucket.
   * Usado após processamento server-side (ex: ImageProcessor).
   * Para uploads P2P (browser → storage), use presignedPut().
   *
   * Usa `upsert: true` para permitir substituição de arquivos existentes
   * sem erro (ex: atualização de avatar).
   *
   * @param {string} bucket
   * @param {string} path        — chave no bucket (ex: 'avatars/uid/uuid.webp')
   * @param {Buffer} buffer      — conteúdo do arquivo
   * @param {string} contentType — MIME type (ex: 'image/webp')
   * @returns {Promise<void>}
   * @throws {Error{status:500}} em caso de falha de storage
   */
  async upload(bucket, path, buffer, contentType) {
    const { error } = await this.#supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      throw Object.assign(
        new Error(`[SupabaseStorage] upload falhou: ${error.message}`),
        { status: 500 }
      );
    }
  }
}

module.exports = SupabaseStorageClient;
