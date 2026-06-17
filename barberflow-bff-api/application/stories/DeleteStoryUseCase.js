'use strict';

const AppError = require('../../utils/AppError');
const { StoryR2PathValidator } = require('./StoryR2PathValidator');

/**
 * DeleteStoryUseCase — exclusão manual de story com limpeza do storage.
 *
 * Fluxo:
 *  1. Valida ownership (403 se não for dono)
 *  2. Coleta paths de R2 (source + variantes) OU detecta legado Supabase Storage
 *  3. Marca media_file como pendente de limpeza (atômico via RPC)
 *  4. Tenta deletar objetos do storage (R2 ou Supabase, concorrência 5)
 *  5. Se R2 ok: hard-delete do media_file (CASCADE media_variants)
 *     Se falhou: media_file fica com cleanup_status='pending' para retry
 *  6. Deleta o story row (desaparece do feed imediatamente, independente do R2)
 *
 * Resposta sempre 200 quando story removido do feed:
 *   { storyRemoved: true, storageDeletionPending: boolean }
 *
 * Camada: application
 */
class DeleteStoryUseCase {
  #storyRepository;
  #mediaRepository;
  #r2Gateway;
  #supabaseStorageGateway;

  constructor({ storyRepository, mediaRepository, r2Gateway, supabaseStorageGateway }) {
    if (!storyRepository)          throw new TypeError('DeleteStoryUseCase requer storyRepository.');
    if (!mediaRepository)          throw new TypeError('DeleteStoryUseCase requer mediaRepository.');
    if (!r2Gateway)                throw new TypeError('DeleteStoryUseCase requer r2Gateway.');
    if (!supabaseStorageGateway)   throw new TypeError('DeleteStoryUseCase requer supabaseStorageGateway.');
    this.#storyRepository         = storyRepository;
    this.#mediaRepository         = mediaRepository;
    this.#r2Gateway               = r2Gateway;
    this.#supabaseStorageGateway  = supabaseStorageGateway;
  }

  /**
   * @param {{ storyId: string, ownerId: string, barbershopId: string }} params
   * @returns {Promise<{ storyRemoved: boolean, storageDeletionPending: boolean }>}
   */
  async execute({ storyId, ownerId, barbershopId }) {
    const story = await this.#storyRepository.buscarStoryPorIdEOwner(storyId, ownerId, barbershopId);
    if (!story) throw AppError.forbidden('Story não encontrado ou sem permissão para excluir.');

    let storageDeletionPending = false;

    if (story.media_id) {
      storageDeletionPending = await this.#limparR2(story);
    } else if (story.storage_path) {
      await this.#limparSupabaseStorage(story.storage_path);
    }

    await this.#storyRepository.excluirStoryPorId(storyId);
    return { storyRemoved: true, storageDeletionPending };
  }

  async #limparR2(story) {
    const outrasRefs = await this.#storyRepository.contarOutrasReferencias(story.media_id, story.id);
    if (outrasRefs > 0) {
      // media_file compartilhado — não deletar o file, apenas o story row
      return false;
    }

    const variants = await this.#mediaRepository.listarVariantesPorMediaId(story.media_id);
    const paths = DeleteStoryUseCase.#coletarPaths(story, variants);

    await this.#mediaRepository.marcarComoPendenteLimpeza(story.media_id);

    const erros = await DeleteStoryUseCase.#deletarEmLotes(paths, this.#r2Gateway, 5);

    if (erros.length === 0) {
      await this.#mediaRepository.excluirPorId(story.media_id);
      return false;
    }

    const msgErro = erros.map(e => e.reason ?? String(e)).join('; ');
    await this.#mediaRepository.marcarCleanupFalhou(story.media_id, msgErro);
    return true;
  }

  async #limparSupabaseStorage(storagePath) {
    try {
      await this.#supabaseStorageGateway.deleteObject(storagePath);
    } catch {
      // best-effort — legado; não bloquear exclusão do story
    }
  }

  static #coletarPaths(story, variants) {
    const paths = [];
    const sourcePath = story.media_files?.path ?? null;
    if (sourcePath) {
      try { paths.push(StoryR2PathValidator.validar(sourcePath)); } catch { /* ignora path inválido */ }
    }
    for (const v of variants) {
      try { paths.push(StoryR2PathValidator.validar(v.storage_path)); } catch { /* ignora */ }
    }
    return paths;
  }

  static async #deletarEmLotes(paths, r2Gateway, concurrency) {
    const erros = [];
    for (let i = 0; i < paths.length; i += concurrency) {
      const chunk = paths.slice(i, i + concurrency);
      const settled = await Promise.allSettled(chunk.map(p => r2Gateway.deleteObject(p)));
      for (const result of settled) {
        if (result.status === 'rejected') erros.push(result.reason?.message ?? result.reason);
      }
    }
    return erros;
  }
}

module.exports = { DeleteStoryUseCase };
