'use strict';

const {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestReportWriter,
} = require('./WriteLoadTestHarness');

class WriteLoadTestSetupCli {
  static async main() {
    const config = new WriteLoadTestConfig();
    const harness = new WriteLoadTestHarness({ config });
    const report = await harness.setup();
    const outputPath = WriteLoadTestReportWriter.write({ config, report, suffix: 'setup' });
    console.log(JSON.stringify({ action: report.action, status: report.status, outputPath }, null, 2));
  }
}

WriteLoadTestSetupCli.main().catch((err) => {
  console.error(`[load-test-write:setup] ${err?.message ?? err}`);
  process.exit(1);
});
