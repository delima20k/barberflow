const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260709000001_queue_position_web_push.sql',
);

function readMigration() {
  return fs.readFileSync(MIGRATION, 'utf8');
}

function entry(id, clientId, position) {
  return { id, clientId, position, status: 'waiting' };
}

class QueuePositionTriggerSimulator {
  static computeChanges(previousWaiting, currentWaiting) {
    const previous = QueuePositionTriggerSimulator.rank(previousWaiting);
    const current = QueuePositionTriggerSimulator.rank(currentWaiting);
    const changes = [];

    for (const currentEntry of current) {
      if (!currentEntry.clientId) continue;
      const previousEntry = previous.find(item =>
        item.id === currentEntry.id && item.clientId === currentEntry.clientId,
      );
      if (!previousEntry || previousEntry.position === currentEntry.position) continue;
      changes.push({
        entryId: currentEntry.id,
        clientId: currentEntry.clientId,
        position: currentEntry.position,
        previousPosition: previousEntry.position,
        pushType: 'queue_position_update',
      });
    }

    return changes;
  }

  static rank(entries) {
    return [...entries]
      .sort((a, b) => (a.position - b.position) || a.id.localeCompare(b.id))
      .map((item, index) => ({ ...item, position: index + 1 }));
  }

  static dedupeByEntryAndPosition(changes) {
    const seen = new Set();
    return changes.filter(change => {
      const key = `${change.entryId}:${change.position}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

describe('queue position web push trigger', () => {
  test('migration recalcula ranking e chama send-push via pg_net com segredo interno', () => {
    const source = readMigration();

    assert.match(source, /CREATE EXTENSION IF NOT EXISTS pg_net/);
    assert.match(source, /CREATE OR REPLACE FUNCTION public\.fn_notify_queue_clients/);
    assert.match(source, /ROW_NUMBER\(\) OVER \(ORDER BY position ASC, id ASC\)/);
    assert.match(source, /_notify_queue_position_web_push/);
    assert.match(source, /net\.http_post/);
    assert.match(source, /x-barberflow-internal-secret/);
    assert.match(source, /current_setting\('app\.queue_position_push_secret', true\)/);
    assert.match(source, /queue_position_update/);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  });

  test('fila com 5 clientes: 1 sai e os 4 restantes recebem nova posicao', () => {
    const previous = [
      entry('e1', 'c1', 1),
      entry('e2', 'c2', 2),
      entry('e3', 'c3', 3),
      entry('e4', 'c4', 4),
      entry('e5', 'c5', 5),
    ];
    const current = previous.slice(1);
    const changes = QueuePositionTriggerSimulator.computeChanges(previous, current);

    assert.deepEqual(
      changes.map(change => [change.clientId, change.position, change.previousPosition]),
      [['c2', 1, 2], ['c3', 2, 3], ['c4', 3, 4], ['c5', 4, 5]],
    );
  });

  test('walk-in sem client_id nao quebra e nao recebe Web Push', () => {
    const previous = [
      entry('e1', 'c1', 1),
      entry('e2', null, 2),
      entry('e3', 'c3', 3),
    ];
    const current = previous.slice(1);
    const changes = QueuePositionTriggerSimulator.computeChanges(previous, current);

    assert.deepEqual(changes.map(change => [change.clientId, change.position]), [['c3', 2]]);
  });

  test('mudancas rapidas nao duplicam a mesma posicao, mas nao pulam mudanca real', () => {
    const step1 = QueuePositionTriggerSimulator.computeChanges(
      [entry('e1', 'c1', 1), entry('e2', 'c2', 2), entry('e3', 'c3', 3)],
      [entry('e2', 'c2', 2), entry('e3', 'c3', 3)],
    );
    const duplicatedStep1 = QueuePositionTriggerSimulator.computeChanges(
      [entry('e1', 'c1', 1), entry('e2', 'c2', 2), entry('e3', 'c3', 3)],
      [entry('e2', 'c2', 2), entry('e3', 'c3', 3)],
    );
    const step2 = QueuePositionTriggerSimulator.computeChanges(
      [entry('e2', 'c2', 1), entry('e3', 'c3', 2)],
      [entry('e3', 'c3', 2)],
    );

    const dedupedSamePosition = QueuePositionTriggerSimulator.dedupeByEntryAndPosition([
      ...step1,
      ...duplicatedStep1,
    ]);
    assert.equal(dedupedSamePosition.length, 2);

    assert.deepEqual(step2.map(change => [change.clientId, change.position]), [['c3', 1]]);
  });
});
