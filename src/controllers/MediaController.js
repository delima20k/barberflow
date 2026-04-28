'use strict';

// =============================================================
// MediaController.js — Rotas Express para /api/media.
// Camada: interfaces
//
// Rotas (todas protegidas via AuthMiddleware.verificar):
//
//   POST   /api/media/presigned
//     Etapa 1 do fluxo P2P: gera URL de upload direto ao R2.
//     Body: { contexto, contentType }
//     Resposta: { uploadUrl, path, publicUrl, token, expiresAt }
//
//   POST   /api/media/confirmar
//     Etapa 2 do fluxo P2P: confirma upload + salva metadados.
//     Body: { path, contexto, token, expiresAt, metadata? }
//     Resposta: { id, path, publicUrl, tamanhoBytes }
//
//   POST   /api/media/upload-image
//     Upload server-side com otimização automática de imagem.
//     Body: application/octet-stream (buffer binário)
//     Query: ?contexto=avatars|services|portfolio
//     Resposta: { ok: true, id, publicUrl, bytes, format }
//     Contextos de barbearia (logo, cover) são RECUSADOS (400).
//
//   POST   /api/media/barbershop-image
//     Upload de imagem de barbearia SEM processamento (manter original).
//     Body: application/octet-stream (buffer binário)
//     Query: ?tipo=logo|cover|banner
//     Bucket: media-barbershop (separado de media-images).
//     Resposta: { ok: true, id, publicUrl, bytes, tipo }
//
//   DELETE /api/media/:id
//     Remove arquivo do storage e registro de metadados.
//     Resposta: { ok: true }
//
//   GET    /api/media/:contexto
//     Lista arquivos do usuário autenticado em um contexto.
//     Resposta: { ok: true, items: [...] }
// =============================================================

const crypto         = require('node:crypto');
const { Router }     = require('express');
const AuthMiddleware = require('../infra/AuthMiddleware');

/**
 * Contextos cujas imagens NÃO passam pelo ImageProcessor.
 * Barbearias gerenciam suas próprias imagens via fluxo dedicado.
 * @type {Set<string>}
 */
const CONTEXTOS_BARBEARIA = new Set(['barbearia', 'cover', 'logo', 'barbershop']);

/** Bucket Supabase Storage para imagens de barbearia (sem processamento). */
const BUCKET_BARBERSHOP = 'media-barbershop';
/**
 * @param {import('../services/MediaManager')}          mediaManager
 * @param {import('../services/ImageProcessor')|null}   [imageProcessor]
 * @param {import('../infra/SupabaseStorageClient')|null} [supabaseStorage]
 * @returns {import('express').Router}
 */
