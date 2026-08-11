'use strict';

const { Router }                  = require('express');
const webpush                     = require('web-push');
const PushService                 = require('../services/PushService');
const { QueuePresenceRepository } = require('../repositories/QueuePresenceRepository');
const { QueuePresenceNudgeTask }  = require('../application/scheduler/tasks/QueuePresenceNudgeTask');

/**
 * Rotas para gatilhos de cron EXTERNOS (ex: cron-job.org) — distintas de
 * /api/internal/cron (routes/internalCron.js), que é exclusivo para
 * Vercel Cron Jobs e valida Authorization: Bearer $CRON_SECRET
 * auto-injetado pelo Vercel.
 *
 * Por que existe separado do Scheduler canônico (SchedulerFactory/
 * TaskRegistry) e de workers/worker.js: aquele Scheduler só roda dentro
 * de um processo Node persistente com setInterval/polling, que a
 * hospedagem atual (Vercel serverless) não consegue executar. Esta rota
 * chama a lógica da task diretamente, sem depender do Scheduler nem do
 * worker.js.
 *
 * Fica exposta publicamente na internet (o serviço externo precisa
 * conseguir chamar via HTTP simples) — protegida por segredo
 * compartilhado no header x-cron-secret, comparado contra
 * QUEUE_PRESENCE_CRON_SECRET.
 */
module.exports = function criarExternalCronRoute(db) {
  const router = Router();

  // Validar QUEUE_PRESENCE_CRON_SECRET em todas as rotas deste router
  router.use((req, res, next) => {
    const secret   = process.env.QUEUE_PRESENCE_CRON_SECRET;
    const provided = req.headers['x-cron-secret'] ?? '';
    if (!secret || provided !== secret) {
      return res.status(401).json({ ok: false });
    }
    next();
  });

  // ── Inicialização lazy do PushService (VAPID) ──────────────────────
  // Mesmo motivo de routes/notificacoes.js: webpush.setVapidDetails()
  // LANÇA se as chaves forem inválidas. Fazer isso fora de uma função
  // travaria o require() deste módulo e derrubaria TODAS as rotas do app
  // (inclusive /auth/login) em cold start serverless.
  let pushService = null;

  function obterPushService() {
    if (pushService) return pushService;
    const publicKey  = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      console.error('[BFF] queue-presence-nudge: VAPID não configurado — push desativado.');
      return null;
    }
    try {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:contato@barberflow.app',
        publicKey,
        privateKey,
      );
    } catch (err) {
      console.error('[BFF] queue-presence-nudge: VAPID inválido —', err.message);
      return null;
    }
    pushService = new PushService(db, webpush);
    return pushService;
  }

  const queuePresenceRepository = new QueuePresenceRepository(db);

  /**
   * GET /api/external/cron/queue-presence-nudge
   *
   * Lembrete recorrente "você já está na barbearia?" para clientes em 1º
   * lugar na fila de espera que ainda não confirmaram presença, respeitando
   * o intervalo de 10 minutos (controlado por last_presence_prompt_at).
   * Chamada por serviço externo (cron-job.org) a cada poucos minutos —
   * a cadência real de 10 min é controlada pelo repositório, não por esta rota.
   */
  router.get('/queue-presence-nudge', async (req, res) => {
    const svc = obterPushService();
    if (!svc) {
      return res.status(200).json({ ok: false, reason: 'PUSH_UNAVAILABLE' });
    }

    try {
      const task = new QueuePresenceNudgeTask({ queuePresenceRepository, pushService: svc });
      await task.execute();
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[BFF] queue-presence-nudge falhou:', err?.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
