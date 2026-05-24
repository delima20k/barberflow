'use strict';

const { spawnSync } = require('node:child_process');

class DbTestsCli {
  static run() {
    const commands = [
      ['node', ['scripts/db/schema-snapshot.js', 'check']],
      ['node', ['scripts/db/rpc-coverage.js', '--strict-new']],
      ['node', ['scripts/db/rpc-contract-tests.js']],
      ['node', ['scripts/db/rls-tests.js']],
    ];

    for (const [cmd, args] of commands) {
      const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
      if (result.status !== 0) return result.status ?? 1;
    }

    return 0;
  }
}

if (require.main === module) process.exitCode = DbTestsCli.run();

module.exports = DbTestsCli;
