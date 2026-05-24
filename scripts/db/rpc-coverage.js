'use strict';

const RpcCoverageReporter = require('./RpcCoverageReporter');

class RpcCoverageCli {
  static run(argv = process.argv.slice(2)) {
    const reporter = new RpcCoverageReporter(process.cwd());
    const report = reporter.report();
    console.log(JSON.stringify(report, null, 2));

    if (argv.includes('--strict-new')) {
      const strict = reporter.assertNoNewRpcWithoutContract();
      if (!strict.ok) {
        console.error(`new RPCs without contract: ${strict.missing.join(', ')}`);
        return 1;
      }
    }

    return report.ok ? 0 : 1;
  }
}

if (require.main === module) process.exitCode = RpcCoverageCli.run();

module.exports = RpcCoverageCli;