function criarMediaController(mediaManager, imageProcessor = null, supabaseStorage = null) {
  const router = Router();

  // Todas as rotas de mídia exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── POST /api/media/presigned ─────────────────────────────────
  // Etapa 1 do P2P: gera URL presigned para upload direto ao R2.
  // O arquivo não passa pelo servidor.
  router.post('/presigned', async (req, res) => {
    try {
      const ownerId     = req.user.id;
      const { contexto, contentType } = req.body ?? {};

      const resultado = await mediaManager.gerarUrlPresigned({
        contexto,
        ownerId,
        contentType,
      });

      res.json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/media/confirmar ─────────────────────────────────
  // Etapa 2 do P2P: confirma que o upload ocorreu e persiste metadados.
  router.post('/confirmar', async (req, res) => {
    try {
      const ownerId = req.user.id;
      const { path, contexto, token, expiresAt, metadata } = req.body ?? {};

      const resultado = await mediaManager.confirmarUpload({
        path,
        ownerId,
        contexto,
        token,
        expiresAt: typeof expiresAt === 'number' ? expiresAt : Number(expiresAt),
        metadata:  metadata ?? {},
      });

      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── POST /api/media/upload-image ─────────────────────────────
  // Upload server-side com otimização automática de imagem.
  // Body: application/octet-stream (buffer binário da imagem)
  // Query: ?contexto=avatars|services|portfolio
  //
  // Contextos de barbearia (logo, cover) são RECUSADOS — use endpoint dedicado.
  // Requer imageProcessor e supabaseStorage injetados no controller.
  //
  // Fluxo:
  //   1. Validar contexto (não pode ser barbearia)
  //   2. Ler body como buffer raw (express.raw local)
  //   3. Processar: ImageProcessor.processAvatar() ou processIcon()
  //   4. Upload para Supabase Storage: SupabaseStorageClient.upload()
  //   5. Insert em media_files com storage_backend = 'supabase'
  //   6. Retornar { id, publicUrl, bytes, format }
  router.post('/upload-image',
    // Parser local — evita sobrescrever o parser JSON global
    (req, res, next) => {
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('application/octet-stream')) {
        let chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end',  () => { req.body = Buffer.concat(chunks); next(); });
        req.on('error', next);
      } else {
        next();
      }
    },
    async (req, res) => {
      try {
        if (!imageProcessor || !supabaseStorage) {
          return res.status(503).json({
            ok:    false,
            error: 'Serviço de processamento de imagens não disponível.',
          });
        }

        const ownerId  = req.user.id;
        const contexto = req.query.contexto ?? '';

        // ── Guard: bloqueia imagens de barbearia ──────────────────
        if (!contexto || CONTEXTOS_BARBEARIA.has(contexto)) {
          return res.status(400).json({
            ok:    false,
            error: `Contexto "${contexto}" não é permitido neste endpoint. Use o fluxo dedicado de barbearia.`,
          });
        }

        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({
            ok:    false,
            error: 'Body deve ser um buffer binário (application/octet-stream) não vazio.',
          });
        }

        // ── Processar imagem ──────────────────────────────────────
        const processado = contexto === 'avatars'
          ? await imageProcessor.processAvatar(buffer)
          : await imageProcessor.processIcon(buffer);

        // ── Upload para Supabase Storage ──────────────────────────
        const ext         = processado.format === 'webp' ? 'webp' : 'jpg';
        const mimeType    = processado.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const path        = `${contexto}/${ownerId}/${crypto.randomUUID()}.${ext}`;
        const bucket      = 'media-images';

        await supabaseStorage.upload(bucket, path, processado.data, mimeType);
        const publicUrl = supabaseStorage.publicUrl(bucket, path);

        // ── Persistir metadados via MediaManager ──────────────────
        const id = await mediaManager.registrarImagemProcessada({
          ownerId,
          contexto,
          path,
          publicUrl,
          contentType: mimeType,
          bytes:       processado.bytes,
        });

        res.status(201).json({
          ok: true,
          id,
          publicUrl,
          bytes:  processado.bytes,
          format: processado.format,
        });
      } catch (err) {
        res.status(err.status ?? 500).json({ ok: false, error: err.message });
      }
    }
  );

  // ── POST /api/media/barbershop-image ──────────────────────────
  // Upload de imagem de barbearia SEM processamento server-side.
  // Mantém o arquivo original — sem crop, resize ou strip de EXIF.
  // Body: application/octet-stream (buffer binário da imagem)
  // Query: ?tipo=logo|cover|banner
  //
  // Limites por tipo:
  //   logo   → ≤2MB, apenas imagens
  //   cover  → ≤5MB, apenas imagens
  //   banner → ≤5MB, apenas imagens
  //
  // Bucket: media-barbershop (separado de media-images)
  // Path:   {tipo}/{ownerId}/{uuid}.{ext}
  // RLS:    owner check via split_part(name, '/', 2)
  router.post('/barbershop-image',
    (req, res, next) => {
      const contentType = req.headers['content-type'] ?? '';
      if (contentType.includes('application/octet-stream')) {
        const chunks = [];
        req.on('data',  (chunk) => chunks.push(chunk));
        req.on('end',   () => { req.body = Buffer.concat(chunks); next(); });
        req.on('error', next);
      } else {
        next();
      }
    },
    async (req, res) => {
      try {
        if (!supabaseStorage) {
          return res.status(503).json({ ok: false, error: 'Storage de barbearia não disponível.' });
        }

        const ownerId = req.user.id;
        const tipo    = req.query.tipo ?? '';

        // ── Validar tipo ──────────────────────────────────────────
        const TIPOS_VALIDOS     = new Set(['logo', 'cover', 'banner']);
        const LIMITE_POR_TIPO   = { logo: 2 * 1024 * 1024, cover: 5 * 1024 * 1024, banner: 5 * 1024 * 1024 };
        const MIMES_PERMITIDOS  = new Set(['image/jpeg', 'image/png', 'image/webp']);

        if (!TIPOS_VALIDOS.has(tipo)) {
          return res.status(400).json({
            ok: false,
            error: `Tipo "${tipo}" inválido. Use: logo, cover ou banner.`,
          });
        }

        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ ok: false, error: 'Body deve ser application/octet-stream não vazio.' });
        }

        // ── Detectar MIME pelo magic bytes ────────────────────────
        const mimeType = _detectarMime(buffer);
        if (!MIMES_PERMITIDOS.has(mimeType)) {
          return res.status(415).json({
            ok: false,
            error: `Tipo de arquivo não suportado. Use: JPEG, PNG ou WebP.`,
          });
        }

        const limite = LIMITE_POR_TIPO[tipo];
        if (buffer.length > limite) {
          return res.status(413).json({
            ok: false,
            error: `Arquivo excede o limite de ${limite / 1024 / 1024}MB para "${tipo}".`,
          });
        }

        // ── Upload para bucket media-barbershop ───────────────────
        const ext    = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
        const path   = `${tipo}/${ownerId}/${crypto.randomUUID()}.${ext}`;
        const bucket = BUCKET_BARBERSHOP;

        await supabaseStorage.upload(bucket, path, buffer, mimeType);
        const publicUrl = supabaseStorage.publicUrl(bucket, path);

        // ── Persistir metadados ───────────────────────────────────
        const id = await mediaManager.registrarImagemProcessada({
          ownerId,
          contexto:    tipo,
          path,
          publicUrl,
          contentType: mimeType,
          bytes:       buffer.length,
        });

        res.status(201).json({ ok: true, id, publicUrl, bytes: buffer.length, tipo });
      } catch (err) {
        res.status(err.status ?? 500).json({ ok: false, error: err.message });
      }
    }
  );

  // ── DELETE /api/media/:id ─────────────────────────────────────
  // Remove o arquivo do storage e o registro de metadados.
  router.delete('/:id', async (req, res) => {
    try {
      const ownerId = req.user.id;
      const mediaId = req.params.id;

      await mediaManager.deletar(mediaId, ownerId);
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/media/:contexto ──────────────────────────────────
  // Lista todos os arquivos do usuário em um contexto.
  router.get('/:contexto', async (req, res) => {
    try {
      const ownerId  = req.user.id;
      const contexto = req.params.contexto;

      const items = await mediaManager.listar(contexto, ownerId);
      res.json({ ok: true, items });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

// ── Constantes estáticas (acessíveis externamente para testes) ──
/** @readonly */
criarMediaController.BUCKET_BARBERSHOP = BUCKET_BARBERSHOP;
/** @readonly */
criarMediaController.detectarMime = _detectarMime;

/**
 * Detecta o MIME type de uma imagem pelos magic bytes.
 * Evita depender do Content-Type do cliente (não confiável).
 * @param {Buffer} buf
 * @returns {'image/jpeg'|'image/png'|'image/webp'|'application/octet-stream'}
 */
function _detectarMime(buf) {
  if (buf.length < 12) return 'application/octet-stream';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

module.exports = criarMediaController;
