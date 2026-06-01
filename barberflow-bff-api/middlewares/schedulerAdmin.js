'use strict';

class SchedulerAdminMiddleware {
  static verificar(req, res, next) {
    const configuredToken = process.env.SCHEDULER_ADMIN_TOKEN;
    const providedToken = req.headers['x-scheduler-admin-token'];
    if (configuredToken && providedToken === configuredToken) return next();

    const allowed = (process.env.SCHEDULER_ADMIN_USER_IDS ?? '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    if (req.user?.id && allowed.includes(req.user.id)) return next();

    return res.status(403).json({ ok: false, error: 'Acesso admin do scheduler negado.' });
  }
}

module.exports = SchedulerAdminMiddleware;
