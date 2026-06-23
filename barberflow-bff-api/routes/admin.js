'use strict';

// ============================================================
// admin.js — Rotas da dashboard administrativa no BFF.
//
// Rotas públicas (sem token):
//   POST /api/v1/admin/login                    — autenticação (rate limit 5/min)
//
// Rotas protegidas por ADMIN_INGEST_TOKEN (env var):
//   POST   /api/v1/admin/ingest-audio/upload    — recebe 1 MP3, processa (35s+AAC) e sobe ao R2
//   POST   /api/v1/admin/ingest-audio/catalog   — gera catalog.json no R2 com a lista de faixas
//
// Rotas protegidas por JWT admin (AdminAuthMiddleware):
//   GET    /api/v1/admin/totais                 — contagens globais
//   GET    /api/v1/admin/usuarios               — listar usuários
//   POST   /api/v1/admin/usuarios               — criar usuário
//   DELETE /api/v1/admin/usuarios/:id           — excluir usuário
//   POST   /api/v1/admin/barbeiros              — criar barbeiro
//   DELETE /api/v1/admin/barbeiros/:id          — excluir barbeiro
//   GET    /api/v1/admin/financeiro             — listar subscriptions
//   PATCH  /api/v1/admin/financeiro/:id         — atualizar subscription
// ============================================================

const crypto = require('node:crypto');

const { Router }  = require('express');
const express     = require('express');
const rateLimit   = require('express-rate-limit');

const AdminAuthMiddleware = require('../middlewares/adminAuth');
const AdminService        = require('../application/admin/AdminService');
const AdminRepository     = require('../repositories/AdminRepository');

const { AudioTrackNameParser }     = require('../application/stories/audio/AudioTrackNameParser');
const { GenreClassifier }          = require('../application/stories/audio/GenreClassifier');
const { StoryAudioR2Pather }       = require('../application/stories/audio/StoryAudioR2Pather');
const { StoryAudioCatalogBuilder } = require('../application/stories/audio/StoryAudioCatalogBuilder');
// MusicProcessingService usa ffmpeg-static — importado lazy (só quando necessário)

// Rate limit extra em login: 5 tentativas por minuto por IP
const loginLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { ok: false, error: 'Muitas tentativas de login. Aguarde 1 minuto.' },
});

// Middleware de auth para os endpoints de ingest (usa ADMIN_INGEST_TOKEN, não JWT).
function _ingestAuth(req, res, next) {
  const token = process.env.ADMIN_INGEST_TOKEN;
  const tok = (process.env.ADMIN_INGEST_TOKEN ?? '').trim();
  if (!tok) return res.status(503).json({ ok: false, error: 'ADMIN_INGEST_TOKEN não configurado no servidor.' });
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  const tokBuf = Buffer.from(tok);
  const berBuf = Buffer.from(bearer);
  // timingSafeEqual exige buffers do mesmo tamanho; comprimentos diferentes = inválido
  if (tokBuf.length !== berBuf.length || !crypto.timingSafeEqual(tokBuf, berBuf)) {
    return res.status(401).json({ ok: false, error: 'Token de ingest inválido.' });
  }
  next();
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('express').Router}
 */
