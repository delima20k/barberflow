'use strict';

class TaskRegistry {
  #tasks = new Map();

  register(task) {
    if (!task?.name) throw new TypeError('TaskRegistry.register: task invalida');
    if (this.#tasks.has(task.name)) throw new Error(`TaskRegistry: task duplicada ${task.name}`);
    this.#tasks.set(task.name, task);
    return this;
  }

  get(name) {
    return this.#tasks.get(name) ?? null;
  }

  list() {
    return [...this.#tasks.values()];
  }
}

module.exports = { TaskRegistry };
