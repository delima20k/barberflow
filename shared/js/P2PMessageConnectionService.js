'use strict';

// =============================================================
// P2PMessageConnectionService.js — Conexão WebRTC P2P para chat.
//
// RESPONSABILIDADE:
//   Orquestra RTCPeerConnection + DataChannel + troca de chaves ECDH
//   + cifragem/decifragem de mensagens via MessageCryptoService.
//
// FLUXO (Usuário A inicia chat com Usuário B):
//   1. A chama initiateConnection(A.id, B.id)
//   2. A busca ICE config em /api/p2p/ice-config
//   3. A cria RTCPeerConnection + DataChannel 'chat'
//   4. A gera offer → MessageSignalingService.sendOffer(B.id, ...)
//   5. B recebe offer via subscribeToSignals → chama acceptConnection(B.id, A.id)
//   6. B cria answer → MessageSignalingService.sendAnswer(A.id, ...)
//   7. Ambos trocam ICE candidates via sendIceCandidate
//   8. DataChannel abre → ambos geram par ECDH, trocam chave pública pelo canal
//   9. deriveSharedKey → chave AES-GCM em memória
//  10. sendMessage: encryptMessage antes de enviar
//  11. onMessage: decryptMessage ao receber
//
// STATUS emitidos:
//   'connecting'   → negociação WebRTC em andamento
//   'key-exchange' → DataChannel aberto, trocando chaves ECDH
//   'secure'       → chave AES derivada, canal seguro ativo
//   'disconnected' → DataChannel fechado após ter estado ativo
//   'failed'       → timeout (15s) ou erro irrecuperável
//
// OFFLINE HANDLING:
//   Se a conexão não abrir em CONNECT_TIMEOUT_MS → status 'failed'.
//   Nenhuma mensagem é armazenada em banco como fallback.
//
// SEGURANÇA:
//   - Chave privada ECDH nunca exposta em logs
//   - Payload trafega como { iv, ct } — sem texto puro pelo DataChannel
//   - Sinalização nunca transporta conteúdo de mensagem
//   - iceTransportPolicy: 'relay' → TURN relay apenas, IP não exposto
//
// Dependências (globais de browser):
//   MessageCryptoService, MessageSignalingService, AuthService, window.BFF_URL
// =============================================================

class P2PMessageConnectionService {

  // ─── Constantes ──────────────────────────────────────────────
  static #CONNECT_TIMEOUT_MS = 15_000;
  static #MAX_RECONNECT      = 3;

  // ─── Estado de sessões ativas ────────────────────────────────
  /**
   * @type {Map<string, {
   *   pc:          RTCPeerConnection,
   *   dc:          RTCDataChannel|null,
   *   aesKey:      CryptoKey|null,
   *   privKey:     CryptoKey|null,
   *   status:      string,
   *   statusCbs:   Set<Function>,
   *   messageCbs:  Set<Function>,
   *   reconnects:  number,
   *   timer:       ReturnType<typeof setTimeout>|null,
   * }>}
   */
  static #sessoes = new Map();

