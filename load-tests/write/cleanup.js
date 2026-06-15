'use strict';

const fs = require('node:fs');
const {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestReportWriter,
} = require('./WriteLoadTestHarness');

class WriteLoadTestCleanupCli {
  static async main() {
    const config = new WriteLoadTestConfig();
    const resources = WriteLoadTestCleanupCli.#readResources(process.argv.slice(2));
    const harness = new WriteLoadTestHarness({ config });
    const report = await harness.cleanup(resources, { realCleanup: config.cleanupEnabled });
    const outputPath = WriteLoadTestReportWriter.write({ config, report, suffix: 'cleanup' });
    console.log(JSON.stringify({
      action: report.action,
      mode: report.mode,
      status: report.status,
      writesPerformed: report.writesPerformed,
      outputPath,
    }, null, 2));
  }

  static #readResources(args) {
    const arg = args.find(item => item.startsWith('--resources='));
    if (!arg) return {};
    const filename = arg.slice('--resources='.length);
    const raw = fs.readFileSync(filename, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.created ?? parsed.targets ?? parsed;
  }
}

WriteLoadTestCleanupCli.main().catch((err) => {
  console.error(`[load-test-write:cleanup] ${err?.message ?? err}`);
  process.exit(1);
});
