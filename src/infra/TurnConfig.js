'use strict';

// =============================================================
// TurnConfig.js — Geração de credenciais TURN + configuração ICE.
// Camada: infra
//
// RESPONSABILIDADE:
//   Gerar credenciais TURN temporárias com HMAC-SHA1 (compatível com
//   coturn --use-auth-secret) e montar a lista de ICE servers para
//   RTCPeerConnection no frontend.
//
// SEGURANÇA:
//   - Credenciais expiram em 1 hora (timestamp no username)
//   - Nenhuma senha de longo prazo exposta ao cliente
//   - TURN_SECRET nunca sai do servidor
//
// FORMATO COTURN (use-auth-secret):
//   username  = "{timestamp}:{userId}"
//   credential = Base64(HMAC-SHA1(TURN_SECRET, username))
//   O coturn valida recalculando o HMAC com o mesmo secret.
//
// VARIÁVEIS DE AMBIENTE:
//   TURN_URL    — ex: turn:turn.meuservidor.com:3478 (obrigatório em produção)
//   TURNS_URL   — ex: turns:turn.meuservidor.com:5349 (opcional, TLS)
//   TURN_SECRET — secret compartilhado com o coturn (obrigatório em produção)
//   STUN_URL    — ex: stun:stun.cloudflare.com:3478 (padrão se não definido)
//
// USO:
//   const config = TurnConfig.servidoresICE(userId);
//   // Retorna: { iceServers: [...] }
//   // Passar diretamente ao RTCPeerConnection({ iceServers: config.iceServers })
//
// NOTA DE PRODUÇÃO:
//   Sem TURN configurado, peers atrás de NAT simétrico (~15% dos casos)
//   não conseguirão estabelecer conexão. Configure um servidor coturn
//   e defina TURN_URL + TURN_SECRET antes de habilitar P2P em produção.
// =============================================================

const crypto = require('node:crypto');

class TurnConfig {

  /** @type {string} */
  static #TURN_URL    = process.env.TURN_URL  ?? '';
  /** @type {string} */
  static #TURNS_URL   = process.env.TURNS_URL ?? '';
  /** @type {string} */
  static #TURN_SECRET = process.env.TURN_SECRET ?? '';
  /** @type {string} */
  static #STUN_URL    = process.env.STUN_URL ?? 'stun:stun.cloudflare.com:3478';

  /** Validade das credenciais TURN em segundos (1 hora). */
  static #TTL_SECS = 3600;

  // ══════════════════════════════════════════════════════════════
  // Público
  // ══════════════════════════════════════════════════════════════

  /**
   * Monta a lista de ICE servers com credenciais TURN efêmeras.
   * Sempre inclui STUN como primeiro servidor (zero custo, sem auth).
   * Inclui TURN apenas se TURN_URL e TURN_SECRET estiverem configurados.
   *
   * @param {string} userId — UUID do usuário autenticado (compõe o username TURN)
   * @returns {{ iceServers: object[], expiresAt: number }}
   *   iceServers — array pronto para RTCPeerConnection({ iceServers })
   *   expiresAt  — timestamp Unix (ms) de expiração das credenciais TURN
   */
  static servidoresICE(userId) {
    const iceServers = [
      // STUN sempre presente — resolve candidatos host/srflx, zero custo
      { urls: TurnConfig.#STUN_URL },
    ];

    if (TurnConfig.#TURN_URL && TurnConfig.#TURN_SECRET) {
      const { username, credential } = TurnConfig.credenciais(userId);
      iceServers.push({ urls: TurnConfig.#TURN_URL, username, credential });
      if (TurnConfig.#TURNS_URL) {
        // TURNS (TLS) melhora NAT traversal em redes corporativas restritivas
        iceServers.push({ urls: TurnConfig.#TURNS_URL, username, credential });
      }
    }

    const expiresAt = (Math.floor(Date.now() / 1000) + TurnConfig.#TTL_SECS) * 1000;
    return { iceServers, expiresAt };
  }

  /**
   * Gera credenciais TURN temporárias HMAC-SHA1 (coturn use-auth-secret).
   *
   * Formato coturn:
   *   username  = "{expires_timestamp}:{userId}"
   *   credential = Base64(HMAC-SHA1(TURN_SECRET, username))
   *
   * O timestamp no username é validado pelo coturn — credenciais expiradas
   * são rejeitadas automaticamente pelo servidor.
   *
   * @param {string} userId
   * @returns {{ username: string, credential: string }}
   * @throws {Error} se TURN_SECRET não estiver configurado
   */
  static credenciais(userId) {
    const secret = TurnConfig.#TURN_SECRET;
    if (!secret) {
      throw Object.assign(
        new Error('[TurnConfig] TURN_SECRET não configurado. Defina a variável de ambiente.'),
        { status: 503 }
      );
    }

    const expires    = Math.floor(Date.now() / 1000) + TurnConfig.#TTL_SECS;
    const username   = `${expires}:${userId}`;
    const credential = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');

    return { username, credential };
  }
}

module.exports = TurnConfig;
