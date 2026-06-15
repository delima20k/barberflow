'use strict';

const {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestReportWriter,
} = require('./WriteLoadTestHarness');

class WriteLoadTestVerifyFixtureCli {
  static async main() {
    const config = new WriteLoadTestConfig();
    const harness = new WriteLoadTestHarness({ config });
    const report = await harness.verifyFixture();
    const outputPath = WriteLoadTestReportWriter.write({ config, report, suffix: 'verify-fixture' });
    console.log(JSON.stringify({ action: report.action, status: report.status, outputPath }, null, 2));
  }
}

WriteLoadTestVerifyFixtureCli.main().catch((err) => {
  console.error(`[load-test-write:verify-fixture] ${err?.message ?? err}`);
  process.exit(1);
});
