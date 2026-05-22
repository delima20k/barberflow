'use strict';

class SectionEventCatalog {
  static AGENDA_READY = 'minha-barbearia.agenda.ready';

  static #EVENTS = new Set([
    SectionEventCatalog.AGENDA_READY,
  ]);

  static has(eventName) {
    return SectionEventCatalog.#EVENTS.has(eventName);
  }
}
