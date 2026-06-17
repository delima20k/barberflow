'use strict';

const { StoryR2PathValidator } = require('./StoryR2PathValidator');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_CLEANUP_ATTEMPTS  = 5;
const DEFAULT_BATCH_SIZE    = 50;
const DEFAULT_MARGEM_MIN    = 5;
const R2_CONCURRENCY        = 5;

/**
 * PurgeExpiredStoriesUseCase — limpeza automática de stories expirados e órfãos R2.
 *
 * FASE A: Stories expirados com media_id (R2)
 * FASE B: Stories expirados sem media_id (Supabase Storage legado)
 * FASE C: DELETE dos story rows
 * FASE D: Retry de media_files com cleanup_status='pending'
 * FASE E: Scan de órfãos verdadeiros no R2 (opcional)
 *
 * Modo dryRun=true: COMPLETAMENTE somente leitura — sem writes no DB, sem deletes no R2.
 *
 * Camada: application
 */
class PurgeExpiredStoriesUseCase {
  #storyRepository;
  #mediaRepository;
  #r2Gateway;
  #supabaseStorageGateway;
  #batchSize;
  #margemMinutos;

  constructor({ storyRepository, mediaRepository, r2Gateway, supabaseStorageGateway, batchSize, margemMinutos }) {
    if (!storyRepository)        throw new TypeError('PurgeExpiredStoriesUseCase requer storyRepository.');
    if (!mediaRepository)        throw new TypeError('PurgeExpiredStoriesUseCase requer mediaRepository.');
    if (!r2Gateway)              throw new TypeError('PurgeExpiredStoriesUseCase requer r2Gateway.');
    if (!supabaseStorageGateway) throw new TypeError('PurgeExpiredStoriesUseCase requer supabaseStorageGateway.');
    this.#storyRepository        = storyRepository;
    this.#mediaRepository        = mediaRepository;
    this.#r2Gateway              = r2Gateway;
    this.#supabaseStorageGateway = supabaseStorageGateway;
    this.#batchSize              = batchSize    ?? DEFAULT_BATCH_SIZE;
    this.#margemMinutos          = margemMinutos ?? DEFAULT_MARGEM_MIN;
  }

  /**
   * @param {{ dryRun?: boolean, includeR2Scan?: boolean }} opts
   * @returns {Promise<object>} relatório detalhado
   */
  async execute({ dryRun = false, includeR2Scan = false } = {}) {
    const relatorio = PurgeExpiredStoriesUseCase.#relatorioVazio(dryRun);
    const storyIdsParaDeletar = [];

    await this.#faseA(dryRun, storyIdsParaDeletar, relatorio);
    await this.#faseB(dryRun, storyIdsParaDeletar, relatorio);

    if (!dryRun && storyIdsParaDeletar.length > 0) {
      await this.#storyRepository.excluirStoriesPorIds(storyIdsParaDeletar);
      relatorio.storiesDeleted = storyIdsParaDeletar.length;
    }

    await this.#faseD(dryRun, relatorio);

    if (includeR2Scan) {
      await this.#faseE(dryRun, relatorio);
    }

    return relatorio;
  }

  // ── FASE A: stories R2 expirados ──────────────────────────────

