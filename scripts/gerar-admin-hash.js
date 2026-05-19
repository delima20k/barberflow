'use strict';

// =============================================================
// gerar-admin-hash.js — Utilitário one-shot para gerar o hash
// bcrypt da senha do admin da dashboard.
//
// Uso:
//   node scripts/gerar-admin-hash.js <sua-senha>
//
// Cole o hash resultante como ADMIN_PASSWORD_HASH no .env.
// Execute apenas uma vez — nunca commite o hash no repositório.
// =============================================================

const bcrypt = require('bcryptjs');

const senha = process.argv[2];

if (!senha || senha.trim().length < 8) {
  console.error('Erro: informe uma senha com no mínimo 8 caracteres.');
  console.error('Uso: node scripts/gerar-admin-hash.js <sua-senha>');
  process.exit(1);
}

const ROUNDS = 12;

bcrypt.hash(senha.trim(), ROUNDS).then(hash => {
  console.log('\n=== Hash gerado com sucesso ===');
  console.log('Adicione ao .env e ao Vercel:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\n==============================\n');
}).catch(err => {
  console.error('Erro ao gerar hash:', err.message);
  process.exit(1);
});
