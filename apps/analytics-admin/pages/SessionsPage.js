'use strict';

class SessionsPage {
  #root;
  #sessions = [];
  #selected = null;
  #table;
  #timeline;
  #export;

  constructor(root, exportService) {
    this.#root = root;
    this.#export = exportService;
    this.#table = new globalThis.SessionTable(
      root.querySelector('[data-sessions-table]'),
      (session) => this.select(session),
    );
    this.#timeline = new globalThis.SessionTimeline(root.querySelector('[data-session-timeline]'));
    root.querySelector('[data-export-csv]').addEventListener('click', () => {
      this.#export.csv(this.#exportRows());
    });
    root.querySelector('[data-export-excel]').addEventListener('click', () => {
      this.#export.excel(this.#exportRows());
    });
  }

  setData(sessions) {
    this.#sessions = sessions;
    this.#selected = sessions[0] ?? null;
    this.render();
  }

  select(session) {
    this.#selected = session;
    this.render();
    this.#root.querySelector('[data-session-timeline]')?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
    });
  }

  render() {
    this.#table.render(this.#sessions, this.#selected?.sessionId);
    this.#timeline.render(this.#selected);
  }

  #exportRows() {
    return this.#sessions.map((session) => ({
      session_id: session.sessionId,
      visitor_id: session.visitorId,
      inicio: session.startedAt,
      origem: session.source,
      campanha: session.campaign,
      dispositivo: session.device,
      eventos: session.events.length,
      duracao_segundos: session.durationSeconds,
      status: session.status,
    }));
  }
}

globalThis.SessionsPage = SessionsPage;
