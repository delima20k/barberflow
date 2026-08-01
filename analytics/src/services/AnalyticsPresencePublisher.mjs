export class AnalyticsPresencePublisher {
  constructor({ client, enabled = false }) {
    this.client = client;
    this.enabled = enabled;
    this.channel = null;
  }

  async track() {
    if (!this.enabled || !this.client) return false;
    this.channel = this.client.channel('analytics-presence');
    await this.channel.subscribe();
    await this.channel.track({ active: true });
    return true;
  }

  async destroy() {
    if (this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
  }
}
