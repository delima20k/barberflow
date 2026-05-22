'use strict';

class SchedulerController {
  #schedulerService;

  constructor({ schedulerService }) {
    if (!schedulerService) throw new TypeError('SchedulerController.schedulerService obrigatorio');
    this.#schedulerService = schedulerService;
  }

  list(_req, res) {
    return res.json({ ok: true, data: this.#schedulerService.listTasks() });
  }

  async trigger(req, res, next) {
    try {
      const taskName = req.params.taskName;
      if (!taskName || !/^[a-z][a-z0-9.-]+$/.test(taskName)) {
        return res.status(400).json({ ok: false, error: 'taskName invalido' });
      }
      const result = await this.#schedulerService.trigger(taskName);
      return res.status(202).json({ ok: true, data: result });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = { SchedulerController };
