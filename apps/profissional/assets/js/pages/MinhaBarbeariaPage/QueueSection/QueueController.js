import { SectionEventCatalog } from '../../../../../../../shared/js/SectionEventCatalog.js';

export class QueueController {
  #state;
  #view;
  #queueRealtimeClient;
  #emit = null;

  constructor({ state, view, queueRealtimeClient } = {}) {
    if (!state?.merge || !view?.render || !queueRealtimeClient) {
      throw new Error('QueueController requer State, View e QueueRealtimeClient injetados.');
    }
    this.#state = state;
    this.#view = view;
    this.#queueRealtimeClient = queueRealtimeClient;
  }
  init({ emit } = {}) { this.#emit = emit; this.render(); }
  render() { this.#view.render(this.#state.snapshot); }
  update(partial) {
    this.#state.merge(partial);
    this.render();
    this.#emit?.(SectionEventCatalog.QUEUE_CHANGED, this.#state.snapshot);
  }
  startRealtime({ barbershopId, onChange, poll } = {}) {
    this.#queueRealtimeClient.start({ barbershopId, onChange, poll });
    this.#state.merge({ barbershopId, realtimeActive: this.#queueRealtimeClient.active });
    this.#emitRealtime();
  }
  destroy() {
    this.#queueRealtimeClient.stop();
    this.#state.merge({ realtimeActive: false });
    this.#emitRealtime();
    this.#emit = null;
  }
  #emitRealtime() { this.#emit?.(SectionEventCatalog.QUEUE_REALTIME_CHANGED, this.#state.snapshot); }
}
