'use strict';

class SessionTimeline {
  #root;

  constructor(root) {
    this.#root = root;
  }

  render(session) {
    if (!session) {
      this.#root.replaceChildren();
      return;
    }

    const container = document.createElement('section');
    container.className = 'session-timeline';
    const heading = document.createElement('h3');
    heading.textContent = `Caminho da sessão ${session.sessionId}`;
    const list = document.createElement('ol');
    list.className = 'timeline-list';
    session.events.forEach((event) => {
      const item = document.createElement('li');
      const time = document.createElement('time');
      time.dateTime = event.createdAt;
      time.textContent = globalThis.Formatters.time(event.createdAt);
      const copy = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = globalThis.AnalyticsEventCatalog.label(event.eventName);
      const source = document.createElement('span');
      source.textContent = event.eventName;
      copy.append(label, source);
      item.append(time, copy);
      list.append(item);
    });
    container.append(heading, list);
    this.#root.replaceChildren(container);
  }
}

globalThis.SessionTimeline = SessionTimeline;
