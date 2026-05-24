'use strict';

// @deprecated Stack legado. Equivalente BFF: barberflow-bff-api/routes/media.js
// NÃO adicionar novas rotas aqui. Usar barberflow-bff-api/.

// =============================================================
// MediaUploadController.js — Handlers de upload binário de imagens.
// Extraído de MediaController.js para reduzir o god file.
//
// Exporta:
//   rawBodyParser        — middleware que lê octet-stream como Buffer
//   detectarMime         — detecta MIME pelos magic bytes
//   handleUploadImage    — factory de handler para POST /upload-image
//   handleBarbershopImage — factory de handler para POST /barbershop-image
//   BUCKET_BARBERSHOP    — nome do bucket de barbearia
//   CONTEXTOS_BARBEARIA  — Set de contextos reservados para barbearia
// =============================================================

const crypto = require('node:crypto');

const BUCKET_BARBERSHOP   = 'media-barbershop';
const CONTEXTOS_BARBEARIA = new Set(['barbearia', 'cover', 'logo', 'barbershop']);

const TIPOS_BARBERSHOP_VALIDOS  = new Set(['logo', 'cover', 'banner']);
const LIMITE_POR_TIPO = { logo: 2 * 1024 * 1024, cover: 5 * 1024 * 1024, banner: 5 * 1024 * 1024 };
const MIMES_PERMITIDOS          = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ── Middleware compartilhado ──────────────────────────────────────────────────

/**
 * Lê body application/octet-stream como Buffer.
 * Ignora outros content-types e passa para o próximo middleware.
 * @type {import('express').RequestHandler}
 */
function rawBodyParser(req, res, next) {
  const ct = req.headers['content-type'] ?? '';
  if (!ct.includes('application/octet-stream')) return next();
  const chunks = [];
  req.on('data',  (chunk) => chunks.push(chunk));
  req.on('end',   () => { req.body = Buffer.concat(chunks); next(); });
  req.on('error', next);
}

// ── Detecção de MIME ──────────────────────────────────────────────────────────

/**
 * Detecta MIME type de imagem pelos magic bytes.
 * Nunca confia no Content-Type enviado pelo cliente.
 * @param {Buffer} buf
 * @returns {'image/jpeg'|'image/png'|'image/webp'|'application/octet-stream'}
 */
function detectarMime(buf) {
  if (buf.length < 12) return 'application/octet-stream';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'application/octet-stream';
}

// ── Handler: POST /api/media/upload-image ─────────────────────────────────────

/**
 * Factory do handler de upload server-side com processamento de imagem.
 * Retorna array [rawBodyParser, handlerAsync] para montar no router.
 *
 * @param {import('../services/ImageProcessor')|null}       imageProcessor
 * @param {import('../infra/SupabaseStorageClient')|null}   supabaseStorage
 * @param {import('../services/MediaManager')}              mediaManager
 * @returns {import('express').RequestHandler[]}
 */
function handleUploadImage(imageProcessor, supabaseStorage, mediaManager) {
  return [
    rawBodyParser,
    async (req, res) => {
      try {
        if (!imageProcessor || !supabaseStorage) {
          return res.status(503).json({
            ok: false,
            error: 'Serviço de processamento de imagens não disponível.',
          });
        }

        const ownerId  = req.user.id;
        const contexto = req.query.contexto ?? '';

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

        const processado = contexto === 'avatars'
          ? await imageProcessor.processAvatar(buffer)
          : await imageProcessor.processIcon(buffer);

        const ext       = processado.format === 'webp' ? 'webp' : 'jpg';
        const mimeType  = processado.format === 'webp' ? 'image/webp' : 'image/jpeg';
        const path      = `${contexto}/${ownerId}/${crypto.randomUUID()}.${ext}`;
        const bucket    = 'media-images';

        await supabaseStorage.upload(bucket, path, processado.data, mimeType);
        const publicUrl = supabaseStorage.publicUrl(bucket, path);

        const id = await mediaManager.registrarImagemProcessada({
          ownerId, contexto, path, publicUrl,
          contentType: mimeType,
          bytes: processado.bytes,
        });

        res.status(201).json({ ok: true, id, publicUrl, bytes: processado.bytes, format: processado.format });
      } catch (err) {
        res.status(err.status ?? 500).json({ ok: false, error: err.message });
      }
    },
  ];
}

// ── Handler: POST /api/media/barbershop-image ─────────────────────────────────

/**
 * Factory do handler de upload de imagem de barbearia SEM processamento.
 * Retorna array [rawBodyParser, handlerAsync] para montar no router.
 *
 * @param {import('../infra/SupabaseStorageClient')|null} supabaseStorage
 * @param {import('../services/MediaManager')}            mediaManager
 * @returns {import('express').RequestHandler[]}
 */
function handleBarbershopImage(supabaseStorage, mediaManager) {
  return [
    rawBodyParser,
    async (req, res) => {
      try {
        if (!supabaseStorage) {
          return res.status(503).json({ ok: false, error: 'Storage de barbearia não disponível.' });
        }

        const ownerId = req.user.id;
        const tipo    = req.query.tipo ?? '';

        if (!TIPOS_BARBERSHOP_VALIDOS.has(tipo)) {
          return res.status(400).json({
            ok:    false,
            error: `Tipo "${tipo}" inválido. Use: logo, cover ou banner.`,
          });
        }

        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res.status(400).json({ ok: false, error: 'Body deve ser application/octet-stream não vazio.' });
        }

        const mimeType = detectarMime(buffer);
        if (!MIMES_PERMITIDOS.has(mimeType)) {
          return res.status(415).json({
            ok:    false,
            error: 'Tipo de arquivo não suportado. Use: JPEG, PNG ou WebP.',
          });
        }

        const limite = LIMITE_POR_TIPO[tipo];
        if (buffer.length > limite) {
          return res.status(413).json({
            ok:    false,
            error: `Arquivo excede o limite de ${limite / 1024 / 1024}MB para "${tipo}".`,
          });
        }

        const ext     = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
        const path    = `${tipo}/${ownerId}/${crypto.randomUUID()}.${ext}`;

        await supabaseStorage.upload(BUCKET_BARBERSHOP, path, buffer, mimeType);
        const publicUrl = supabaseStorage.publicUrl(BUCKET_BARBERSHOP, path);

        const id = await mediaManager.registrarImagemProcessada({
          ownerId, contexto: tipo, path, publicUrl,
          contentType: mimeType,
          bytes: buffer.length,
        });

        res.status(201).json({ ok: true, id, publicUrl, bytes: buffer.length, tipo });
      } catch (err) {
        res.status(err.status ?? 500).json({ ok: false, error: err.message });
      }
    },
  ];
}

module.exports = {
  rawBodyParser,
  detectarMime,
  handleUploadImage,
  handleBarbershopImage,
  BUCKET_BARBERSHOP,
  CONTEXTOS_BARBEARIA,
};