module.exports = function criarAdminRoute(db) {
  const router  = Router();
  const repo    = new AdminRepository(db);
  const service = new AdminService(repo);

  // ── POST /login ──────────────────────────────────────────────
  // Pública. Rate-limited. Retorna token JWT de admin (4h).
  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const { email, senha } = req.body ?? {};
      const resultado = await service.login(email, senha);
      res.json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /ingest-audio/upload ─────────────────────────────────
  // Auth: Bearer {ADMIN_INGEST_TOKEN}.
  // Recebe 1 arquivo de áudio já processado (AAC, ≤2MB) via body binário.
  // Header obrigatório: X-Filename (nome original do MP3 — usado para metadados).
  // Header opcional:   X-Preprocessed: true — indica que o arquivo já foi
  //   processado (trim 35s + AAC) pelo cliente; a BFF só armazena no R2.
  // Aceita qualquer Content-Type de áudio binário.
  router.post(
    '/ingest-audio/upload',
    _ingestAuth,
    express.raw({ type: () => true, limit: '5mb' }),
    async (req, res, next) => {
      try {
        const filename = String(req.headers['x-filename'] || '').trim();
        if (!filename) return res.status(400).json({ ok: false, error: 'Header X-Filename obrigatório.' });
        if (!Buffer.isBuffer(req.body) || !req.body.length) {
          return res.status(400).json({ ok: false, error: 'Body vazio.' });
        }

        const parsed   = AudioTrackNameParser.parse(filename);
        const genre    = GenreClassifier.classificar(parsed);
        const hash     = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 8);
        const music_id = `${StoryAudioR2Pather.slug(parsed.name)}-${hash}`;

        // Se o cliente já processou, armazenamos direto; caso contrário, processamos aqui.
        const preprocessed = req.headers['x-preprocessed'] === 'true';
        const contentType  = req.headers['content-type'] || 'audio/mp4';
        const ext          = contentType.includes('mpeg') ? 'mp3' : 'm4a';

        let audioBytes, audioContentType, audioExt, audioSize;
        if (preprocessed) {
          audioBytes       = req.body;
          audioContentType = contentType;
          audioExt         = ext;
          audioSize        = req.body.length;
        } else {
          const { MusicProcessingService } = require('../infrastructure/media/MusicProcessingService');
          const processor  = new MusicProcessingService();
          const result     = await processor.process(req.body, { maxSeconds: 35, targetKbps: 80 });
          audioBytes       = result.bytes;
          audioContentType = result.contentType;
          audioExt         = result.ext;
          audioSize        = result.outputBytes;
        }

        const key = StoryAudioR2Pather.keyFor({ genre, musicId: music_id, ext: audioExt });
        const R2Client = require('../../src/infra/R2Client');
        const r2 = R2Client.getInstance();
        await r2.putBuffer(key, audioBytes, audioContentType);

        return res.json({
          ok: true,
          dados: {
            music_id,
            music_name: parsed.name,
            artist:     parsed.artist,
            genre,
            ext:        audioExt,
            size:       audioSize,
            url:        r2.publicUrl(key),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── POST /ingest-audio/catalog ────────────────────────────────
  // Auth: Bearer {ADMIN_INGEST_TOKEN}.
  // Recebe a lista de faixas do /upload e gera o catalog.json no R2.
  router.post('/ingest-audio/catalog', _ingestAuth, async (req, res, next) => {
    try {
      const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
      if (!tracks.length) return res.status(400).json({ ok: false, error: 'Lista de faixas vazia.' });

      const catalogo = StoryAudioCatalogBuilder.montar(tracks);
      const catKey   = StoryAudioR2Pather.catalogKey();

      const R2Client = require('../../src/infra/R2Client');
      await R2Client.getInstance().putBuffer(
        catKey,
        Buffer.from(JSON.stringify(catalogo)),
        'application/json',
      );

      return res.json({ ok: true, dados: { count: catalogo.count, catalogKey: catKey } });
    } catch (err) {
      next(err);
    }
  });

  // ── Rotas protegidas — exigem token JWT admin ────────────────
  router.use(AdminAuthMiddleware.verificar);

  // ── GET /totais ──────────────────────────────────────────────
  router.get('/totais', async (_req, res, next) => {
    try {
      const dados = await service.getTotais();
      res.json({ ok: true, dados });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /usuarios ─────────────────────────────────────────────
  router.get('/usuarios', async (req, res, next) => {
    try {
      const dados = await service.listarUsuarios(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /usuarios ────────────────────────────────────────────
  router.post('/usuarios', async (req, res, next) => {
    try {
      const resultado = await service.criarUsuario(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /usuarios/:id ──────────────────────────────────────
  router.delete('/usuarios/:id', async (req, res, next) => {
    try {
      await service.excluirUsuario(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /barbeiros ───────────────────────────────────────────
  router.post('/barbeiros', async (req, res, next) => {
    try {
      const resultado = await service.criarBarbeiro(req.body ?? {});
      res.status(201).json({ ok: true, ...resultado });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /barbeiros/:id ─────────────────────────────────────
  router.delete('/barbeiros/:id', async (req, res, next) => {
    try {
      await service.excluirBarbeiro(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /financeiro ───────────────────────────────────────────
  router.get('/financeiro', async (req, res, next) => {
    try {
      const dados = await service.listarFinanceiro(req.query);
      res.json({ ok: true, dados, total: dados.length });
    } catch (err) {
      next(err);
    }
  });

  // ── PATCH /financeiro/:id ─────────────────────────────────────
  router.patch('/financeiro/:id', async (req, res, next) => {
    try {
      const dados = await service.atualizarPlano(req.params.id, req.body ?? {});
      res.json({ ok: true, dados });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
