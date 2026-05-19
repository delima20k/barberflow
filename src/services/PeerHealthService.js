'use strict';

// =============================================================
// PeerHealthService.js — Saúde e seleção de peers P2P.
// Camada: application
//
// RESPONSABILIDADE ÚNICA:
//   Medir a latência de peers P2P e selecionar o mais rápido
//   disponível para download, ignorando peers offline ou lentos.
//
// COMO FUNCIONA:
//   isAvailable(peerId)     — envia um probe ao peer via probeProvider
//                             e retorna true se responder dentro do timeout.
//   getBestPeer(peers[])    — sonda todos os peers em paralelo e retorna
//                             o de menor latência que esteja disponível.
//
// POLÍTICA DE SAÚDE:
//   - Peer offline (probe lança ou não responde) → indisponível
//   - Peer lento  (latência ≥ slowThreshold ms)  → ignorado por getBestPeer
//   - Peer rápido (latência < slowThreshold ms)  → elegível; o mais rápido vence
//   - Nenhum peer elegível                       → Error{status:503}
//
// PROBE PROVIDER (injetável):
//   Interface: { probe(peerId: string): Promise<void> }
//   - Deve resolver em ≤ timeout ms se o peer estiver saudável.
//   - Deve lançar ou resolver após timeout se o peer estiver offline/lento.
//   - Padrão: HttpProbeProvider (GET /health com AbortController).
//
// CONFIGURAÇÃO:
//   timeout      (ms) — prazo máximo de resposta do probe (padrão: 5000)
//   slowThreshold(ms) — latência máxima aceitável para elegibilidade (padrão: 2000)
//
// USO:
//   const svc = new PeerHealthService();
//
//   // Verificar disponibilidade individual:
//   const ok = await svc.isAvailable('https://peer1.example.com');
//
//   // Selecionar melhor peer de uma lista:
//   const best = await svc.getBestPeer([
//     'https://peer1.example.com',
//     'https://peer2.example.com',
//   ]);
//
// INJEÇÃO DE PROVIDER (testes / staging):
//   const svc = new PeerHealthService({ probeProvider: meuMock });
//
// Dependências: node:http, node:https (nativas — apenas no HttpProbeProvider)
// =============================================================

const http  = require('node:http');
const https = require('node:https');

const DEFAULT_TIMEOUT       = 5_000;  // ms
const DEFAULT_SLOW_THRESHOLD = 2_000; // ms

// =============================================================
// HttpProbeProvider — implementação padrão de probe via HTTP GET.
//
// Envia GET /health para o peerId (URL base).
// Usa AbortController para cancelar a requisição ao atingir timeout.
// =============================================================

class HttpProbeProvider {

  #timeout;

  /** @param {number} timeout — prazo em ms */
  constructor(timeout) {
    this.#timeout = timeout;
  }

  /**
   * Sonda o peer enviando GET /health.
   * Resolve em void se o peer responder com qualquer status HTTP.
   * Lança se o peer não responder dentro do timeout ou houver erro de rede.
   *
   * @param {string} peerId — URL base do peer (ex: 'https://peer1.example.com')
   * @returns {Promise<void>}
   */
  probe(peerId) {
    return new Promise((resolve, reject) => {
      const url    = new URL('/health', peerId);
      const driver = url.protocol === 'https:' ? https : http;
      const req    = driver.get(url.toString(), { timeout: this.#timeout }, (res) => {
        res.resume(); // descarta o corpo — só nos importa o código de status
        resolve();
      });

      req.on('timeout', () => {
        req.destroy(new Error(`[PeerHealthService] Probe timeout: ${peerId}`));
      });

      req.on('error', reject);
    });
  }
}

// =============================================================
// PeerHealthService — orquestrador de saúde de peers.
// =============================================================

class PeerHealthService {

  #probeProvider;
  #timeout;
  #slowThreshold;

