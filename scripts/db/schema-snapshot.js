'use strict';

const fs = require('node:fs');
const path = require('node:path');
const SchemaSnapshotService = require('./SchemaSnapshotService');

class SchemaSnapshotCli {
  static run(argv = process.argv.slice(2)) {
    const command = argv[0] ?? 'check';
    const service = new SchemaSnapshotService(process.cwd());

    if (command === 'generate') {
      const result = service.generate();
      console.log(`schema snapshot generated: ${result.hash} (${result.bytes} bytes)`);
      return 0;
    }

    if (command === 'hash') {
      console.log(service.hash(service.normalize(service.readSnapshot())));
      return 0;
    }

    if (command === 'check') {
      const result = service.check();
      if (result.ok) {
        console.log(`schema snapshot ok: ${result.expectedHash}`);
        return 0;
      }

      const reportPath = path.join(process.cwd(), 'db', 'snapshots', 'schema-diff.md');
      fs.writeFileSync(reportPath, result.diff.text, 'utf8');
      console.error(result.diff.text);
      console.error(`schema drift detected: expected ${result.expectedHash}, actual ${result.actualHash}`);
      return 1;
    }

    console.error('usage: node scripts/db/schema-snapshot.js <generate|check|hash>');
    return 2;
  }
}

if (require.main === module) process.exitCode = SchemaSnapshotCli.run();

module.exports = SchemaSnapshotCli;
