'use strict';

class MetricsService {
  static #FUNNEL = Object.freeze([
    ['landing_view', 'Landing'],
    ['scroll_50', 'Scroll'],
    ['cta_click', 'Clique CTA'],
    ['voucher_modal_opened', 'Modal Voucher'],
    ['email_input_started', 'Email digitado'],
    ['email_submitted', 'Email enviado'],
    ['account_created', 'Cadastro'],
    ['email_confirmed', 'Email confirmado'],
    ['first_login', 'Primeiro login'],
  ]);

  summarize(events, sessions, comparisonEvents = []) {
    const safeEvents = Array.isArray(events) ? events : [];
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const visitors = new Set(safeEvents.map((event) => event.visitorId));
    const count = (eventName) => safeEvents
      .filter((event) => event.eventName === eventName).length;
    const ended = safeSessions.filter((session) => session.status === 'ended');
    const totalDuration = safeSessions.reduce(
      (sum, session) => sum + (Number(session.durationSeconds) || 0),
      0,
    );
    const firstLogins = count('first_login');

    return Object.freeze({
      visitorsOnline: safeSessions.filter((session) => session.status === 'active').length,
      visitorsToday: visitors.size,
      visitorsYesterday: new Set(
        (Array.isArray(comparisonEvents) ? comparisonEvents : [])
          .map((event) => event.visitorId),
      ).size,
      activeSessions: safeSessions.filter((session) => session.status === 'active').length,
      endedSessions: ended.length,
      averageTimeSeconds: safeSessions.length ? totalDuration / safeSessions.length : 0,
      conversionRate: visitors.size ? (firstLogins / visitors.size) * 100 : 0,
      ctaClicks: count('cta_click'),
      emailStarted: count('email_input_started'),
      emailSubmitted: count('email_submitted'),
      registrations: count('account_created'),
      emailConfirmed: count('email_confirmed'),
      firstLogins,
    });
  }

  funnel(events) {
    const safeEvents = Array.isArray(events) ? events : [];
    const visitorsByEvent = new Map();
    safeEvents.forEach((event) => {
      if (!visitorsByEvent.has(event.eventName)) {
        visitorsByEvent.set(event.eventName, new Set());
      }
      visitorsByEvent.get(event.eventName).add(event.visitorId);
    });

    let previous = null;
    return MetricsService.#FUNNEL.map(([eventName, label]) => {
      const count = visitorsByEvent.get(eventName)?.size ?? 0;
      const conversion = previous === null
        ? 100
        : previous > 0
          ? (count / previous) * 100
          : 0;
      previous = count;
      return Object.freeze({ eventName, label, count, conversion });
    });
  }

  filter(events, filters = {}) {
    return (Array.isArray(events) ? events : []).filter((event) => {
      const sourceMatches = !filters.source || filters.source === 'all'
        || event.source === filters.source;
      const campaignMatches = !filters.campaign || filters.campaign === 'all'
        || event.campaign === filters.campaign;
      const dateMatches = !filters.range
        || globalThis.DateRange?.contains?.(event.createdAt, filters.range);
      return sourceMatches && campaignMatches && dateMatches;
    });
  }

  filterSessions(sessions, filters = {}) {
    return (Array.isArray(sessions) ? sessions : []).filter((session) => {
      const sourceMatches = !filters.source || filters.source === 'all'
        || session.source === filters.source;
      const campaignMatches = !filters.campaign || filters.campaign === 'all'
        || session.campaign === filters.campaign;
      const dateMatches = !filters.range
        || globalThis.DateRange?.contains?.(session.startedAt, filters.range);
      return sourceMatches && campaignMatches && dateMatches;
    });
  }
}

globalThis.MetricsService = MetricsService;
