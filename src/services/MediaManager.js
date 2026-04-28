'use strict';

// =============================================================
// MediaManager.js — Sistema híbrido de mídia reusável.
// Camada: application
//
// ARQUITETURA HÍBRIDA — ROTEAMENTO POR CONTEXTO:
//
//   IMAGENS (avatars, services, portfolio) → Supabase Storage
//     RLS nativa; bucket público; image transforms.
//     Upload P2P direto: browser → Supabase Storage (sem Express).
//
//   VÍDEOS / ÁUDIO (stories) → Cloudflare R2
//     Sem limite de tamanho; egress gratuito; CDN global.
//     Upload P2P direto: browser → R2 (sem Express).
//
//   MÍDIA CRIPTOGRAFADA (pipeline seguro) → R2 sempre
//     AES-256-GCM + chunking + P2P → R2 backup.
//     Nunca exposta publicamente — decriptada no download.
//
//   METADATA  — Supabase (PostgreSQL):
//     Apenas metadados (path, publicUrl, tipo, dono).
//     Supabase NÃO armazena o arquivo em si.
//
// FLUXO P2P COMPLETO:
//   1. Frontend → POST /api/media/presigned
//      Recebe: { uploadUrl, path, publicUrl, token, expiresAt }
//   2. Frontend → PUT uploadUrl (direto ao R2, sem servidor)
//      P2P: browser ↔ R2, servidor fora do caminho dos bytes
//   3. Frontend → POST /api/media/confirmar
//      Servidor: verifica HMAC + HEAD no R2 + salva em media_files
//
// CONTEXTOS SUPORTADOS:
//   stories | avatars | services | portfolio
//
// REUSABILIDADE:
//   Um único MediaManager serve todos os casos de uso de mídia.
//   Diferencie pelo parâmetro `contexto`.
//
// Dependências: R2Client, BaseService, InputValidator
// =============================================================

const crypto                = require('crypto');
const BaseService           = require('../infra/BaseService');
const EncryptionService     = require('./EncryptionService');
const ChunkService          = require('./ChunkService');
const HashService           = require('./HashService');
const { FallbackService }   = require('./FallbackService');
const SupabaseStorageClient = require('../infra/SupabaseStorageClient');

// ── Mapeamento MIME → extensão de arquivo ──────────────────────
const MIME_PARA_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'video/mp4':  'mp4',
  'video/webm': 'webm',
});

