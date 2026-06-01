'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const { BaseUseCase }  = require('../../../application/shared/BaseUseCase');

class ConcreteUseCase extends BaseUseCase {
  async execute(cmd) { return cmd; }
}

describe('BaseUseCase', () => {
  it('executa subclasse concreta', async () => {
    const uc = new ConcreteUseCase();
    const result = await uc.execute('ok');
    assert.equal(result, 'ok');
  });

  it('lança se execute() não for implementado', async () => {
    const uc = new BaseUseCase();
    await assert.rejects(
      () => uc.execute({}),
      /execute\(\) não implementado/,
    );
  });
});
