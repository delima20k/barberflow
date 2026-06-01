'use strict';

// =============================================================
// ecosystem.config.js — Configuração PM2 para produção.
//
// Por que fork mode (não cluster mode do PM2)?
//
//   cluster mode do PM2 usa node:cluster internamente, que
//   compartilha a porta TCP via IPC entre processos — isso é
//   acoplamento desnecessário e dificulta a migração para containers.
//
//   fork mode sobe N processos completamente independentes.
//   Cada um abre sua própria conexão de rede. O balanceamento
//   fica no load balancer externo (Nginx, ALB, Kubernetes Service).
//   É o modelo correto para escala horizontal.
//
// Uso:
//   npm install -g pm2
//   pm2 start ecosystem.config.js --env production
//   pm2 reload ecosystem.config.js --update-env   (zero-downtime)
//   pm2 monit
//   pm2 logs barberflow-api
// =============================================================

module.exports = {
  apps: [
    {
      name:      'barberflow-api',
      script:    './api.js',

      // fork: cada instância é processo independente (correto para escala)
      exec_mode: 'fork',

      // 'max' = 1 instância por CPU do servidor
      // Sobrescreva com WEB_CONCURRENCY=2 para controlar manualmente
      instances: process.env.WEB_CONCURRENCY ?? 'max',

      autorestart:        true,
      watch:              false,
      max_memory_restart: '512M',

      // Aguarda SIGTERM ser processado antes de enviar SIGKILL
      kill_timeout:   15000,
      listen_timeout:  5000,

      // Variáveis de ambiente por modo
      env: {
        NODE_ENV: 'development',
        APP_ENV:  'development',
        PORT:     3001,
      },
      env_production: {
        NODE_ENV: 'production',
        APP_ENV:  'production',
        PORT:     3001,
      },

      // Logs estruturados — um arquivo por instância ou merged
      log_date_format: 'YYYY-MM-DDTHH:mm:ss.SSSZ',
      merge_logs:      true,
      error_file:      './logs/pm2-error.log',
      out_file:        './logs/pm2-out.log',
    },
  ],
};
