export class SectionEventCatalog {
  static AGENDA_READY = 'minha-barbearia.agenda.ready';
  static SETTINGS_CHANGED = 'minha-barbearia.settings.changed';
  static STORY_CHANGED = 'minha-barbearia.story.changed';
  static PORTFOLIO_CHANGED = 'minha-barbearia.portfolio.changed';
  static NOTIFICATION_CHANGED = 'minha-barbearia.notification.changed';
  static QUEUE_CHANGED = 'minha-barbearia.queue.changed';
  static QUEUE_REALTIME_CHANGED = 'minha-barbearia.queue.realtime.changed';

  static #EVENTS = new Set([
    SectionEventCatalog.AGENDA_READY,
    SectionEventCatalog.SETTINGS_CHANGED,
    SectionEventCatalog.STORY_CHANGED,
    SectionEventCatalog.PORTFOLIO_CHANGED,
    SectionEventCatalog.NOTIFICATION_CHANGED,
    SectionEventCatalog.QUEUE_CHANGED,
    SectionEventCatalog.QUEUE_REALTIME_CHANGED,
  ]);

  static has(eventName) {
    return SectionEventCatalog.#EVENTS.has(eventName);
  }
}
