'use strict';

class RlsTestsCli {
  static run() {
    console.log('RLS tests hook ready. Add db/rls/*.test.sql in the next RLS prompt.');
    return 0;
  }
}

if (require.main === module) process.exitCode = RlsTestsCli.run();

module.exports = RlsTestsCli;
