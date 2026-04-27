'use strict';

// =============================================================
// R2Client.js — Cliente Cloudflare R2 (S3-compatível).
// Camada: infra
//
// Fornece upload P2P via URL presigned (cliente envia diretamente
// ao R2, sem o arquivo passar pelo servidor Express).
//
// Variáveis de ambiente obrigatórias:
//   R2_ACCOUNT_ID          — ID da conta Cloudflare
//   R2_ACCESS_KEY_ID       — chave de acesso R2
//   R2_SECRET_ACCESS_KEY   — chave secreta R2
//   R2_BUCKET_NAME         — nome do bucket R2
//   R2_PUBLIC_URL          — URL pública do bucket (ex: https://pub-xxx.r2.dev)
//
// Padrão Singleton: R2Client.getInstance()
// =============================================================

const {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class R2Client {

  static #instance = null;

  /** @type {S3Client} */
  #s3;
  /** @type {string} */
  #bucket;
  /** @type {string} */
  #publicBase;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKey = process.env.R2_ACCESS_KEY_ID;
    const secretKey = process.env.R2_SECRET_ACCESS_KEY;
    this.#bucket     = process.env.R2_BUCKET_NAME ?? '';
    this.#publicBase = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '');

    if (!accountId || !accessKey || !secretKey || !this.#bucket) {
      throw new Error(
        '[R2Client] Variáveis de ambiente ausentes: ' +
        'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
      );
    }

    this.#s3 = new S3Client({
      region:   'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     accessKey,
        secretAccessKey: secretKey,
      },
    });
  }

  /**
   * Retorna (ou cria) a instância singleton do R2Client.
   * @returns {R2Client}
   */
  static getInstance() {
    R2Client.#instance ??= new R2Client();
    return R2Client.#instance;
  }

  // ── Upload P2P ──────────────────────────────────────────────

  /**
   * Gera URL de upload P2P — cliente envia diretamente ao R2.
   * O arquivo nunca transita pelo servidor Express.
   *
   * @param {string} path        — chave no bucket (ex: stories/uuid/uuid.mp4)
   * @param {string} contentType — MIME type do arquivo
   * @param {number} [expiresIn] — segundos até a URL expirar (padrão: 300s)
   * @returns {Promise<string>}  — URL de upload assinada
   */
  async presignedPut(path, contentType, expiresIn = 300) {
    const cmd = new PutObjectCommand({
      Bucket:      this.#bucket,
      Key:         path,
      ContentType: contentType,
    });
    return getSignedUrl(this.#s3, cmd, { expiresIn });
  }

  // ── Upload server-side ──────────────────────────────────────

  /**
   * Envia um buffer diretamente ao R2 a partir do servidor.
   * Use quando o arquivo já está no servidor (ex: upload seguro com criptografia).
   * Para uploads P2P (browser → R2), use presignedPut() em vez deste método.
   *
   * @param {string} path        — chave no bucket
   * @param {Buffer} buffer      — conteúdo a enviar
   * @param {string} contentType — MIME type
   * @returns {Promise<void>}
   */
  async putBuffer(path, buffer, contentType) {
    await this.#s3.send(
      new PutObjectCommand({
        Bucket:        this.#bucket,
        Key:           path,
        Body:          buffer,
        ContentType:   contentType,
        ContentLength: buffer.length,
      })
    );
  }

  // ── Verificação ─────────────────────────────────────────────

  /**
   * Verifica se um objeto existe no R2 e retorna seus metadados.
   * Usado para confirmar que o upload P2P ocorreu antes de salvar os metadados.
   *
   * @param {string} path
   * @returns {Promise<{tamanhoBytes: number, contentType: string} | null>}
   *   null se o objeto não existir
   */
  async head(path) {
    try {
      const res = await this.#s3.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: path })
      );
      return {
        tamanhoBytes: res.ContentLength ?? 0,
        contentType:  res.ContentType  ?? '',
      };
    } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  // ── Deleção ─────────────────────────────────────────────────

  /**
   * Remove um objeto do R2.
   * Falha silenciosa: se o objeto já não existir, não lança erro.
   * @param {string} path
   */
  async delete(path) {
    await this.#s3.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: path })
    );
  }

  // ── URL pública ─────────────────────────────────────────────

  /**
   * Retorna a URL pública de um objeto via R2 Public Bucket / Worker CDN.
   * @param {string} path
   * @returns {string}  '' se path ou R2_PUBLIC_URL não estiver configurado
   */
  publicUrl(path) {
    if (!this.#publicBase || !path) return '';
    return `${this.#publicBase}/${path}`;
  }
}

module.exports = R2Client;
