'use strict';

const { Router } = require('express');
const AuthMiddleware = require('../middlewares/auth');

/**
 * Rota P2P — ICE configuration para WebRTC.
 *
 * Retorna servidores STUN públicos.
 * TURN (relay) requer servidor dedicado com credenciais — não configurado.
 * Sem TURN, P2P só funciona em redes sem NAT restritivo (conexão direta).
 */
module.exports = function criarP2PRoute() {
  const router = Router();

  router.get('/ice-config', AuthMiddleware.verificar, (_req, res) => {
    res.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
  });

  return router;
};
