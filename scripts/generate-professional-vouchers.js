'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

class ProfessionalVoucherGeneratorConfig {
  constructor(argv = process.argv.slice(2), env = process.env) {
    this.count = 1;
    this.trialDays = 30;
    this.expiresAt = null;
    this.supabaseUrl = env.SUPABASE_URL;
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    for (const arg of argv) {
      const [key, value = ''] = String(arg).split('=');
      if (key === '--count') this.count = Number(value);
      if (key === '--trial-days') this.trialDays = Number(value);
      if (key === '--expires-at') this.expiresAt = value || null;
    }
  }

  validar() {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    }
    if (!Number.isInteger(this.count) || this.count < 1 || this.count > 1000) {
      throw new Error('--count deve ser um inteiro entre 1 e 1000.');
    }
    if (!Number.isInteger(this.trialDays) || this.trialDays < 1 || this.trialDays > 365) {
      throw new Error('--trial-days deve ser um inteiro entre 1 e 365.');
    }
    if (this.expiresAt && Number.isNaN(Date.parse(this.expiresAt))) {
      throw new Error('--expires-at deve ser uma data ISO valida, exemplo 2026-12-31T23:59:59Z.');
    }
  }
}

class ProfessionalVoucherCodeGenerator {
  static #ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  next() {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += ProfessionalVoucherCodeGenerator.#ALPHABET[
        crypto.randomInt(ProfessionalVoucherCodeGenerator.#ALPHABET.length)
      ];
    }
    return code;
  }
}

class ProfessionalVoucherCli {
  #config;
  #db;
  #codeGenerator;

  constructor(config, db, codeGenerator = new ProfessionalVoucherCodeGenerator()) {
    this.#config = config;
    this.#db = db;
    this.#codeGenerator = codeGenerator;
  }

  async run() {
    const criados = [];
    const tentativasMax = this.#config.count * 20;
    let tentativas = 0;

    while (criados.length < this.#config.count && tentativas < tentativasMax) {
      tentativas += 1;
      const code = this.#codeGenerator.next();
      if (criados.includes(code)) continue;

      const { data, error } = await this.#db
        .from('professional_trial_vouchers')
        .insert({
          code,
          trial_days: this.#config.trialDays,
          expires_at: this.#config.expiresAt,
        })
        .select('code')
        .single();

      if (error?.code === '23505') continue;
      if (error) throw new Error(error.message || 'Falha ao inserir voucher.');
      criados.push(data.code);
    }

    if (criados.length < this.#config.count) {
      throw new Error(`Nao foi possivel gerar ${this.#config.count} vouchers unicos.`);
    }

    console.log('Vouchers criados:');
    for (const code of criados) console.log(code);
  }
}

async function main() {
  const config = new ProfessionalVoucherGeneratorConfig();
  config.validar();
  const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await new ProfessionalVoucherCli(config, db).run();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  ProfessionalVoucherGeneratorConfig,
  ProfessionalVoucherCodeGenerator,
  ProfessionalVoucherCli,
};
