'use strict';

const { PushProvider } = require('../../domain/notifications/ports/PushProvider');

class SandboxPushProviderAdapter extends PushProvider {
  constructor({ failEndpoints = new Set() } = {}) {
    super();
    this.sent = [];
    this.failEndpoints = failEndpoints;
  }

  get name() { return 'sandbox'; }

  async send(cmd) {
    const endpoint = cmd.endpoint ?? `sandbox:${cmd.userId}`;
    if (this.failEndpoints.has(endpoint)) {
      return { ok: false, permanentFailure: true, endpoint, error: 'sandbox permanent failure' };
    }
    const providerMessageId = `sandbox-${this.sent.length + 1}`;
    this.sent.push({ ...cmd, endpoint, providerMessageId });
    return { ok: true, providerMessageId, endpoint };
  }
}

module.exports = { SandboxPushProviderAdapter };
