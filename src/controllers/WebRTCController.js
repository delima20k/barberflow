'use strict';

// =============================================================
// WebRTCController.js — Rotas Express para /api/p2p.
// Camada: interfaces
//
// Rotas (todas protegidas via AuthMiddleware.verificar):
//
//   POST  /api/p2p/announce
//     Anuncia que o usuário tem um mediaId em cache e está
//     disponível como peer para redistribuição P2P.
//     Body: { mediaId, peerId, region? }
//     TTL: 5 minutos (expiresAt = NOW() + 5min)
//     Rate limit: 30 anúncios por minuto por usuário
//     Resposta: { ok: true, peerId, expiresAt }
//
//   GET   /api/p2p/peers/:mediaId
//     Lista peers ativos que possuem o mediaId em cache.
//     Exclui o próprio usuário autenticado.
//     Resposta: { ok: true, peers: [{ peerId, region }] }
//
//   GET   /api/p2p/ice-config
//     Retorna a configuração ICE (STUN + credenciais TURN efêmeras).
//     Credenciais TURN expiram em 1 hora (HMAC-SHA1, coturn-compat).
//     Resposta: { ok: true, iceServers, expiresAt }
//
// SEGURANÇA:
//   - Todos os endpoints exigem JWT válido (AuthMiddleware.verificar)
//   - Rate limit específico para announce (proteção contra abuso)
//   - peerId é validado como UUID v4 (evita injeção)
//   - mediaId tem comprimento máximo de 255 chars (evita payload oversized)
//   - TURN_SECRET nunca exposto — apenas credenciais efêmeras
// =============================================================

const { Router }         = require('express');
const AuthMiddleware     = require('../infra/AuthMiddleware');
const RateLimitMiddleware = require('../infra/RateLimitMiddleware');
const TurnConfig         = require('../infra/TurnConfig');

/** TTL de um anúncio de peer em milissegundos (5 minutos). */
const PEER_TTL_MS = 5 * 60 * 1000;

/** Comprimento máximo de mediaId (segurança contra payload oversized). */
const MAX_MEDIA_ID_LEN = 255;

/** Regex para UUID v4 (validação de peerId). */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {import('express').Router}
 */
function criarWebRTCController(supabase) {
  const router = Router();

  // Todas as rotas P2P exigem autenticação
  router.use(AuthMiddleware.verificar);

  // ── POST /api/p2p/announce ────────────────────────────────────
  // Registra o usuário como peer disponível para um mediaId.
  // Limita a 30 anúncios/minuto para evitar abuso de tabela.
  router.post('/announce',
    RateLimitMiddleware.p2pAnnounce,
    async (req, res) => {
      try {
        const userId  = req.user.id;
        const { mediaId, peerId, region = '' } = req.body ?? {};

        // ── Validações de entrada ─────────────────────────────────
        if (!mediaId || typeof mediaId !== 'string' || mediaId.length > MAX_MEDIA_ID_LEN) {
          return res.status(400).json({ ok: false, error: 'mediaId inválido ou ausente.' });
        }
        if (!peerId || !RE_UUID.test(peerId)) {
          return res.status(400).json({ ok: false, error: 'peerId deve ser um UUID v4 válido.' });
        }

        const expiresAt = new Date(Date.now() + PEER_TTL_MS).toISOString();

        // Upsert por (media_id, user_id) — renova TTL se já anunciado
        const { error } = await supabase
          .from('p2p_peers')
          .upsert(
            { media_id: mediaId, peer_id: peerId, user_id: userId, region: region.slice(0, 64), expires_at: expiresAt },
            { onConflict: 'media_id,user_id' }
          );

        if (error) throw Object.assign(new Error(error.message), { status: 500 });

        res.status(201).json({ ok: true, peerId, expiresAt });
      } catch (err) {
        res.status(err.status ?? 500).json({ ok: false, error: err.message });
      }
    }
  );

  // ── GET /api/p2p/peers/:mediaId ───────────────────────────────
  // Lista peers ativos para redistribuição do mediaId.
  // Exclui o próprio usuário (não faz sentido conectar consigo mesmo).
  router.get('/peers/:mediaId', async (req, res) => {
    try {
      const userId  = req.user.id;
      const mediaId = req.params.mediaId;

      if (!mediaId || mediaId.length > MAX_MEDIA_ID_LEN) {
        return res.status(400).json({ ok: false, error: 'mediaId inválido.' });
      }

      const agora = new Date().toISOString();

      const { data, error } = await supabase
        .from('p2p_peers')
        .select('peer_id, region')
        .eq('media_id', mediaId)
        .neq('user_id', userId)
        .gt('expires_at', agora)
        .limit(10); // máx 10 peers retornados por consulta

      if (error) throw Object.assign(new Error(error.message), { status: 500 });

      const peers = (data ?? []).map(r => ({ peerId: r.peer_id, region: r.region }));
      res.json({ ok: true, peers });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  // ── GET /api/p2p/ice-config ───────────────────────────────────
  // Retorna configuração ICE com credenciais TURN efêmeras.
  // As credenciais são geradas especificamente para o usuário autenticado.
  router.get('/ice-config', (req, res) => {
    try {
      const { iceServers, expiresAt } = TurnConfig.servidoresICE(req.user.id);
      res.json({ ok: true, iceServers, expiresAt });
    } catch (err) {
      res.status(err.status ?? 500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = criarWebRTCController;
