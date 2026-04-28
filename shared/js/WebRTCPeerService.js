'use strict';

// =============================================================
// WebRTCPeerService.js — Cliente P2P WebRTC browser-to-browser.
//
// RESPONSABILIDADE:
//   Transferência de mídia entre browsers via WebRTC DataChannel.
//   O servidor Express nunca manipula o conteúdo da mídia — é puro sinalização.
//
// FLUXO:
//   1. Peer A (tem o arquivo): enviar(mediaId, buffer)
//      → anuncia no BFF (POST /api/p2p/announce)
//      → escuta canal Supabase Realtime 'p2p-{mediaId}'
//      → ao receber offer: cria answer → troca candidatos ICE → envia por DataChannel
//
//   2. Peer B (quer o arquivo): await receber(mediaId)
//      → verifica IndexedDB (MediaCacheService.temCache)
//      → busca peers no BFF (GET /api/p2p/peers/:mediaId)
//      → busca ICE config (GET /api/p2p/ice-config)
//      → abre DataChannel → envia offer → recebe chunks → reconstrói ArrayBuffer
//      → salva em MediaCacheService e retorna o buffer
//
// SEGURANÇA:
//   - iceTransportPolicy: 'relay' SEMPRE — TURN relay apenas, IP nunca exposto
//   - Sinalização via Supabase Realtime (canal broadcast temporário, expirado após uso)
//   - Mensagens incluem { from, to } para evitar escuta cruzada
//   - Timeout de 15s em receber() para não travar a UI
//   - Máx 3 peers simultâneos para não saturar largura de banda
//
// SIGNALING PROTOCOL (Supabase Realtime broadcast):
//   Canal: 'p2p-{mediaId}'
//   Mensagens:
//     { type: 'offer',     from: peerId, to: targetPeerId, payload: RTCSessionDescription }
//     { type: 'answer',    from: peerId, to: targetPeerId, payload: RTCSessionDescription }
//     { type: 'candidate', from: peerId, to: targetPeerId, payload: RTCIceCandidate }
//
// PROTOCOLO DATACHANNEL:
//   Chunks de 16KB, ordenados.
//   Último chunk: Uint8Array vazia (sinaliza fim de transmissão).
//
// Dependências (globais de browser):
//   AuthService       — getToken()
//   MediaCacheService — temCache(), obter(), salvar()
//   SupabaseService   — client (Supabase JS client para Realtime)
//   window.BFF_URL    — URL base do BFF
// =============================================================

class WebRTCPeerService {

  // ── Constantes privadas ────────────────────────────────────────
  static #MAX_CONCURRENT = 3;
  static #TIMEOUT_MS     = 15_000;
  static #CHUNK_SIZE     = 16 * 1024; // 16KB por chunk

  /**
   * Confirmação de conexão pedida ao usuário uma vez por sessão.
   * Evita surpresas de conexão P2P sem consentimento.
   * @type {boolean}
   */
  static #permissaoSolicitada = false;

  // ── Estado de conexões ativas ──────────────────────────────────
  /** @type {Map<string, RTCPeerConnection>} mediaId → conexão */
  static #conexoes = new Map();

  // ══════════════════════════════════════════════════════════════
  // Público
  // ══════════════════════════════════════════════════════════════

  /**
   * Verifica se WebRTC está disponível no browser atual.
   * @returns {boolean}
   */
  static suportado() {
    return typeof RTCPeerConnection !== 'undefined';
  }

