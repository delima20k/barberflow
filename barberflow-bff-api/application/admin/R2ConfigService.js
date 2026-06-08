'use strict';

const crypto   = require('node:crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const R2Client = require('../../../src/infra/R2Client');
const { ConfigEncryptionService }  = require('../../infrastructure/config/ConfigEncryptionService');
const { SystemConfigRepository }   = require('../../infrastructure/config/SystemConfigRepository');

// ============================================================
// R2ConfigService — gerencia as credenciais do Cloudflare R2
// e outras configurações do sistema via tabela system_config.
//
// Responsabilidades:
//   salvar()          — valida + encripta + persiste no DB
//   carregar()        — lê do DB + mascara secrets
//   patchProcessEnv() — injeta valores do DB em process.env
//   gerarSecret()     — gera MEDIA_CONFIRM_SECRET aleatório
//   testarConexao()   — valida credenciais contra o bucket real
// ============================================================

// Mapa: campo do formulário → chave do DB → variável de ambiente
const CAMPOS = Object.freeze({
  accountId:          { dbKey: 'r2.account_id',          envKey: 'R2_ACCOUNT_ID',          secret: false },
  accessKeyId:        { dbKey: 'r2.access_key_id',       envKey: 'R2_ACCESS_KEY_ID',        secret: false },
  secretAccessKey:    { dbKey: 'r2.secret_access_key',   envKey: 'R2_SECRET_ACCESS_KEY',    secret: true  },
  bucketName:         { dbKey: 'r2.bucket_name',         envKey: 'R2_BUCKET_NAME',          secret: false },
  publicUrl:          { dbKey: 'r2.public_url',          envKey: 'R2_PUBLIC_URL',           secret: false },
  mediaConfirmSecret: { dbKey: 'media.confirm_secret',   envKey: 'MEDIA_CONFIRM_SECRET',    secret: true  },
  storageBackend:     { dbKey: 'storage.backend',        envKey: 'STORIES_STORAGE_BACKEND', secret: false },
});

const CAMPO_KEYS  = Object.keys(CAMPOS);
const DB_KEYS     = CAMPO_KEYS.map(k => CAMPOS[k].dbKey);
const MASCARA     = '***';

class R2ConfigService {

  /** @type {SystemConfigRepository} */
  #repo;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    const encryption = new ConfigEncryptionService();
    this.#repo       = new SystemConfigRepository(supabase, encryption);
  }

  // ── Público ──────────────────────────────────────────────

  /**
   * Valida e persiste os campos de configuração R2.
   * Apenas campos presentes no payload são atualizados.
   * Após salvar, injeta valores em process.env e reseta o R2Client.
   *
   * @param {Partial<Record<string, string>>} campos — chaves: accountId, accessKeyId…
   * @returns {Promise<void>}
   */
  async salvar(campos) {
    this.#validarCampos(campos);

    for (const [campo, valor] of Object.entries(campos)) {
      const def = CAMPOS[campo];
      if (!def) continue;
      if (typeof valor !== 'string' || !valor.trim()) continue;
      await this.#repo.set(def.dbKey, valor.trim());
    }

    await this.patchProcessEnv();
    R2Client.reset();
  }

  /**
   * Carrega a configuração atual do DB.
   * Campos sensíveis são mascarados (***) se preenchidos.
   *
   * @returns {Promise<Record<string, string>>}
   */
  async carregar() {
    const mapa = await this.#repo.getAll(DB_KEYS);

    const result = {};
    for (const [campo, def] of Object.entries(CAMPOS)) {
      const valor = mapa.get(def.dbKey) ?? '';
      result[campo] = (def.secret && valor) ? MASCARA : valor;
    }
    return result;
  }

  /**
   * Lê todos os valores do DB e injeta em process.env.
   * Chamado no startup do BFF e após cada salvar().
   *
   * @returns {Promise<void>}
   */
  async patchProcessEnv() {
    const mapa = await this.#repo.getAll(DB_KEYS);

    for (const def of Object.values(CAMPOS)) {
      const valor = mapa.get(def.dbKey);
      if (valor) process.env[def.envKey] = valor;
    }
  }

  /**
   * Gera uma string aleatória segura para MEDIA_CONFIRM_SECRET.
   * @returns {string} 64 bytes em hex (128 chars)
   */
  gerarSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Testa a conexão com o Cloudflare R2 usando as credenciais
   * atualmente salvas no DB.
   * Cria um arquivo temporário, verifica existência e deleta.
   *
   * @returns {Promise<{ ok: boolean, detalhes: string[] }>}
   */
  async testarConexao() {
    const detalhes = [];

    // Carrega credenciais diretamente do DB (ignora process.env para o teste)
    const mapa = await this.#repo.getAll(DB_KEYS);
    const accountId       = mapa.get('r2.account_id')        ?? '';
    const accessKeyId     = mapa.get('r2.access_key_id')     ?? '';
    const secretAccessKey = mapa.get('r2.secret_access_key') ?? '';
    const bucketName      = mapa.get('r2.bucket_name')       ?? '';

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return { ok: false, detalhes: ['Credenciais incompletas. Salve Account ID, Access Key ID, Secret Access Key e Bucket Name antes de testar.'] };
    }

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const s3 = new S3Client({
      region:   'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    const testKey = `barberflow-admin-test-${crypto.randomUUID()}.txt`;
    const testBody = `BarberFlow R2 connection test — ${new Date().toISOString()}`;

    try {
      // 1. Upload
      await s3.send(new PutObjectCommand({
        Bucket:      bucketName,
        Key:         testKey,
        Body:        testBody,
        ContentType: 'text/plain',
      }));
      detalhes.push('✓ Upload: permissão de escrita OK');

      // 2. Verificar existência
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: testKey }));
      detalhes.push('✓ HeadObject: leitura de metadados OK');

      // 3. Deletar
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
      detalhes.push('✓ Delete: permissão de exclusão OK');

      return { ok: true, detalhes };
    } catch (err) {
      // Tenta deletar o arquivo de teste mesmo em caso de falha parcial
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey })).catch(() => {});

      const msg = err?.message ?? String(err);
      detalhes.push(`✗ Falha: ${msg}`);
      return { ok: false, detalhes };
    }
  }

  // ── Privado ───────────────────────────────────────────────

  #validarCampos(campos) {
    if (!campos || typeof campos !== 'object') {
      throw Object.assign(new Error('Payload inválido.'), { status: 400 });
    }

    for (const campo of Object.keys(campos)) {
      if (!CAMPO_KEYS.includes(campo)) {
        throw Object.assign(new Error(`Campo desconhecido: "${campo}".`), { status: 400 });
      }
    }

    // storageBackend só aceita valores específicos
    if (campos.storageBackend !== undefined) {
      if (!['r2', 'supabase', ''].includes(campos.storageBackend)) {
        throw Object.assign(new Error('storageBackend deve ser "r2" ou "supabase".'), { status: 400 });
      }
    }
  }
}

module.exports = { R2ConfigService };