// ── Configuração por contexto ───────────────────────────────────
const CONTEXTOS = Object.freeze({
  stories:   {
    maxBytes: 50 * 1024 * 1024,
    mimes: new Set(['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']),
  },
  avatars:   {
    maxBytes: 2 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  services:  {
    maxBytes: 5 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
  portfolio: {
    maxBytes: 10 * 1024 * 1024,
    mimes: new Set(['image/jpeg', 'image/png', 'image/webp']),
  },
});

// Janela de validade da URL presigned (5 minutos)
const PRESIGNED_EXPIRES_SECS = 300;

// ── Roteamento de storage por contexto ─────────────────────────
// Imagens estáticas (avatars, services, portfolio) → Supabase Storage
//   Benefícios: RLS nativa, image transforms, sem config adicional de CDN.
// Vídeos/áudio (stories) → Cloudflare R2
//   Benefícios: sem limite de tamanho, egress gratuito, CDN global.
const CONTEXTO_BACKEND = Object.freeze({
  avatars:   'supabase',
  services:  'supabase',
  portfolio: 'supabase',
  stories:   'r2',
});

// Bucket Supabase Storage para cada contexto de imagem
const CONTEXTO_BUCKET = Object.freeze({
  avatars:   SupabaseStorageClient.BUCKET_IMAGES,
  services:  SupabaseStorageClient.BUCKET_IMAGES,
  portfolio: SupabaseStorageClient.BUCKET_IMAGES,
});

class MediaManager extends BaseService {

  /** @type {import('../infra/R2Client')} */
  #r2;

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /** @type {string} */
  #signingSecret;

  /** @type {EncryptionService} */
  #encryption;

  /** @type {ChunkService} */
  #chunks;

  /** @type {HashService} */
  #hash;

  /** @type {import('./PeerHealthService')|null} */
  #peerHealth;

  /** @type {import('./CacheService')|null} */
  #cache;

  /**
   * Provedor de upload P2P.
   * Interface: `{ upload(path: string, data: Buffer, peerUrl: string): Promise<void> }`
   * @type {{ upload(path: string, data: Buffer, peerUrl: string): Promise<void> }|null}
   */
  #p2pUploader;

  /**
   * Provedor de download P2P.
   * Interface: `{ get(path: string, peerUrl: string): Promise<Buffer|null> }`
   * @type {{ get(path: string, peerUrl: string): Promise<Buffer|null> }|null}
   */
  #p2pDownloader;

  /**
   * Cliente Supabase Storage para upload/download de imagens estáticas.
   * Injetado via opts.supabaseStorage. Obrigatório para contextos 'avatars',
   * 'services' e 'portfolio'; opcional para 'stories' (usa R2).
   * @type {import('../infra/SupabaseStorageClient')|null}
   */
  #supabaseStorage;

  /**
   * @param {import('../infra/R2Client')} r2Client  — instância do R2Client
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {object}  [opts]
   * @param {import('./PeerHealthService')}              [opts.peerHealth]       — seleção de melhor peer
   * @param {import('./CacheService')}                  [opts.cache]            — cache TTL para ciphertext
   * @param {import('../infra/SupabaseStorageClient')}  [opts.supabaseStorage]  — storage de imagens
   * @param {{ upload(path:string, data:Buffer, peerUrl:string):Promise<void> }} [opts.p2pUploader]
   * @param {{ get(path:string, peerUrl:string):Promise<Buffer|null> }}           [opts.p2pDownloader]
   */
  constructor(r2Client, supabase, opts = {}) {
    super('MediaManager');
    this.#r2              = r2Client;
    this.#supabase        = supabase;
    this.#signingSecret   = process.env.MEDIA_SIGNING_SECRET ?? '';
    if (!this.#signingSecret) {
      throw new Error('[MediaManager] MEDIA_SIGNING_SECRET é obrigatório no .env');
    }
    this.#encryption       = new EncryptionService();
    this.#chunks           = new ChunkService(); // 1 MB por chunk (padrão)
    this.#hash             = new HashService();
    this.#peerHealth       = opts.peerHealth       ?? null;
    this.#cache            = opts.cache            ?? null;
    this.#p2pUploader      = opts.p2pUploader      ?? null;
    this.#p2pDownloader    = opts.p2pDownloader    ?? null;
    this.#supabaseStorage  = opts.supabaseStorage  ?? null;
  }

  // ══════════════════════════════════════════════════════════════
  // ETAPA 1 — Gerar URL de upload P2P direto ao R2
  // ══════════════════════════════════════════════════════════════

  /**
   * Gera uma URL presigned para upload P2P direto ao Cloudflare R2.
   * O arquivo nunca transita pelo servidor — sobe direto do browser para o R2.
   *
   * @param {object} params
   * @param {string} params.contexto    — 'stories' | 'avatars' | 'services' | 'portfolio'
   * @param {string} params.ownerId     — UUID do usuário autenticado (auth.uid)
   * @param {string} params.contentType — MIME type do arquivo (ex: 'image/webp')
   * @returns {Promise<{
   *   uploadUrl: string,
   *   path:      string,
   *   publicUrl: string,
   *   token:     string,
   *   expiresAt: number
   * }>}
   */
  async gerarUrlPresigned({ contexto, ownerId, contentType }) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    const cfg = CONTEXTOS[contexto];
    if (!cfg.mimes.has(contentType)) {
      throw this._erro(
        `Tipo de arquivo não permitido para "${contexto}": ${contentType}`,
        415
      );
    }

    const ext  = MIME_PARA_EXT[contentType];
    const path = `${contexto}/${ownerId}/${crypto.randomUUID()}.${ext}`;
    const expiresAt = Math.floor(Date.now() / 1000) + PRESIGNED_EXPIRES_SECS;
    const token     = this.#assinarToken(path, ownerId, expiresAt);

    let uploadUrl, publicUrl;

    if (this.#ehSupabase(contexto)) {
      // Imagens → Supabase Storage (RLS nativa, image transforms)
      this.#garantirSupabaseStorage(contexto);
      const bucket = CONTEXTO_BUCKET[contexto];
      uploadUrl = await this.#supabaseStorage.presignedPut(bucket, path);
      publicUrl = this.#supabaseStorage.publicUrl(bucket, path);
    } else {
      // Vídeos/áudio → Cloudflare R2 (sem limite de tamanho, egress gratuito)
      uploadUrl = await this.#r2.presignedPut(path, contentType, PRESIGNED_EXPIRES_SECS);
      publicUrl = this.#r2.publicUrl(path);
    }

    return { uploadUrl, path, publicUrl, token, expiresAt };
  }

  // ══════════════════════════════════════════════════════════════
  // ETAPA 2 — Confirmar upload + persistir metadados
  // ══════════════════════════════════════════════════════════════

  /**
   * Confirma que o upload P2P foi realizado e persiste os metadados no Supabase.
   * Valida o HMAC para garantir que a URL foi gerada por este servidor.
   * Verifica a existência do arquivo no R2 via HEAD antes de persistir.
   *
   * @param {object} params
   * @param {string} params.path       — caminho no R2 (retornado por gerarUrlPresigned)
   * @param {string} params.ownerId    — UUID do usuário autenticado
   * @param {string} params.contexto
   * @param {string} params.token      — HMAC recebido em gerarUrlPresigned
   * @param {number} params.expiresAt  — timestamp retornado por gerarUrlPresigned
   * @param {object} [params.metadata] — dados extras livres (ex: { barbershopId, title })
   * @returns {Promise<{id: string, path: string, publicUrl: string, tamanhoBytes: number}>}
   */
  async confirmarUpload({ path, ownerId, contexto, token, expiresAt, metadata = {} }) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    if (!path || typeof path !== 'string') {
      throw this._erro('path inválido.', 400);
    }
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      throw this._erro('expiresAt inválido.', 400);
    }

    // ── Verificar HMAC (timing-safe) ─────────────────────────────
    const esperado  = this.#assinarToken(path, ownerId, expiresAt);
    const bufTok    = Buffer.from(typeof token === 'string' ? token : '', 'hex');
    const bufEsp    = Buffer.from(esperado, 'hex');
    const tokenValido = bufTok.length === bufEsp.length &&
                        crypto.timingSafeEqual(bufTok, bufEsp);
    if (!tokenValido) {
      throw this._erro('Token inválido.', 401);
    }

    // ── Verificar expiração ───────────────────────────────────────
    if (Math.floor(Date.now() / 1000) > expiresAt) {
      throw this._erro('Token expirado. Solicite uma nova URL de upload.', 401);
    }

    // ── Verificar upload no storage correto (HEAD) ───────────────
    let info;
    if (this.#ehSupabase(contexto)) {
      this.#garantirSupabaseStorage(contexto);
      info = await this.#supabaseStorage.head(CONTEXTO_BUCKET[contexto], path);
    } else {
      info = await this.#r2.head(path);
    }

    if (!info) {
      throw this._erro('Arquivo não encontrado no storage. Realize o upload antes de confirmar.', 404);
    }

    const { tamanhoBytes, contentType } = info;

    // ── Validar tamanho ────────────────────────────────────────────
    const cfg = CONTEXTOS[contexto];
    if (tamanhoBytes > cfg.maxBytes) {
      // Remove o arquivo para não consumir quota
      if (this.#ehSupabase(contexto)) {
        await this.#supabaseStorage.delete(CONTEXTO_BUCKET[contexto], path).catch(() => {});
      } else {
        await this.#r2.delete(path).catch(() => {});
      }
      throw this._erro(
        `Arquivo excede o limite de ${cfg.maxBytes / 1024 / 1024} MB para "${contexto}".`,
        413
      );
    }

    // Montar publicUrl de acordo com o storage usado
    const publicUrl = this.#ehSupabase(contexto)
      ? this.#supabaseStorage.publicUrl(CONTEXTO_BUCKET[contexto], path)
      : this.#r2.publicUrl(path);

    // Salvar qual backend foi usado — lido por deletar() para rotear a deleção
    const metadataFinal = {
      ...metadata,
      storage_backend: CONTEXTO_BACKEND[contexto],
    };

    // ── Persistir metadados no Supabase ────────────────────────────
    const { data, error } = await this.#supabase
      .from('media_files')
      .insert({
        owner_id:      ownerId,
        contexto,
        path,
        public_url:    publicUrl,
        content_type:  contentType,
        tamanho_bytes: tamanhoBytes,
        metadata:      metadataFinal,
      })
      .select('id')
      .single();

    if (error) {
      throw Object.assign(new Error(error.message), { status: 500 });
    }

    return { id: data.id, path, publicUrl, tamanhoBytes };
  }

  // ══════════════════════════════════════════════════════════════
  // Deleção
  // ══════════════════════════════════════════════════════════════

  /**
   * Remove um arquivo do R2 e seu registro de metadados do Supabase.
   * Valida propriedade: somente o dono pode deletar.
   *
   * @param {string} mediaId  — UUID do registro em media_files
   * @param {string} ownerId  — UUID do usuário autenticado
   */
  async deletar(mediaId, ownerId) {
    this._uuid('mediaId', mediaId);
    this._uuid('ownerId', ownerId);

    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, owner_id, contexto, metadata')
      .eq('id', mediaId)
      .single();

    if (error || !data) throw this._erro('Mídia não encontrada.', 404);
    if (data.owner_id !== ownerId) throw this._erro('Acesso negado.', 403);

    // Rotear deleção pelo backend registrado nos metadados
    const backend = data.metadata?.storage_backend ?? CONTEXTO_BACKEND[data.contexto] ?? 'r2';
    if (backend === 'supabase') {
      this.#garantirSupabaseStorage(data.contexto);
      await this.#supabaseStorage.delete(CONTEXTO_BUCKET[data.contexto], data.path);
    } else {
      await this.#r2.delete(data.path);
    }

    await this.#supabase.from('media_files').delete().eq('id', mediaId);
  }

  // ══════════════════════════════════════════════════════════════
  // Listagem
  // ══════════════════════════════════════════════════════════════

  /**
   * Lista todos os arquivos de um contexto pertencentes ao usuário.
   *
   * @param {string} contexto
   * @param {string} ownerId
   * @returns {Promise<Array<{
   *   id:           string,
   *   path:         string,
   *   publicUrl:    string,
   *   contentType:  string,
   *   tamanhoBytes: number,
   *   metadata:     object|null,
   *   criadoEm:     string
   * }>>}
   */
  async listar(contexto, ownerId) {
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));
    this._uuid('ownerId', ownerId);

    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, public_url, content_type, tamanho_bytes, metadata, created_at')
      .eq('contexto', contexto)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) throw Object.assign(new Error(error.message), { status: 500 });

    return (data ?? []).map(r => ({
      id:           r.id,
      path:         r.path,
      publicUrl:    r.public_url,
      contentType:  r.content_type,
      tamanhoBytes: r.tamanho_bytes,
      metadata:     r.metadata,
      criadoEm:     r.created_at,
    }));
  }

  // ══════════════════════════════════════════════════════════════
  // Upload integrado — Encrypt → Chunk → Hash → P2P → R2 → Supabase
  // ══════════════════════════════════════════════════════════════

  /**
   * Pipeline completo de upload com criptografia, chunking e distribuição híbrida.
   *
   * FLUXO:
   *   Encrypt → Chunk → Hash → P2P broadcast → Supabase metadata → R2 backup
   *
   * - O buffer é criptografado com AES-256-GCM antes de qualquer transmissão.
   * - Os chunks são validados (SHA-256) antes do armazenamento.
   * - Um hash global do merged-ciphertext é salvo para validação na descarga.
   * - P2P é tentado se `peers` e `peerHealth`/`p2pUploader` estiverem configurados.
   * - R2 é sempre usado como backup, independente do resultado do P2P.
   *
   * AVISO DE SEGURANÇA — gestão de chaves em produção:
   *   A chave `cripto.key` é salva em media_files.metadata.
   *   EM PRODUÇÃO: substitua pelo ID de uma chave em um KMS
   *   (AWS KMS, Cloudflare Workers Secrets, HashiCorp Vault, etc.)
   *
   * @param {object}   params
   * @param {Buffer}   params.buffer       — Plaintext a armazenar
   * @param {string}   params.contexto     — 'stories' | 'avatars' | 'services' | 'portfolio'
   * @param {string}   params.ownerId      — UUID do usuário autenticado
   * @param {string}   params.contentType  — MIME type original
   * @param {string[]} [params.peers]      — URLs dos peers P2P disponíveis
   * @param {object}   [params.metadata]   — Dados extras livres
   * @returns {Promise<{id: string, path: string, tamanhoBytes: number, peersUsed: string[]}>}
   */
  async uploadMedia({ buffer, contexto, ownerId, contentType, peers = [], metadata = {} }) {
    if (!Buffer.isBuffer(buffer)) throw this._erro('buffer deve ser um Buffer.', 400);
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    const cfg = CONTEXTOS[contexto];
    if (!cfg.mimes.has(contentType)) {
      throw this._erro(`Tipo de arquivo não permitido para "${contexto}": ${contentType}`, 415);
    }
    if (buffer.length > cfg.maxBytes) {
      throw this._erro(
        `Arquivo excede o limite de ${cfg.maxBytes / 1024 / 1024} MB para "${contexto}".`,
        413
      );
    }

    // ── 1. Criptografar (plaintext → ciphertext) ─────────────────
    const { data: ciphertext, key, iv, authTag } = this.#encryption.encrypt(buffer);

    // ── 2. Chunk + validar integridade de cada chunk ──────────────
    const chunks = this.#chunks.split(ciphertext);
    const merged = this.#chunks.merge(chunks); // lança se qualquer hash SHA-256 falhar

    // ── 3. Hash global do ciphertext (anti-tampering no download) ─
    const integrity_hash = this.#hash.generateHash(merged);

    // ── 4. Determinar path ────────────────────────────────────────
    const ext  = MIME_PARA_EXT[contentType] ?? 'bin';
    const path = `${contexto}/${ownerId}/${crypto.randomUUID()}.enc.${ext}`;

    // ── 5. P2P upload (best peer) — opcional; R2 como fallback ────
    const peersUsed = [];
    if (this.#peerHealth && this.#p2pUploader && peers.length > 0) {
      try {
        const bestPeer = await this.#peerHealth.getBestPeer(peers);
        await this.#p2pUploader.upload(path, merged, bestPeer);
        peersUsed.push(bestPeer);
      } catch (_) {
        // P2P falhou — R2 garante disponibilidade
      }
    }

    // ── 6. R2 backup (sempre) ────────────────────────────────────
    await this.#r2.putBuffer(path, merged, 'application/octet-stream');

    // ── 7. Persistir metadados no Supabase ───────────────────────
    const { data, error } = await this.#supabase
      .from('media_files')
      .insert({
        owner_id:      ownerId,
        contexto,
        path,
        public_url:    '',
        content_type:  'application/octet-stream',
        tamanho_bytes: merged.length,
        metadata: {
          contentTypeOriginal: contentType,
          cripto: { key, iv, authTag }, // ⚠️ substituir por KMS key ID em produção
          integrity_hash,
          chunk_count: chunks.length,
          peers_used:  peersUsed,
          ...Object.keys(metadata).length > 0 ? metadata : {},
        },
      })
      .select('id')
      .single();

    if (error) throw Object.assign(new Error(error.message), { status: 500 });

    return { id: data.id, path, tamanhoBytes: merged.length, peersUsed };
  }

  // ══════════════════════════════════════════════════════════════
  // Download integrado — P2P → Cache → R2 → Validar → Decriptar
  // ══════════════════════════════════════════════════════════════

  /**
   * Pipeline completo de download com cascade de fontes, validação de integridade
   * e decriptação do ciphertext.
   *
   * FLUXO:
   *   Autorizar → Buscar metadata → P2P → Cache → R2 → ValidarHash → Decrypt
   *
   * - Só o dono do arquivo pode baixá-lo (ownership check antes do I/O).
   * - O hash global é validado antes da decriptação (detecta adulteração).
   * - O ciphertext é cacheado após o primeiro download (se CacheService injetado).
   *
   * @param {object} params
   * @param {string} params.fileId  — UUID do registro em media_files
   * @param {string} params.userId  — UUID do usuário autenticado
   * @returns {Promise<Buffer>} Plaintext original
   * @throws {Error{status:404}} arquivo não encontrado
   * @throws {Error{status:403}} acesso negado — não é o dono
   * @throws {Error{status:422}} integridade violada — ciphertext adulterado
   * @throws {Error{status:502}} nenhuma fonte disponível (P2P + Cache + R2 falharam)
   * @throws {Error{status:500}} erro interno (Supabase ou metadados corrompidos)
   */
  async downloadMedia({ fileId, userId }) {
    this._uuid('fileId', fileId);
    this._uuid('userId', userId);

    // ── 1. Buscar metadados ───────────────────────────────────────
    const { data, error } = await this.#supabase
      .from('media_files')
      .select('id, path, owner_id, metadata')
      .eq('id', fileId)
      .maybeSingle();

    if (error) throw Object.assign(new Error(error.message), { status: 500 });
    if (!data) throw this._erro('Arquivo não encontrado.', 404);

    // ── 2. Ownership check (antes de qualquer I/O) ───────────────
    if (data.owner_id !== userId) throw this._erro('Acesso negado.', 403);

    const { path, metadata: meta } = data;
    const cripto         = meta?.cripto;
    const integrity_hash = meta?.integrity_hash;
    const peers          = meta?.peers_used ?? [];

    if (!cripto?.key || !cripto?.iv || !cripto?.authTag) {
      throw this._erro('Metadados de criptografia ausentes.', 500);
    }

    // ── 3. Montar cascade de fontes ──────────────────────────────
    // Os providers ignoram o fileId passado pelo FallbackService e usam
    // o `path` resolvido via metadata (fechamento de variável).
    const p2pProvider = {
      get: (_fid) => this.#baixarDeP2P(path, peers),
    };
    const cacheProvider = {
      get: (_fid) => Promise.resolve(this.#cache?.get(fileId) ?? null),
    };
    const r2Provider = {
      get: (_fid) => this.#r2.getBuffer(path),
    };

    // ── 4. Cascade P2P → Cache → R2 ─────────────────────────────
    const fallback   = new FallbackService({ p2pProvider, cacheProvider, r2Provider });
    const ciphertext = await fallback.download(fileId);

    // ── 5. Popular cache para próximas requisições ───────────────
    if (this.#cache) this.#cache.set(fileId, ciphertext);

    // ── 6. Validar integridade global (anti-tampering) ───────────
    if (integrity_hash) {
      try {
        this.#hash.validateHash(ciphertext, integrity_hash);
      } catch (_) {
        throw this._erro('Integridade do arquivo violada — ciphertext corrompido.', 422);
      }
    }

    // ── 7. Decriptar e retornar plaintext ────────────────────────
    return this.#encryption.decrypt({ data: ciphertext, ...cripto });
  }

  // ══════════════════════════════════════════════════════════════
  // Helper público
  // ══════════════════════════════════════════════════════════════

  /**
   * Retorna a URL pública de um path no R2.
   * Conveniente para montar URLs sem acessar o R2Client diretamente.
   *
   * @param {string} path
   * @returns {string}
   */
  publicUrl(path) {
    return this.#r2.publicUrl(path);
  }

  // ══════════════════════════════════════════════════════════════
  // Internos
  // ══════════════════════════════════════════════════════════════

  /**
   * Tenta baixar um arquivo de um peer P2P selecionado via PeerHealthService.
   * Retorna null (miss) se nenhum peer estiver disponível ou se houver falha,
   * para que o FallbackService avance para a próxima fonte sem retry.
   *
   * @param {string}   path  — chave do arquivo no storage
   * @param {string[]} peers — lista de URLs dos peers candidatos
   * @returns {Promise<Buffer|null>}
   */
  async #baixarDeP2P(path, peers) {
    if (!this.#peerHealth || !this.#p2pDownloader || peers.length === 0) return null;
    try {
      const bestPeer = await this.#peerHealth.getBestPeer(peers);
      return await this.#p2pDownloader.get(path, bestPeer);
    } catch (_) {
      return null; // miss determinístico — FallbackService avança para Cache/R2
    }
  }

  // ── Helpers de roteamento ────────────────────────────────────

  /**
   * Retorna `true` se o contexto usa Supabase Storage (imagens).
   * @param {string} contexto
   */
  #ehSupabase(contexto) {
    return CONTEXTO_BACKEND[contexto] === 'supabase';
  }

  /**
   * Garante que `#supabaseStorage` foi injetado para o contexto de imagem.
   * Lança 500 com mensagem descritiva se não foi injetado.
   * @param {string} contexto
   */
  #garantirSupabaseStorage(contexto) {
    if (!this.#supabaseStorage) {
      throw this._erro(
        `[MediaManager] supabaseStorage não foi injetado (necessário para contexto "${contexto}").`,
        500
      );
    }
  }

  /**
   * Gera um HMAC-SHA256 que vincula path + ownerId + expiresAt.
   * Impede que um token de uma requisição seja reutilizado para outra.
   *
   * @param {string} path
   * @param {string} ownerId
   * @param {number} expiresAt — Unix timestamp (segundos)
   * @returns {string} hex digest
   */
  #assinarToken(path, ownerId, expiresAt) {
    return crypto
      .createHmac('sha256', this.#signingSecret)
      .update(`${path}:${ownerId}:${expiresAt}`)
      .digest('hex');
  }

  /**
   * Retorna os nomes de contexto válidos.
   * @returns {string[]}
   */
  static get contextos() {
    return Object.keys(CONTEXTOS);
  }

  // ══════════════════════════════════════════════════════════════
  // Registro de imagem já processada server-side
  // ══════════════════════════════════════════════════════════════

  /**
   * Persiste em `media_files` os metadados de uma imagem que já foi
   * processada e armazenada externamente (ex: fluxo do ImageProcessor).
   *
   * Usado por MediaController após ImageProcessor + SupabaseStorageClient.upload().
   * Não faz upload — apenas registra.
   *
   * @param {object} params
   * @param {string} params.ownerId     — UUID do usuário autenticado
   * @param {string} params.contexto    — 'avatars' | 'services' | 'portfolio'
   * @param {string} params.path        — chave no bucket (ex: 'avatars/uid/uuid.webp')
   * @param {string} params.publicUrl   — URL pública do arquivo
   * @param {string} params.contentType — MIME type (ex: 'image/webp')
   * @param {number} params.bytes       — tamanho em bytes
   * @returns {Promise<string>} — id do registro criado
   * @throws {Error{status:500}} em falha de banco
   */
  async registrarImagemProcessada({ ownerId, contexto, path, publicUrl, contentType, bytes }) {
    this._uuid('ownerId', ownerId);
    this._enum('contexto', contexto, Object.keys(CONTEXTOS));

    const { data, error } = await this.#supabase
      .from('media_files')
      .insert({
        owner_id:      ownerId,
        contexto,
        path,
        public_url:    publicUrl,
        content_type:  contentType,
        tamanho_bytes: bytes,
        metadata:      { storage_backend: 'supabase' },
      })
      .select('id')
      .single();

    if (error) {
      throw Object.assign(new Error(error.message), { status: 500 });
    }

    return data.id;
  }
}

module.exports = MediaManager;
