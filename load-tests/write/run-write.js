'use strict';

const {
  WriteLoadTestConfig,
  WriteLoadTestHarness,
  WriteLoadTestReportWriter,
} = require('./WriteLoadTestHarness');

class WriteLoadTestRunCli {
  static async main() {
    const config = new WriteLoadTestConfig();
    const harness = new WriteLoadTestHarness({ config });
    const report = await harness.runForDuration();
    const outputPath = WriteLoadTestReportWriter.write({ config, report, suffix: 'smoke-write' });
    console.log(JSON.stringify({
      action: report.action,
      status: report.status,
      writesPerformed: report.writesPerformed,
      duration: report.duration,
      vus: report.vus,
      outputPath,
    }, null, 2));
  }
}

WriteLoadTestRunCli.main().catch((err) => {
  console.error(`[load-test-write:run] ${err?.message ?? err}`);
  process.exit(1);
});
