'use strict';

class AnalyticsRepository {
  #client;
  #demoSource;
  #config;

  constructor(
    client = null,
    demoSource = new globalThis.MockAnalyticsDataSource(),
    config = globalThis.AdminConfig,
  ) {
    this.#client = client;
    this.#demoSource = demoSource;
    this.#config = config;
  }

  async events() {
    if (this.#config?.isDemo?.()) return this.#demoSource.events();
    if (!this.#client) throw new Error('Supabase Analytics não configurado.');

    const { data, error } = await this.#client
      .schema('analytics')
      .from('analytics_events')
      .select(
        'id,session_id,visitor_id,event_name,event_description,campaign,source,device,created_at',
      )
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []).map(AnalyticsRepository.#normalizeEvent);
  }

  async sessions() {
    if (this.#config?.isDemo?.()) return this.#demoSource.sessions();
    if (!this.#client) throw new Error('Supabase Analytics não configurado.');

    const { data, error } = await this.#client.schema('analytics').rpc('get_analytics_sessions', {
      p_start: new Date(0).toISOString(),
      p_end: new Date().toISOString(),
      p_limit: this.#config.pageSize,
    });
    if (error) throw error;
    return (data ?? []).map(AnalyticsRepository.#normalizeSession);
  }

  static #normalizeEvent(event) {
    return {
      id: event.id,
      sessionId: event.session_id,
      visitorId: event.visitor_id,
      eventName: event.event_name,
      eventDescription: event.event_description,
      campaign: event.campaign,
      source: event.source,
      device: event.device,
      createdAt: event.created_at,
    };
  }

  static #normalizeSession(session) {
    return {
      sessionId: session.session_id,
      visitorId: session.visitor_id,
      startedAt: session.started_at,
      lastActivityAt: session.last_activity_at,
      endedAt: session.ended_at,
      durationSeconds: session.duration_seconds,
      status: session.status,
      source: session.source,
      campaign: session.campaign,
      device: session.device,
      events: (session.events ?? []).map(AnalyticsRepository.#normalizeEvent),
    };
  }
}

globalThis.AnalyticsRepository = AnalyticsRepository;
