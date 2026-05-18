'use strict';

// Carrega .env localmente (Vercel injeta as vars automaticamente em produção).
if (!process.env.VERCEL) {
  try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); } catch { /* opcional */ }
}

const criarApp = require('../app');

module.exports = criarApp();
