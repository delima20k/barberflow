'use strict';

const LoadTestRunner = require('./lib/LoadTestRunner');

async function main() {
  const runner = new LoadTestRunner();
  const { summary, outputPath } = await runner.run();
  console.log(JSON.stringify({
    outputPath,
    vus: summary.vus,
    durationSeconds: summary.durationSeconds,
    totalRequests: summary.totalRequests,
    totalErrors: summary.totalErrors,
    errorRate: summary.errorRate,
    testDataPrefix: summary.testDataPrefix,
  }, null, 2));
}

main().catch((err) => {
  console.error(`[load-test] ${err?.message ?? err}`);
  process.exit(1);
});
