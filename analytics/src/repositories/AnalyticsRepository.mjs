export class AnalyticsRepository {
  constructor(client) { this.client = client.schema('analytics'); }

  async collect({ event, ipHash, origin, userAgent, country, ipLimit, sessionLimit }) {
    const { data, error } = await this.client.rpc('collect_analytics_event', {
      p_event: event,
      p_ip_hash: ipHash,
      p_origin: origin,
      p_user_agent: userAgent,
      p_country: country,
      p_ip_limit: ipLimit,
      p_session_limit: sessionLimit,
    });
    if (error) throw new Error('Analytics persistence failed');
    return data;
  }
}