  // ═══════════════════════════════════════════════════════════
  // Público — Ciclo de vida da conexão
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia conexão P2P como chamador (Usuário A).
   * Envia offer para o destinatário via sinalização.
   *
   * @param {string} localUserId
   * @param {string} remoteUserId
   * @returns {Promise<void>}
   */
  static async initiateConnection(localUserId, remoteUserId) {
    if (!P2PMessageConnectionService.#suportado()) {
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      return;
    }

    const sessao = P2PMessageConnectionService.#criarSessao(remoteUserId);
    P2PMessageConnectionService.#emitirStatus(remoteUserId, 'connecting');

    const iceServers = await P2PMessageConnectionService.#buscarIceConfig();
    if (!iceServers) {
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      return;
    }

    const pc = P2PMessageConnectionService.#criarPC(iceServers);
    sessao.pc = pc;

    // DataChannel criado pelo iniciador
    const dc = pc.createDataChannel('chat', { ordered: true });
    sessao.dc = dc;
    P2PMessageConnectionService.#bindDataChannel(dc, remoteUserId, localUserId);

    P2PMessageConnectionService.#bindICE(pc, localUserId, remoteUserId);

    // Subscrever à sinalização para receber answer e ICE candidates do peer
    MessageSignalingService.subscribeToSignals(localUserId, async (sinal) => {
      if (sinal.from !== remoteUserId) return;
      await P2PMessageConnectionService.#tratarSinal(sinal, localUserId, remoteUserId);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await MessageSignalingService.sendOffer(remoteUserId, localUserId, offer);

    P2PMessageConnectionService.#iniciarTimer(remoteUserId);
  }

  /**
   * Aceita uma conexão como receptor (Usuário B), ao receber uma offer.
   * Deve ser chamado pelo MessagesWidget ao receber sinal 'offer' via
   * subscribeToSignals do próprio userId.
   *
   * @param {string}              localUserId
   * @param {string}              remoteUserId
   * @param {RTCSessionDescription} offer
   * @returns {Promise<void>}
   */
  static async acceptConnection(localUserId, remoteUserId, offer) {
    if (!P2PMessageConnectionService.#suportado()) {
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      return;
    }

    const sessao = P2PMessageConnectionService.#criarSessao(remoteUserId);
    P2PMessageConnectionService.#emitirStatus(remoteUserId, 'connecting');

    const iceServers = await P2PMessageConnectionService.#buscarIceConfig();
    if (!iceServers) {
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      return;
    }

    const pc = P2PMessageConnectionService.#criarPC(iceServers);
    sessao.pc = pc;

    // DataChannel criado pelo chamador — receptor recebe via ondatachannel
    pc.ondatachannel = ({ channel: dc }) => {
      sessao.dc = dc;
      P2PMessageConnectionService.#bindDataChannel(dc, remoteUserId, localUserId);
    };

    P2PMessageConnectionService.#bindICE(pc, localUserId, remoteUserId);

    // Subscrever à sinalização para receber ICE candidates do chamador
    MessageSignalingService.subscribeToSignals(localUserId, async (sinal) => {
      if (sinal.from !== remoteUserId) return;
      await P2PMessageConnectionService.#tratarSinal(sinal, localUserId, remoteUserId);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await MessageSignalingService.sendAnswer(remoteUserId, localUserId, answer);

    P2PMessageConnectionService.#iniciarTimer(remoteUserId);
  }

  /**
   * Envia uma mensagem de texto para o peer.
   * A mensagem é criptografada antes de sair do dispositivo.
   * Bloqueia envio se o status não for 'secure'.
   *
   * @param {string} remoteUserId
   * @param {string} plainText
   * @throws {Error} se sem conexão segura ou DataChannel fechado
   */
  static async sendMessage(remoteUserId, plainText) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao || sessao.status !== 'secure') {
      throw new Error('Sem conexão segura. O destinatário precisa estar online para receber mensagens P2P.');
    }
    if (!sessao.dc || sessao.dc.readyState !== 'open') {
      throw new Error('Canal de dados fechado.');
    }
    if (!sessao.aesKey) {
      throw new Error('Chave de sessão indisponível.');
    }

    const payload = await MessageCryptoService.encryptMessage(plainText, sessao.aesKey);
    sessao.dc.send(JSON.stringify({ type: 'msg', data: payload }));
  }

  /**
   * Registra callback para receber mensagens descriptografadas do peer.
   *
   * @param {string}   remoteUserId
   * @param {Function} callback — ({ texto: string, hora: string }) => void
   */
  static onMessage(remoteUserId, callback) {
    const sessao = P2PMessageConnectionService.#obterOuCriarSessaoVazia(remoteUserId);
    sessao.messageCbs.add(callback);
  }

  /**
   * Registra callback para mudanças de status da conexão.
   *
   * @param {string}   remoteUserId
   * @param {Function} callback — (status: string) => void
   */
  static onStatusChange(remoteUserId, callback) {
    const sessao = P2PMessageConnectionService.#obterOuCriarSessaoVazia(remoteUserId);
    sessao.statusCbs.add(callback);
  }

  /**
   * Retorna o status atual da conexão com o peer.
   *
   * @param {string} remoteUserId
   * @returns {string} 'connecting' | 'key-exchange' | 'secure' | 'disconnected' | 'failed' | 'none'
   */
  static getStatus(remoteUserId) {
    return P2PMessageConnectionService.#sessoes.get(remoteUserId)?.status ?? 'none';
  }

  /**
   * Fecha a conexão com o peer e limpa o estado da sessão.
   *
   * @param {string} remoteUserId
   */
  static close(remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao) return;

    P2PMessageConnectionService.#cancelarTimer(remoteUserId);
    sessao.dc?.close();
    sessao.pc?.close();
    sessao.aesKey  = null;
    sessao.privKey = null;
    P2PMessageConnectionService.#sessoes.delete(remoteUserId);
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — Setup de conexão
  // ═══════════════════════════════════════════════════════════

  /** @returns {boolean} */
  static #suportado() {
    return typeof RTCPeerConnection !== 'undefined';
  }

  /**
   * Cria objeto de sessão para o peer.
   * @param {string} remoteUserId
   * @returns {object} sessao
   */
  static #criarSessao(remoteUserId) {
    P2PMessageConnectionService.close(remoteUserId); // limpa sessão anterior se existir

    const sessao = {
      pc:         null,
      dc:         null,
      aesKey:     null,
      privKey:    null,
      status:     'connecting',
      statusCbs:  new Set(),
      messageCbs: new Set(),
      reconnects: 0,
      timer:      null,
    };
    P2PMessageConnectionService.#sessoes.set(remoteUserId, sessao);
    return sessao;
  }

