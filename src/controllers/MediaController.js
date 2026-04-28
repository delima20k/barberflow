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

module.exports = criarMediaController;
