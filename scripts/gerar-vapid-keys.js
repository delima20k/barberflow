'use strict';

// =============================================================
// gerar-vapid-keys.js — Geração de VAPID Keys para Web Push
//
// Uso: node scripts/gerar-vapid-keys.js
//
// Requer web-push instalado como devDependency:
//   npm install web-push --save-dev
//
// Execução única durante setup do projeto.
// Saída: instruções para configurar Supabase Secrets + PushSubscriptionService.
// =============================================================

const { execSync } = require('node:child_process');

class VapidKeyGenerator {

  static #SUPABASE_CLI_HINT = 'supabase secrets set';
  static #VAPID_SUBJECT     = 'mailto:contato@barberflow.app';

  static run() {
    console.log('\n🔑 Gerando VAPID Keys para BarberFlow...\n');

    const keys = VapidKeyGenerator.#gerar();
    VapidKeyGenerator.#exibirInstrucoes(keys);
  }

  // ── Gera as chaves via web-push ───────────────────────────
  static #gerar() {
    try {
      const out = execSync('npx web-push generate-vapid-keys --json', { encoding: 'utf8' });
      return JSON.parse(out.trim());
    } catch (err) {
      console.error('❌ Erro ao gerar VAPID Keys:', err.message);
      console.error('\nInstale web-push: npm install web-push --save-dev');
      process.exit(1);
    }
  }

  // ── Exibe instruções de configuração ─────────────────────
  static #exibirInstrucoes({ publicKey, privateKey }) {
    const sep = '═'.repeat(60);

    console.log('✅ VAPID Keys geradas com sucesso!\n');

    console.log(sep);
    console.log('1. SUPABASE SECRETS — executar no terminal:');
    console.log(sep);
    console.log(`\n${VapidKeyGenerator.#SUPABASE_CLI_HINT} VAPID_PUBLIC_KEY="${publicKey}"`);
    console.log(`${VapidKeyGenerator.#SUPABASE_CLI_HINT} VAPID_PRIVATE_KEY="${privateKey}"`);
    console.log(`${VapidKeyGenerator.#SUPABASE_CLI_HINT} VAPID_SUBJECT="${VapidKeyGenerator.#VAPID_SUBJECT}"\n`);

    console.log(sep);
    console.log('2. FRONTEND — substituir em shared/js/PushSubscriptionService.js:');
    console.log(sep);
    console.log(`\n  static #VAPID_PUBLIC = '${publicKey}';\n`);

    console.log(sep);
    console.log('3. DEPLOY — após configurar os secrets:');
    console.log(sep);
    console.log('\n  supabase functions deploy push-subscriptions');
    console.log('  supabase functions deploy send-push\n');
  }
}

VapidKeyGenerator.run();
