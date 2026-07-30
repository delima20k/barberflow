'use strict';

class MockAnalyticsDataSource {
  #events;
  #sessions;

  constructor(now = new Date()) {
    const minute = 60 * 1000;
    const at = (offset) => new Date(now.getTime() - offset * minute).toISOString();
    const paths = [
      ['session_started', 'landing_view', 'scroll_25', 'scroll_50', 'cta_click'],
      [
        'session_started',
        'landing_view',
        'scroll_25',
        'scroll_50',
        'scroll_75',
        'cta_click',
        'voucher_modal_opened',
        'email_input_started',
        'email_submitted',
        'voucher_generated',
      ],
      [
        'session_started',
        'landing_view',
        'scroll_25',
        'scroll_50',
        'scroll_75',
        'scroll_100',
        'cta_click',
        'voucher_modal_opened',
        'email_input_started',
        'email_submitted',
        'voucher_generated',
        'account_created',
        'email_confirmed',
        'first_login',
        'session_ended',
      ],
      ['session_started', 'landing_view', 'scroll_25', 'session_ended'],
      [
        'session_started',
        'landing_view',
        'scroll_25',
        'cta_click',
        'voucher_modal_opened',
        'email_input_started',
      ],
    ];

    this.#sessions = paths.map((events, sessionIndex) => {
      const sessionId = `demo-session-${sessionIndex + 1}`;
      const startedAt = at(52 - sessionIndex * 9);
      const timeline = events.map((eventName, eventIndex) => ({
        id: `${sessionId}-${eventIndex + 1}`,
        sessionId,
        visitorId: `demo-visitor-${sessionIndex + 1}`,
        eventName,
        eventDescription: globalThis.AnalyticsEventCatalog?.label?.(eventName) ?? eventName,
        campaign: sessionIndex % 2 === 0 ? 'primeiro-mes-gratis' : 'organico',
        source: ['instagram', 'facebook', 'direct', 'google', 'organic'][sessionIndex],
        device: ['mobile', 'desktop', 'mobile', 'tablet', 'desktop'][sessionIndex],
        createdAt: at(52 - sessionIndex * 9 - eventIndex),
      }));
      return {
        sessionId,
        visitorId: `demo-visitor-${sessionIndex + 1}`,
        startedAt,
        lastActivityAt: timeline.at(-1).createdAt,
        endedAt: events.includes('session_ended') ? timeline.at(-1).createdAt : null,
        durationSeconds: Math.max(30, (timeline.length - 1) * 60),
        status: events.includes('session_ended') ? 'ended' : 'active',
        source: timeline[0].source,
        campaign: timeline[0].campaign,
        device: timeline[0].device,
        events: timeline,
      };
    });
    this.#events = this.#sessions.flatMap((session) => session.events);
  }

  events() {
    return this.#events.map((event) => ({ ...event }));
  }

  sessions() {
    return this.#sessions.map((session) => ({
      ...session,
      events: session.events.map((event) => ({ ...event })),
    }));
  }
}

globalThis.MockAnalyticsDataSource = MockAnalyticsDataSource;
