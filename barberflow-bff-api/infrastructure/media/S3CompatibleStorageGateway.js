'use strict';

const crypto = require('node:crypto');

/**
 * S3CompatibleStorageGateway - adapter pequeno para testes MinIO/LocalStack.
 */
class S3CompatibleStorageGateway {
  #endpoint;
  #accessKeyId;
  #secretAccessKey;
  #region;
  #bucket;

  constructor({ endpoint, accessKeyId, secretAccessKey, region = 'us-east-1', bucket }) {
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new TypeError('S3CompatibleStorageGateway: endpoint, credenciais e bucket sao obrigatorios');
    }
    this.#endpoint = endpoint.replace(/\/+$/, '');
    this.#accessKeyId = accessKeyId;
    this.#secretAccessKey = secretAccessKey;
    this.#region = region;
    this.#bucket = bucket;
  }

  async putSource({ path, bytes, contentType }) {
    await this.#put(path, bytes, contentType);
  }

  async putVariant(variant) {
    await this.#put(variant.path, variant.bytes, variant.contentType);
  }

  async #put(path, bytes, contentType) {
    const url = new URL(`${this.#endpoint}/${this.#bucket}/${path}`);
    const headers = this.#headers('PUT', url, bytes, contentType);
    const response = await fetch(url, { method: 'PUT', body: bytes, headers });
    if (!response.ok) throw new Error(`S3CompatibleStorageGateway: PUT falhou (${response.status})`);
  }

  #headers(method, url, bytes, contentType) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const hash = S3CompatibleStorageGateway.#sha(bytes);
    const headers = {
      'content-type': contentType,
      host: url.host,
      'x-amz-content-sha256': hash,
      'x-amz-date': amzDate,
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort().map(key => `${key}:${headers[key]}\n`).join('');
    const canonical = [method, url.pathname, '', canonicalHeaders, signedHeaders, hash].join('\n');
    const scope = `${date}/${this.#region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, S3CompatibleStorageGateway.#sha(canonical)].join('\n');
    const signature = S3CompatibleStorageGateway.#hmac(
      S3CompatibleStorageGateway.#key(this.#secretAccessKey, date, this.#region),
      toSign,
      'hex',
    );
    return {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.#accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  static #sha(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  static #hmac(key, value, encoding) {
    return crypto.createHmac('sha256', key).update(value).digest(encoding);
  }

  static #key(secret, date, region) {
    const kDate = S3CompatibleStorageGateway.#hmac(`AWS4${secret}`, date);
    const kRegion = S3CompatibleStorageGateway.#hmac(kDate, region);
    const kService = S3CompatibleStorageGateway.#hmac(kRegion, 's3');
    return S3CompatibleStorageGateway.#hmac(kService, 'aws4_request');
  }

  get bucket() {
    return this.#bucket;
  }
}

module.exports = { S3CompatibleStorageGateway };
