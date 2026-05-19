'use strict';

module.exports = {
  port: parseInt(process.env.PORT ?? '3002', 10),
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  cors: {
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
    ],
  },
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS ?? '30000', 10),
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS ?? '10000', 10),
};
