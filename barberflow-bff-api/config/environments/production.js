'use strict';

module.exports = {
  port: parseInt(process.env.PORT ?? '3002', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  cors: {
    allowedOrigins: [
      // App profissional
      'https://barberflow-pro-one.vercel.app',
      'https://barberflow-profissional.vercel.app',
      // App cliente
      'https://barberflow-cliente.vercel.app',
      'https://barberflow-cliente-one.vercel.app',
      // Domínio principal antigo
      'https://barberflow.app',
      'https://www.barberflow.app',
      // Domínios oficiais barberflow.live
      'https://barberflow.live',
      'https://app.barberflow.live',
      'https://pro.barberflow.live',
      // Painel administrativo
      'https://barberflow-adimin.vercel.app',
    ],
  },
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10),
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10),
};