  async #faseA(dryRun, storyIds, relatorio) {
    const stories = await this.#storyRepository.listarStoriesExpirados(
      this.#batchSize, this.#margemMinutos, false
    );
    relatorio.storiesExpiredFound = stories.length;

    for (const story of stories) {
      const outrasRefs = await this.#storyRepository.contarOutrasReferencias(story.media_id, story.id);
      if (outrasRefs > 0) {
        relatorio.skipped.push({ storyId: story.id, reason: 'media_compartilhado' });
        storyIds.push(story.id);
        continue;
      }

      const variants = await this.#mediaRepository.listarVariantesPorMediaId(story.media_id);
      const paths = PurgeExpiredStoriesUseCase.#coletarPaths(story, variants, relatorio);
      relatorio.r2ObjectsReferenced += paths.length;

      if (dryRun) {
        relatorio.r2ObjectsWouldDelete += paths.length;
        storyIds.push(story.id);
        continue;
      }

      await this.#mediaRepository.marcarComoPendenteLimpeza(story.media_id);
      const erros = await PurgeExpiredStoriesUseCase.#deletarEmLotes(paths, this.#r2Gateway);
      relatorio.r2ObjectsDeleted += (paths.length - erros.length);

      if (erros.length === 0) {
        await this.#mediaRepository.excluirPorId(story.media_id);
      } else {
        await this.#mediaRepository.marcarCleanupFalhou(story.media_id, erros.join('; '));
        relatorio.pendingCount++;
        relatorio.errors.push(...erros.map(e => ({ phase: 'A', error: e })));
      }
      storyIds.push(story.id);
    }
  }

  // ── FASE B: stories Supabase Storage legados expirados ────────

  async #faseB(dryRun, storyIds, relatorio) {
    const legados = await this.#storyRepository.listarStoriesExpirados(
      this.#batchSize, this.#margemMinutos, true
    );
    relatorio.storiesLegacyFound = legados.length;

    for (const story of legados) {
      if (!dryRun && story.storage_path) {
        try {
          await this.#supabaseStorageGateway.deleteObject(story.storage_path);
        } catch (err) {
          relatorio.errors.push({ phase: 'B', error: String(err?.message ?? err) });
        }
      }
      relatorio.legacyStorageCount++;
      storyIds.push(story.id);
    }
  }

  // ── FASE D: retry de media_files pendentes ────────────────────

  async #faseD(dryRun, relatorio) {
    const pendentes = await this.#mediaRepository.listarPendentesLimpeza(
      this.#batchSize, MAX_CLEANUP_ATTEMPTS
    );
    relatorio.orphansPending = pendentes.length;

    for (const media of pendentes) {
      // Não deletar se ainda há story ativa referenciando
      const count = await this.#contarStoriesAtivos(media.id);
      if (count > 0) {
        relatorio.skipped.push({ mediaId: media.id, reason: 'story_ativo_referencia' });
        continue;
      }

      if (dryRun) {
        relatorio.orphansRetried++;
        continue;
      }

      await this.#mediaRepository.marcarComoPendenteLimpeza(media.id);
      const variants = await this.#mediaRepository.listarVariantesPorMediaId(media.id);
      const paths = PurgeExpiredStoriesUseCase.#coletarPathsOrfao(media, variants, relatorio);
      const erros = await PurgeExpiredStoriesUseCase.#deletarEmLotes(paths, this.#r2Gateway);

      relatorio.orphansRetried++;
      if (erros.length === 0) {
        await this.#mediaRepository.excluirPorId(media.id);
        relatorio.orphansCleared++;
      } else {
        await this.#mediaRepository.marcarCleanupFalhou(media.id, erros.join('; '));
        relatorio.errors.push(...erros.map(e => ({ phase: 'D', error: e })));
      }
    }
  }

  // ── FASE E: scan de órfãos verdadeiros no R2 ─────────────────

  async #faseE(dryRun, relatorio) {
    const prefix = StoryR2PathValidator.ALLOWED_PREFIX;
    const cutoffDate = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
    const mediaIdsVerificados = new Map(); // cache para evitar queries duplicadas

    for await (const pagina of this.#r2Gateway.listObjectsByPrefixPaginated(prefix, 200)) {
      for (const obj of pagina) {
        relatorio.estimatedSizeBytes += obj.sizeBytes ?? 0;
        const mediaId = StoryR2PathValidator.extrairMediaId(obj.key);
        if (!mediaId) {
          relatorio.skipped.push({ key: obj.key, reason: 'key_format_invalida' });
          continue;
        }
        if (obj.lastModified && new Date(obj.lastModified) > cutoffDate) {
          continue; // novo demais para ser órfão
        }
        if (!mediaIdsVerificados.has(mediaId)) {
          const existe = await this.#mediaRepository.existePorId(mediaId);
          mediaIdsVerificados.set(mediaId, existe);
        }
        if (!mediaIdsVerificados.get(mediaId)) {
          relatorio.r2TrueOrphansFound++;
          if (!dryRun) {
            try {
              await this.#r2Gateway.deleteObject(obj.key);
              relatorio.r2TrueOrphansDeleted++;
            } catch (err) {
              relatorio.errors.push({ phase: 'E', key: obj.key, error: String(err?.message ?? err) });
            }
          }
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  async #contarStoriesAtivos(mediaId) {
    // Reutiliza contarOutrasReferencias com storyId fictício (conta TODOS)
    return this.#storyRepository.contarOutrasReferencias(mediaId, '00000000-0000-0000-0000-000000000000');
  }

  static #coletarPaths(story, variants, relatorio) {
    const paths = [];
    const sourcePath = story.media_files?.path ?? null;
    if (sourcePath) {
      try { paths.push(StoryR2PathValidator.validar(sourcePath)); }
      catch (err) { relatorio.skipped.push({ key: sourcePath, reason: err.message }); }
    }
    for (const v of variants) {
      try { paths.push(StoryR2PathValidator.validar(v.storage_path)); }
      catch (err) { relatorio.skipped.push({ key: v.storage_path, reason: err.message }); }
    }
    return paths;
  }

  static #coletarPathsOrfao(media, variants, relatorio) {
    const paths = [];
    if (media.path) {
      try { paths.push(StoryR2PathValidator.validar(media.path)); }
      catch (err) { relatorio.skipped.push({ key: media.path, reason: err.message }); }
    }
    for (const v of variants) {
      try { paths.push(StoryR2PathValidator.validar(v.storage_path)); }
      catch (err) { relatorio.skipped.push({ key: v.storage_path, reason: err.message }); }
    }
    return paths;
  }

  static async #deletarEmLotes(paths, r2Gateway) {
    const erros = [];
    for (let i = 0; i < paths.length; i += R2_CONCURRENCY) {
      const chunk = paths.slice(i, i + R2_CONCURRENCY);
      const settled = await Promise.allSettled(chunk.map(p => r2Gateway.deleteObject(p)));
      for (const result of settled) {
        if (result.status === 'rejected') {
          erros.push(result.reason?.message ?? String(result.reason));
        }
      }
    }
    return erros;
  }

  static #relatorioVazio(dryRun) {
    return {
      dryRun,
      storiesExpiredFound:    0,
      storiesLegacyFound:     0,
      r2ObjectsReferenced:    0,
      r2ObjectsWouldDelete:   0,
      r2ObjectsDeleted:       0,
      r2TrueOrphansFound:     0,
      r2TrueOrphansDeleted:   0,
      orphansPending:         0,
      orphansRetried:         0,
      orphansCleared:         0,
      legacyStorageCount:     0,
      storiesDeleted:         0,
      pendingCount:           0,
      estimatedSizeBytes:     0,
      errors:                 [],
      skipped:                [],
    };
  }
}

module.exports = { PurgeExpiredStoriesUseCase };