  /**
   * Anuncia que este peer possui o mediaId em cache.
   * Registra no BFF para que outros peers possam localizar este dispositivo.
   *
   * @param {string} mediaId
   * @returns {Promise<string>} peerId gerado
   */
  static async anunciar(mediaId) {
    const peerId = crypto.randomUUID();
    const token  = WebRTCPeerService.#obterToken();

    const resp = await fetch(`${WebRTCPeerService.#bffUrl()}/api/p2p/announce`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ mediaId, peerId }),
    });

    if (!resp.ok) {
      const { error } = await resp.json().catch(() => ({}));
      throw new Error(error ?? `Announce falhou: HTTP ${resp.status}`);
    }

    return peerId;
  }

  /**
   * Tenta receber um arquivo de outro peer P2P.
   * Cascata: IndexedDB → WebRTC → null (se nenhum peer disponível ou timeout)
   *
   * @param {string} mediaId
   * @param {{ mimeType?: string, ttlMs?: number }} [opts] — opções de cache para salvar
   * @returns {Promise<ArrayBuffer|null>}
   */
  static async receber(mediaId, opts = {}) {
    if (!WebRTCPeerService.suportado()) return null;

    // 1. Verificar IndexedDB primeiro (zero latência)
    if (typeof MediaCacheService !== 'undefined' && MediaCacheService.temCache(mediaId)) {
      return MediaCacheService.obter(mediaId);
    }

    if (WebRTCPeerService.#conexoes.size >= WebRTCPeerService.#MAX_CONCURRENT) return null;

    // 2. Buscar peers disponíveis no BFF
    const token = WebRTCPeerService.#obterToken();
    if (!token) return null;

    const [peersResp, iceResp] = await Promise.all([
      fetch(`${WebRTCPeerService.#bffUrl()}/api/p2p/peers/${encodeURIComponent(mediaId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
      fetch(`${WebRTCPeerService.#bffUrl()}/api/p2p/ice-config`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }),
    ]);

    if (!peersResp.ok || !iceResp.ok) return null;

    const { peers }      = await peersResp.json();
    const { iceServers } = await iceResp.json();

    if (!peers?.length) return null;

    // 3. Pedir confirmação ao usuário (somente na primeira vez)
    const autorizado = await WebRTCPeerService.#pedirPermissao();
    if (!autorizado) return null;

    // 4. Tentar conectar ao primeiro peer disponível com timeout
    const meuPeerId = crypto.randomUUID();
    const alvo      = peers[0];

    try {
      const buffer = await Promise.race([
        WebRTCPeerService.#conectarComoReceptor(mediaId, meuPeerId, alvo.peerId, iceServers),
        WebRTCPeerService.#timeout(WebRTCPeerService.#TIMEOUT_MS),
      ]);

      // 5. Salvar no IndexedDB para redistribuição e cache local
      if (buffer instanceof ArrayBuffer && typeof MediaCacheService !== 'undefined') {
        await MediaCacheService.salvar(mediaId, buffer, {
          mimeType: opts.mimeType,
          ttlMs:    opts.ttlMs,
        });
      }

      return buffer instanceof ArrayBuffer ? buffer : null;
    } catch (_) {
      return null;
    } finally {
      WebRTCPeerService.#conexoes.delete(mediaId);
    }
  }

  /**
   * Anuncia este peer e escuta o canal de sinalização para enviar o arquivo
   * quando outro peer solicitar.
   *
   * @param {string}      mediaId
   * @param {ArrayBuffer} buffer
   * @returns {Promise<void>} — resolve após anunciar; envio é feito sob demanda (event-driven)
   */
  static async enviar(mediaId, buffer) {
    if (!WebRTCPeerService.suportado()) return;

    const meuPeerId  = await WebRTCPeerService.anunciar(mediaId);
    const iceResp    = await fetch(`${WebRTCPeerService.#bffUrl()}/api/p2p/ice-config`, {
      headers: { 'Authorization': `Bearer ${WebRTCPeerService.#obterToken()}` },
    });

    if (!iceResp.ok) return;
    const { iceServers } = await iceResp.json();

    // Aguardar offers de outros peers (event-driven via Supabase Realtime)
    WebRTCPeerService.#escutarSinalização(mediaId, meuPeerId, iceServers, buffer);
  }

  // ══════════════════════════════════════════════════════════════
  // Privados — Sinalização Supabase Realtime
  // ══════════════════════════════════════════════════════════════

  /**
   * Assina o canal de sinalização Supabase Realtime para receber offers.
   * Ao receber um offer, cria RTCPeerConnection como sender e responde com answer.
   * @param {string} mediaId
   * @param {string} meuPeerId
   * @param {RTCIceServer[]} iceServers
   * @param {ArrayBuffer} buffer — conteúdo a enviar via DataChannel
   */
  static #escutarSinalização(mediaId, meuPeerId, iceServers, buffer) {
    const canal = WebRTCPeerService.#supabaseChannel(mediaId);
    if (!canal) return;

    canal
      .on('broadcast', { event: 'offer' }, async ({ payload: msg }) => {
        if (msg.to !== meuPeerId) return; // mensagem para outro peer
        await WebRTCPeerService.#responderOffer(msg, meuPeerId, iceServers, buffer, canal);
      })
      .subscribe();
  }

  /**
   * Responde a um offer WebRTC com answer + DataChannel sender.
   * @param {{ from, to, payload }} msg
   * @param {string} meuPeerId
   * @param {RTCIceServer[]} iceServers
   * @param {ArrayBuffer} buffer
   * @param {object} canal — Supabase Realtime channel
   */
  static async #responderOffer(msg, meuPeerId, iceServers, buffer, canal) {
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'relay', // SEMPRE relay — nunca expõe IP
    });

    // Enviar candidatos ICE ao receptor via sinalização
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      canal.send({ type: 'broadcast', event: 'candidate', payload: {
        type: 'candidate', from: meuPeerId, to: msg.from, payload: candidate,
      }});
    };

    await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    canal.send({ type: 'broadcast', event: 'answer', payload: {
      type: 'answer', from: meuPeerId, to: msg.from, payload: answer,
    }});

    // Aguardar DataChannel abrir para enviar o arquivo
    pc.ondatachannel = ({ channel: dc }) => {
      dc.onopen = () => WebRTCPeerService.#enviarChunks(dc, buffer);
    };
  }

  /**
   * Cria RTCPeerConnection como receptor, envia offer e aguarda dados via DataChannel.
   * @param {string} mediaId
   * @param {string} meuPeerId
   * @param {string} peerAlvoPeerId
   * @param {RTCIceServer[]} iceServers
   * @returns {Promise<ArrayBuffer>}
   */
  static async #conectarComoReceptor(mediaId, meuPeerId, peerAlvoPeerId, iceServers) {
    return new Promise(async (resolve, reject) => {
      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'relay', // SEMPRE relay
      });

      WebRTCPeerService.#conexoes.set(mediaId, pc);

      const canal = WebRTCPeerService.#supabaseChannel(mediaId);
      if (!canal) { reject(new Error('Supabase Realtime indisponível')); return; }

      // DataChannel iniciado pelo receptor (oferente cria o canal)
      const dc = pc.createDataChannel('media', { ordered: true });

      const chunks   = [];
      let totalBytes = 0;

      dc.onmessage = ({ data }) => {
        if (data instanceof ArrayBuffer && data.byteLength === 0) {
          // Chunk vazio = fim da transmissão
          const final = new Uint8Array(totalBytes);
          let offset  = 0;
          chunks.forEach(c => { final.set(new Uint8Array(c), offset); offset += c.byteLength; });
          resolve(final.buffer);
          pc.close();
          return;
        }
        chunks.push(data);
        totalBytes += data.byteLength;
      };

      dc.onerror = (e) => reject(new Error('DataChannel error: ' + e));

      // Enviar candidatos ICE ao sender via sinalização
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        canal.send({ type: 'broadcast', event: 'candidate', payload: {
          type: 'candidate', from: meuPeerId, to: peerAlvoPeerId, payload: candidate,
        }});
      };

      // Receber answer + candidatos ICE do sender
      canal
        .on('broadcast', { event: 'answer' }, async ({ payload: msg }) => {
          if (msg.to !== meuPeerId) return;
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload)).catch(reject);
        })
        .on('broadcast', { event: 'candidate' }, async ({ payload: msg }) => {
          if (msg.to !== meuPeerId) return;
          await pc.addIceCandidate(new RTCIceCandidate(msg.payload)).catch(() => {});
        })
        .subscribe();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      canal.send({ type: 'broadcast', event: 'offer', payload: {
        type: 'offer', from: meuPeerId, to: peerAlvoPeerId, payload: offer,
      }});
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Privados — utilitários
  // ══════════════════════════════════════════════════════════════

  /**
   * Envia um ArrayBuffer em chunks de 16KB pelo DataChannel.
   * Envia um chunk vazio ao final para sinalizar EOF.
   * @param {RTCDataChannel} dc
   * @param {ArrayBuffer} buffer
   */
  static #enviarChunks(dc, buffer) {
    const total  = buffer.byteLength;
    let   offset = 0;

    while (offset < total) {
      const fim   = Math.min(offset + WebRTCPeerService.#CHUNK_SIZE, total);
      const chunk = buffer.slice(offset, fim);
      dc.send(chunk);
      offset = fim;
    }

    // Sinalizar EOF com chunk vazio
    dc.send(new ArrayBuffer(0));
  }

  /**
   * Cria (ou retorna) um canal Supabase Realtime para sinalização.
   * @param {string} mediaId
   * @returns {object|null} Supabase RealtimeChannel ou null se indisponível
   */
  static #supabaseChannel(mediaId) {
    if (typeof SupabaseService === 'undefined') return null;
    const client = SupabaseService.client;
    if (!client?.channel) return null;
    return client.channel(`p2p-${mediaId}`, { config: { broadcast: { self: false } } });
  }

  /**
   * Obtém o JWT do usuário autenticado.
   * @returns {string}
   */
  static #obterToken() {
    if (typeof AuthService !== 'undefined') {
      return AuthService.getToken?.() ?? AuthService.getPerfil?.()?.access_token ?? '';
    }
    return '';
  }

  /**
   * Retorna a URL base do BFF.
   * @returns {string}
   */
  static #bffUrl() {
    return (typeof window !== 'undefined' ? (window.BFF_URL ?? '') : '').replace(/\/$/, '');
  }

  /**
   * Solicita confirmação do usuário para a primeira conexão P2P por sessão.
   * Requer consentimento explícito (LGPD / UX).
   * @returns {Promise<boolean>}
   */
  static async #pedirPermissao() {
    if (WebRTCPeerService.#permissaoSolicitada) return true;
    const aceito = confirm(
      'Este conteúdo pode ser carregado diretamente de outro dispositivo próximo (P2P).\n' +
      'Isso acelera o carregamento e economiza dados.\n\nDeseja continuar?'
    );
    if (aceito) WebRTCPeerService.#permissaoSolicitada = true;
    return aceito;
  }

  /**
   * Cria uma Promise que rejeita após o timeout informado.
   * Usada em Promise.race() para limitar tempo de espera do P2P.
   * @param {number} ms
   * @returns {Promise<never>}
   */
  static #timeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout P2P após ${ms}ms`)), ms)
    );
  }
}
