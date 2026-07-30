'use strict';

class SessionTable {
  #root;
  #onSelect;

  constructor(root, onSelect) {
    this.#root = root;
    this.#onSelect = onSelect;
  }

  render(sessions, selectedId = null) {
    if (!sessions.length) {
      this.#root.innerHTML = '<div class="empty-state">Nenhuma sessão encontrada para os filtros selecionados.</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    const table = document.createElement('table');
    table.className = 'session-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Sessão</th>
          <th>Início</th>
          <th>Origem</th>
          <th>Dispositivo</th>
          <th>Eventos</th>
          <th>Duração</th>
          <th>Status</th>
        </tr>
      </thead>
    `;
    const body = document.createElement('tbody');
    sessions.forEach((session) => {
      const row = document.createElement('tr');
      row.tabIndex = 0;
      row.classList.toggle('is-selected', selectedId === session.sessionId);
      row.setAttribute('aria-label', `Abrir detalhes da sessão ${session.sessionId}`);
      const values = [
        session.sessionId,
        globalThis.Formatters.dateTime(session.startedAt),
        session.source,
        session.device,
        String(session.events.length),
        globalThis.Formatters.duration(session.durationSeconds),
      ];
      values.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      const statusCell = document.createElement('td');
      const status = document.createElement('span');
      status.className = `status status--${session.status}`;
      status.textContent = session.status === 'active' ? 'Ativa' : 'Encerrada';
      statusCell.append(status);
      row.append(statusCell);
      const select = () => this.#onSelect?.(session);
      row.addEventListener('click', select);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
      body.append(row);
    });
    table.append(body);
    wrapper.append(table);
    this.#root.replaceChildren(wrapper);
  }
}

globalThis.SessionTable = SessionTable;