  /**
   * Retorna sessão existente ou cria uma vazia (apenas para registrar callbacks).
   * @param {string} remoteUserId
   */
  static #obterOuCriarSessaoVazia(remoteUserId) {
    if (!P2PMessageConnectionService.#sessoes.has(remoteUserId)) {
      P2PMessageConnectionService.#sessoes.set(remoteUserId, {
        pc: null, dc: null, aesKey: null, privKey: null,
        status: 'none', statusCbs: new Set(), messageCbs: new Set(),
        reconnects: 0, timer: null,
      });
    }
    return P2PMessageConnectionService.#sessoes.get(remoteUserId);
  }

  /**
   * Cria RTCPeerConnection com TURN relay obrigatório (sem exposição de IP).
   * @param {RTCIceServer[]} iceServers
   * @returns {RTCPeerConnection}
   */
  static #criarPC(iceServers) {
    return new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'relay', // TURN obrigatório — nunca expõe IP
    });
  }

  /**
   * Configura listeners de ICE candidate na RTCPeerConnection.
   */
  static #bindICE(pc, localUserId, remoteUserId) {
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      MessageSignalingService.sendIceCandidate(remoteUserId, localUserId, candidate);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      }
    };
  }

  /**
   * Configura listeners do DataChannel (aberto, mensagem, fechado, erro).
   */
  static #bindDataChannel(dc, remoteUserId, localUserId) {
    dc.onopen = async () => {
      P2PMessageConnectionService.#cancelarTimer(remoteUserId);
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'key-exchange');
      await P2PMessageConnectionService.#trocarChaves(dc, remoteUserId);
    };

    dc.onmessage = async ({ data }) => {
      await P2PMessageConnectionService.#processarMensagem(data, remoteUserId);
    };

    dc.onclose = () => {
      const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
      if (sessao && sessao.status === 'secure') {
        P2PMessageConnectionService.#emitirStatus(remoteUserId, 'disconnected');
      }
    };

    dc.onerror = () => {
      P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — Troca de chaves ECDH pelo DataChannel
  // ═══════════════════════════════════════════════════════════

  /**
   * Gera par ECDH, envia chave pública pelo DataChannel.
   * Aguarda receber a chave pública do peer para derivar a chave AES.
   * A chave privada fica apenas em memória na sessão.
   */
  static async #trocarChaves(dc, remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao) return;

    const { publicKey, privateKey } = await MessageCryptoService.generateKeyPair();
    sessao.privKey = privateKey;

    const pubB64 = await MessageCryptoService.exportPublicKey(publicKey);
    dc.send(JSON.stringify({ type: 'pubkey', data: pubB64 }));
    // A derivação da chave AES ocorre em #processarMensagem ao receber 'pubkey' do peer
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — Processamento de mensagens DataChannel
  // ═══════════════════════════════════════════════════════════

  /**
   * Processa pacotes recebidos pelo DataChannel.
   * Tipos:
   *   { type: 'pubkey', data: string }  → completa troca de chaves
   *   { type: 'msg',   data: {iv,ct} }  → descriptografa e entrega ao callback
   */
  static async #processarMensagem(raw, remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao) return;

    let pacote;
    try {
      pacote = JSON.parse(raw);
    } catch {
      return; // pacote malformado — ignora silenciosamente
    }

    if (pacote.type === 'pubkey') {
      // Recebeu chave pública do peer → deriva chave AES compartilhada
      try {
        const remotePub = await MessageCryptoService.importPublicKey(pacote.data);
        sessao.aesKey   = await MessageCryptoService.deriveSharedKey(sessao.privKey, remotePub);
        P2PMessageConnectionService.#emitirStatus(remoteUserId, 'secure');
      } catch {
        P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      }
      return;
    }

    if (pacote.type === 'msg') {
      if (!sessao.aesKey) return; // descarta se ainda sem chave
      if (!MessageCryptoService.validateEncryptedPayload(pacote.data)) return;

      let plainText;
      try {
        plainText = await MessageCryptoService.decryptMessage(pacote.data, sessao.aesKey);
      } catch {
        return; // falha silenciosa — não expõe erro com payload
      }

      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      sessao.messageCbs.forEach(cb => {
        try { cb({ texto: plainText, hora }); } catch (_) {}
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — Tratamento de sinais recebidos
  // ═══════════════════════════════════════════════════════════

  static async #tratarSinal(sinal, localUserId, remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao?.pc) return;

    try {
      if (sinal.type === 'answer') {
        await sessao.pc.setRemoteDescription(new RTCSessionDescription(sinal.payload));
      } else if (sinal.type === 'candidate') {
        await sessao.pc.addIceCandidate(new RTCIceCandidate(sinal.payload));
      }
    } catch {
      // falhas pontuais de ICE são normais — não emite erro global
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — Status e timers
  // ═══════════════════════════════════════════════════════════

  static #emitirStatus(remoteUserId, status) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao) return;
    sessao.status = status;
    sessao.statusCbs.forEach(cb => { try { cb(status); } catch (_) {} });
  }

  static #iniciarTimer(remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (!sessao) return;
    P2PMessageConnectionService.#cancelarTimer(remoteUserId);
    sessao.timer = setTimeout(() => {
      if (sessao.status === 'connecting' || sessao.status === 'key-exchange') {
        P2PMessageConnectionService.#emitirStatus(remoteUserId, 'failed');
      }
    }, P2PMessageConnectionService.#CONNECT_TIMEOUT_MS);
  }

  static #cancelarTimer(remoteUserId) {
    const sessao = P2PMessageConnectionService.#sessoes.get(remoteUserId);
    if (sessao?.timer) {
      clearTimeout(sessao.timer);
      sessao.timer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Privado — ICE config do servidor
  // ═══════════════════════════════════════════════════════════

  /**
   * Busca configuração ICE (STUN/TURN) do endpoint existente.
   * @returns {Promise<RTCIceServer[]|null>}
   */
  static async #buscarIceConfig() {
    try {
      const token = P2PMessageConnectionService.#obterToken();
      const bff   = P2PMessageConnectionService.#bffUrl();
      const resp  = await fetch(`${bff}/api/p2p/ice-config`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const { iceServers } = await resp.json();
      return iceServers ?? null;
    } catch {
      return null;
    }
  }

  static #obterToken() {
    if (typeof AuthService !== 'undefined') {
      return AuthService.getToken?.() ?? AuthService.getPerfil?.()?.access_token ?? '';
    }
    return '';
  }

  static #bffUrl() {
    if (typeof window !== 'undefined' && window.BFF_URL) {
      return String(window.BFF_URL).replace(/\/$/, '');
    }
    // Usa a mesma URL base da BFF (bff.berberflow.shop em produção)
    // em vez da origem do app, que não expõe /api/p2p.
    if (typeof BffApiService !== 'undefined' && BffApiService.baseUrl) {
      return String(BffApiService.baseUrl).replace(/\/$/, '');
    }
    return '';
  }
}
