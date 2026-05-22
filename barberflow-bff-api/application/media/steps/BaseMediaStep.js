'use strict';

/**
 * BaseMediaStep - contrato comum dos steps do pipeline.
 */
class BaseMediaStep {
  get name() {
    return this.constructor.name;
  }

  async handle() {
    throw new Error(`${this.name}: handle() deve ser implementado`);
  }

  _next(input, patch) {
    return {
      ...input,
      ...patch,
      metadata: { ...(input.metadata ?? {}), ...(patch.metadata ?? {}) },
      variants: patch.variants ?? [...(input.variants ?? [])],
    };
  }
}

module.exports = { BaseMediaStep };
