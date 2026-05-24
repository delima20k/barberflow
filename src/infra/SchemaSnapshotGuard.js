'use strict';

const SchemaSnapshotService = require('../../scripts/db/SchemaSnapshotService');

class SchemaSnapshotGuard {
  static checkOnBoot({ logger = console, rootDir = process.cwd() } = {}) {
    if (process.env.DB_SCHEMA_VALIDATE_ON_BOOT !== 'true') return;

    const blockOnDrift = process.env.DB_SCHEMA_BLOCK_ON_DRIFT === 'true'
      || (process.env.APP_ENV === 'production' && process.env.DB_SCHEMA_BLOCK_ON_DRIFT !== 'false');
    const service = new SchemaSnapshotService(rootDir);

    Promise.resolve()
      .then(() => service.check())
      .then(result => {
        if (result.ok) {
          logger.info?.({ schemaHash: result.expectedHash }, 'Schema snapshot validado no boot');
          return;
        }

        logger.warn?.({
          expectedHash: result.expectedHash,
          actualHash: result.actualHash,
          diff: result.diff.text,
        }, 'Schema do banco diverge do snapshot versionado');

        if (blockOnDrift) {
          logger.error?.('Bloqueando boot por divergencia de schema');
          process.exit(1);
        }
      })
      .catch(err => {
        logger.warn?.({ err }, 'Nao foi possivel validar schema snapshot no boot');
        if (blockOnDrift) process.exit(1);
      });
  }
}

module.exports = SchemaSnapshotGuard;