  /**
   * @param {object} [opts]
   * @param {{ probe(peerId: string): Promise<void> }} [opts.probeProvider]
   *   Implementação de probe. Padrão: HttpProbeProvider.
   * @param {number} [opts.timeout=5000]
   *   Timeout máximo em ms para considerar peer offline.
   * @param {number} [opts.slowThreshold=2000]
   *   Latência máxima em ms para considerar peer elegível em getBestPeer.
   */
  constructor({ probeProvider, timeout = DEFAULT_TIMEOUT, slowThreshold = DEFAULT_SLOW_THRESHOLD } = {}) {
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new RangeError('[PeerHealthService] timeout deve ser um número positivo');
    }
    if (typeof slowThreshold !== 'number' || slowThreshold <= 0) {
      throw new RangeError('[PeerHealthService] slowThreshold deve ser um número positivo');
    }

    this.#timeout        = timeout;
    this.#slowThreshold  = slowThreshold;
    this.#probeProvider  = probeProvider ?? new HttpProbeProvider(timeout);
  }

  // ══════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se um peer está disponível dentro do timeout configurado.
   *
   * @param {string} peerId — identificador/URL do peer
   * @returns {Promise<boolean>}
   */
  async isAvailable(peerId) {
    this.#validarPeerId(peerId);
    try {
      await this.#probeWithTimeout(peerId);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Retorna o peer com menor latência de uma lista, ignorando
   * peers offline (probe lança) e peers lentos (latência ≥ slowThreshold).
   *
   * @param {string[]} peers — lista de peerIds a avaliar
   * @returns {Promise<string>} peerId do melhor peer
   * @throws {TypeError}        se peers não for array não-vazio de strings
   * @throws {Error{status:503}} se nenhum peer estiver disponível e rápido
   */
  async getBestPeer(peers) {
    this.#validarListaPeers(peers);

    // Sonda todos em paralelo; captura latência ou erro por peer
    const resultados = await Promise.all(
      peers.map((peerId) => this.#medirLatencia(peerId)),
    );

    // Filtra peers elegíveis (sem erro + abaixo do slowThreshold)
    const elegiveis = resultados
      .filter((r) => r.latencia !== null && r.latencia < this.#slowThreshold)
      .sort((a, b) => a.latencia - b.latencia);

    if (elegiveis.length === 0) {
      throw Object.assign(
        new Error('[PeerHealthService] Nenhum peer disponível e rápido o suficiente'),
        { status: 503 },
      );
    }

    return elegiveis[0].peerId;
  }

  // ══════════════════════════════════════════════════════════════
  // GETTERS — configuração observável (útil para testes)
  // ══════════════════════════════════════════════════════════════

  /** @returns {number} */
  get timeout() { return this.#timeout; }

  /** @returns {number} */
  get slowThreshold() { return this.#slowThreshold; }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════════

  /**
   * Executa o probe do provider com um deadline via Promise.race.
   * @param {string} peerId
   * @returns {Promise<void>}
   */
  #probeWithTimeout(peerId) {
    const deadline = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`[PeerHealthService] Timeout ao sondar peer: ${peerId}`)),
        this.#timeout,
      ),
    );
    return Promise.race([this.#probeProvider.probe(peerId), deadline]);
  }

  /**
   * Mede a latência de um peer.
   * Retorna { peerId, latencia: number } em sucesso
   * ou      { peerId, latencia: null }  se offline/erro.
   *
   * @param {string} peerId
   * @returns {Promise<{ peerId: string, latencia: number|null }>}
   */
  async #medirLatencia(peerId) {
    const inicio = Date.now();
    try {
      await this.#probeWithTimeout(peerId);
      return { peerId, latencia: Date.now() - inicio };
    } catch (_) {
      return { peerId, latencia: null };
    }
  }

  #validarPeerId(peerId) {
    if (typeof peerId !== 'string' || peerId.trim() === '') {
      throw new TypeError('[PeerHealthService] peerId deve ser uma string nao-vazia');
    }
  }

  #validarListaPeers(peers) {
    if (!Array.isArray(peers) || peers.length === 0) {
      throw new TypeError('[PeerHealthService] peers deve ser um array nao-vazio');
    }
    for (const p of peers) {
      if (typeof p !== 'string' || p.trim() === '') {
        throw new TypeError('[PeerHealthService] cada peer deve ser uma string nao-vazia');
      }
    }
  }
}

module.exports = PeerHealthService;
