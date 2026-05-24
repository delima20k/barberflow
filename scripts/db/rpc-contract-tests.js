'use strict';

const RpcContractTestRunner = require('./RpcContractTestRunner');

class RpcContractCli {
  static async run() {
    const runner = new RpcContractTestRunner(process.cwd());
    const result = await runner.runAll();
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
}

if (require.main === module) {
  RpcContractCli.run().then(code => { process.exitCode = code; });
}

module.exports = RpcContractCli;
