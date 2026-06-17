'use strict';

/**
 * StoryCleanupTask — wrapper da tarefa agendada para limpeza de Stories no R2.
 *
 * Executado pelo SchedulerService uma vez por hora.
 * Delega para PurgeExpiredStoriesUseCase com dryRun=false.
 * Inclui scan de órfãos R2 apenas se STORY_CLEANUP_INCLUDE_R2_SCAN=true.
 *
 * Camada: application/scheduler
 */
class StoryCleanupTask {
  #purgeUseCase;

  constructor({ purgeExpiredStoriesUseCase }) {
    if (!purgeExpiredStoriesUseCase) {
      throw new TypeError('StoryCleanupTask requer purgeExpiredStoriesUseCase.');
    }
    this.#purgeUseCase = purgeExpiredStoriesUseCase;
  }

  async execute() {
    const includeR2Scan = process.env.STORY_CLEANUP_INCLUDE_R2_SCAN === 'true';
    const relatorio = await this.#purgeUseCase.execute({ dryRun: false, includeR2Scan });
    /* eslint-disable no-console */
    console.info(
      `[StoryCleanupTask] stories=${relatorio.storiesDeleted}` +
      ` r2=${relatorio.r2ObjectsDeleted}` +
      ` orphans=${relatorio.orphansCleared}` +
      ` pendentes=${relatorio.pendingCount}` +
      ` erros=${relatorio.errors.length}`
    );
  }
}

module.exports = { StoryCleanupTask };
