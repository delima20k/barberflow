'use strict';

// =============================================================
// MediaP2P.js — Upload híbrido P2P via Cloudflare R2 (BFF presigned)
//
// ARQUITETURA:
//   PRIMÁRIO — P2P (presigned URL):
//     O browser faz PUT direto ao R2 via URL gerada pelo BFF.
//     Videos de stories sao comprimidos depois, pelo worker assíncrono.
//
//   FALLBACK  — R2 CDN permanente:
//     Após confirmação, o arquivo está disponível via URL pública.
//
//   METADATA — Supabase:
//     BFF salva path + publicUrl na tabela media_files após confirmação.
//
// FLUXO COMPLETO:
//   1. registrar(file, uid)             → Blob URL local (preview imediato, zero latência)
//   2. fazerUpload(uid, contexto, meta) → P2P: browser → R2 via presigned URL
//                                          confirma ao BFF → metadata salvo no Supabase
//   3. cancelar(uid)                    → revoga Blob URL sem upload
//
// CONFIGURAÇÃO:
//   Antes de usar, configurar a URL do BFF Express:
//     MediaP2P.configurar('https://api.barberflow.app');
//   Ou setar window.BFF_URL antes de carregar o script.
//
// Contextos: stories | avatars | services | portfolio
// Dependência: SupabaseService (para obter JWT da sessão)
// =============================================================

(() => {
  if (typeof window === 'undefined' || window.BarberflowUploadDiag) return;

  window.BarberflowUploadDiag = {
    log(event = {}) {
      const entry = {
        time: new Date().toISOString(),
        step: event.step ?? 'unknown',
        state: event.state ?? 'info',
        uid: event.uid ?? null,
        status: event.status ?? null,
        endpoint: this.sanitizeEndpoint(event.endpoint),
        message: event.message ?? null,
        stack: event.stack ?? null,
      };

      console.info('[UploadDiag]', entry);
    },

    error(step, err, extra = {}) {
      this.log({
        ...extra,
        step,
        state: 'erro',
        message: err?.message ?? String(err),
        stack: err?.stack ?? null,
      });
    },

    sanitizeEndpoint(endpoint) {
      if (!endpoint) return null;
      try {
        const url = new URL(String(endpoint), window.location.origin);
        if (url.hostname.includes('r2') || url.hostname.includes('cloudflare')) {
          const parts = url.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
          return `${url.origin}/${parts}${parts ? '/...' : ''}`;
        }
        return `${url.origin}${url.pathname}`.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':uuid');
      } catch {
        return String(endpoint).split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':uuid');
      }
    },
  };
})();

class MediaP2P {

  /**
   * URL base do BFF Express.
   * Configurável via MediaP2P.configurar() ou window.BFF_URL.
   * @type {string}
   */
  static #BFF_URL = typeof window !== 'undefined'
    ? ((window.BFF_URL ?? '').replace(/\/$/, ''))
    : '';

  /** @type {Map<string, { file: File, blobUrl: string }>} */
  #pendentes = new Map();

  // ══════════════════════════════════════════════════════════
  // CONFIG
  // ══════════════════════════════════════════════════════════

  /**
   * Configura a URL base do BFF para todos os uploads.
   * Chamar uma vez durante a inicialização do app (antes de qualquer upload).
   * @param {string} bffUrl — ex: 'https://api.barberflow.app'
   */
  static configurar(bffUrl) {
    MediaP2P.#BFF_URL = (bffUrl ?? '').replace(/\/$/, '');
  }

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /**
   * Registra um arquivo local para preview imediato (P2P local).
   * Solicita confirmação antes de acessar o arquivo do dispositivo.
   * O arquivo fica pendente em memória — nenhum byte vai ao servidor.
   *
   * @param {File}   file — arquivo selecionado pelo usuário
   * @param {string} uid  — chave única do item (ex: "prod-img-1714000000-ab3f")
   * @returns {Promise<string|null>} Blob URL para usar em <img src>, ou null se cancelado
   */
  async registrar(file, uid) {
    if (!(file instanceof File)) return null;

    const aceito = await this.#pedirPermissao(file.name);
    if (!aceito) return null;

    this.#revogar(uid);

    const blobUrl = URL.createObjectURL(file);
    this.#pendentes.set(uid, { file, blobUrl });
    return blobUrl;
  }

  /**
   * Faz o upload P2P ao Cloudflare R2 via URL presigned gerada pelo BFF.
   * O arquivo sobe DIRETO do browser para o R2 — servidor fora do caminho dos bytes.
   * Após o upload, confirma ao BFF que persiste os metadados no Supabase.
   * Revoga o Blob URL após conclusão (libera memória).
   *
   * @param {string} uid        — chave do item (a mesma passada em registrar())
   * @param {string} contexto   — 'stories' | 'avatars' | 'services' | 'portfolio'
   * @param {object} [metadata] — dados extras opcionais (ex: { barbershopId })
   * @returns {Promise<{ path: string, publicUrl: string }>}
   *   path      — chave no R2 (armazenar no DB, ex: services/uuid/uuid.webp)
   *   publicUrl — URL pública CDN R2 (usar diretamente em <img src>)
   * @throws {Error} se não houver pendente, falha no presigned URL ou falha no upload
   */
  async fazerUpload(uid, contexto, metadata = {}) {
    const pendente = this.#pendentes.get(uid);
    if (!pendente) {
      throw new Error(`[MediaP2P] Nenhum arquivo pendente para uid "${uid}"`);
    }

    const { file } = pendente;
    // Normaliza o content type descartando parâmetros (ex.: ";codecs=vp9,opus"),
    // que o MediaRecorder anexa ao Blob.type em alguns navegadores (comum no
    // fallback video/webm de Android sem encoder de hardware H.264). Sem isso,
    // a policy do BFF rejeita ("Tipo de midia nao permitido") e, mesmo se o BFF
    // relaxasse a checagem, o Content-Type divergente quebraria a assinatura da
    // URL presigned (SigV4) no PUT ao R2 — por isso o mesmo valor normalizado é
    // usado tanto no pedido do presigned quanto no PUT abaixo.
    const contentType = String(file.type || '').split(';')[0].trim();

    // Todo o fluxo de rede fica dentro do try: qualquer falha (presigned,
    // PUT ao R2 ou confirmação) revoga o Blob URL pendente antes de propagar
    // o erro — sem isso, um upload que falha vaza o Blob até cancelar(uid)
    // ou cancelarTodos() serem chamados por fora (nem sempre acontece).
    try {
      globalThis.BarberflowUploadDiag?.log?.({ step: 'MediaP2P.obterToken', state: 'inicio', uid });
      const token = await this.#obterToken();
      globalThis.BarberflowUploadDiag?.log?.({ step: 'MediaP2P.obterToken', state: 'sucesso', uid });

      // ── Etapa 1: solicitar URL presigned ao BFF ──────────────────
      const presignedEndpoint = `${MediaP2P.#BFF_URL}/api/v1/media/presigned`;
      globalThis.BarberflowUploadDiag?.log?.({ step: 'POST /media/presigned', state: 'inicio', uid, endpoint: presignedEndpoint });
      const presResp = await fetch(presignedEndpoint, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ context: contexto, contentType, sizeBytes: file.size }),
      });
      globalThis.BarberflowUploadDiag?.log?.({ step: 'POST /media/presigned', state: presResp.ok ? 'sucesso' : 'erro', uid, endpoint: presignedEndpoint, status: presResp.status });

      if (!presResp.ok) {
        const { error } = await presResp.json().catch(() => ({}));
        throw new Error(`[MediaP2P] Falha ao obter URL presigned: ${error ?? presResp.status}`);
      }

      const { dados } = await presResp.json();
      const { uploadUrl, path, publicUrl, token: hmac, expiresAt, mediaId } = dados ?? {};
      if (!uploadUrl || !path || !mediaId || !hmac) {
        throw new Error('[MediaP2P] Resposta invalida da BFF ao obter URL presigned.');
      }

      // ── Etapa 2: upload P2P direto ao R2 (sem servidor no meio) ──
      globalThis.BarberflowUploadDiag?.log?.({ step: 'PUT R2', state: 'inicio', uid, endpoint: uploadUrl });
      const uploadResp = await fetch(uploadUrl, {
        method:  'PUT',
        headers: { 'Content-Type': contentType },
        body:    file,
      });
      globalThis.BarberflowUploadDiag?.log?.({ step: 'PUT R2', state: uploadResp.ok ? 'sucesso' : 'erro', uid, endpoint: uploadUrl, status: uploadResp.status });

      if (!uploadResp.ok) {
        throw new Error(`[MediaP2P] Falha no upload ao R2: HTTP ${uploadResp.status}`);
      }

      // ── Etapa 3: confirmar ao BFF → salva metadata no Supabase ───
      const confirmarEndpoint = `${MediaP2P.#BFF_URL}/api/v1/media/confirmar`;
      globalThis.BarberflowUploadDiag?.log?.({ step: 'POST /media/confirmar', state: 'inicio', uid, endpoint: confirmarEndpoint });
      const confResp = await fetch(confirmarEndpoint, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ mediaId, path, context: contexto, confirmationToken: hmac, expiresAt, metadata }),
      });
      globalThis.BarberflowUploadDiag?.log?.({ step: 'POST /media/confirmar', state: confResp.ok ? 'sucesso' : 'erro', uid, endpoint: confirmarEndpoint, status: confResp.status });

      if (!confResp.ok) {
        const { error } = await confResp.json().catch(() => ({}));
        throw new Error(`[MediaP2P] Falha na confirmação: ${error ?? confResp.status}`);
      }

      this.#revogar(uid); // libera memória após conclusão bem-sucedida
      return { path, publicUrl, mediaId };
    } catch (err) {
      globalThis.BarberflowUploadDiag?.error?.('MediaP2P.fazerUpload', err, { uid });
      this.#revogar(uid); // libera memória mesmo quando o upload falha
      throw err;
    }
  }

  /**
   * Verifica se existe arquivo local pendente (não enviado) para o uid.
   * @param {string} uid
   * @returns {boolean}
   */
  temPendente(uid) {
    return this.#pendentes.has(uid);
  }

  /**
   * Retorna a extensão do arquivo pendente (ex: "jpg", "webp").
   * @param {string} uid
   * @returns {string} extensão sem ponto, lowercase; "jpg" como fallback
   */
  extensaoPendente(uid) {
    const p = this.#pendentes.get(uid);
    if (!p) return 'jpg';
    const parts = p.file.name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
  }

  /**
   * Retorna o MIME type do arquivo pendente.
   * @param {string} uid
   * @returns {string} MIME type; "image/jpeg" como fallback
   */
  contentTypePendente(uid) {
    return this.#pendentes.get(uid)?.file?.type ?? 'image/jpeg';
  }

  /**
   * Retorna o File pendente para upload direto sem passar pelo BFF.
   * @param {string} uid
   * @returns {File|null}
   */
  getFile(uid) {
    return this.#pendentes.get(uid)?.file ?? null;
  }

  /**
   * Cancela um arquivo pendente sem fazer upload.
   * Revoga o Blob URL para evitar memory leak.
   * Chamar ao remover um item da lista.
   * @param {string} uid
   */
  cancelar(uid) {
    this.#revogar(uid);
  }

  /**
   * Cancela e revoga todos os arquivos pendentes.
   * Chamar ao fechar o painel de configuração ou ao fazer logout.
   */
  cancelarTodos() {
    for (const uid of [...this.#pendentes.keys()]) {
      this.#revogar(uid);
    }
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════

  /**
   * Revoga o Blob URL e remove o item do mapa de pendentes.
   * @param {string} uid
   */
  #revogar(uid) {
    const p = this.#pendentes.get(uid);
    if (!p) return;
    URL.revokeObjectURL(p.blobUrl);
    this.#pendentes.delete(uid);
  }

  /**
   * Faz streaming progressivo de um vídeo via MediaSource API.
   *
   * FLUXO:
   *   1. Inicia fetch com ReadableStream
   *   2. Alimenta o SourceBuffer conforme chunks chegam
   *   3. Aguarda buffer inicial de 3 segundos antes de disparar play automático
   *   4. Continua alimentando enquanto o usuário assiste (progressive download)
   *
   * Compatibilidade: Chrome, Edge, Firefox ≥ MediaSource support
   * Não suportado: iOS Safari (usa fallback para src direto)
   *
   * @param {string}           url     — URL do vídeo (R2 / Supabase Storage)
   * @param {HTMLVideoElement} videoEl — elemento <video> para reproduzir
   * @param {string}           [mime='video/mp4; codecs="avc1.42E01E, mp4a.40.2"']
   * @returns {Promise<void>}
   */
  async streamVideo(url, videoEl, mime = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"') {
    // Fallback para browsers sem suporte a MediaSource (ex: iOS Safari)
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(mime)) {
      videoEl.src = url;
      return;
    }

    const ms  = new MediaSource();
    const src = URL.createObjectURL(ms);
    videoEl.src = src;

    await new Promise((resolve, reject) => {
      ms.addEventListener('sourceopen', resolve, { once: true });
      ms.addEventListener('error', reject,      { once: true });
    });

    const sb = ms.addSourceBuffer(mime);

    const resp = await fetch(url);
    if (!resp.ok) {
      URL.revokeObjectURL(src);
      throw new Error(`[MediaP2P.streamVideo] HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();

    // Controla se já atingimos o buffer mínimo para iniciar play (3s)
    let jogoAutomaticoDisparado = false;
    // Buffer acumulado em bytes (estimativa: 500KB ≈ ~3s @1.3Mbps)
    const BUFFER_INICIO_BYTES = 500 * 1024;
    let bytesAcumulados = 0;

    /**
     * Aguarda o SourceBuffer terminar de processar o chunk anterior.
     */
    const aguardarSB = () =>
      sb.updating
        ? new Promise(res => sb.addEventListener('updateend', res, { once: true }))
        : Promise.resolve();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        await aguardarSB();
        if (!ms.readyState.includes('ended')) ms.endOfStream();
        URL.revokeObjectURL(src);
        break;
      }

      await aguardarSB();
      sb.appendBuffer(value);

      bytesAcumulados += value.byteLength;

      // Iniciar play após buffer inicial — sem esperar o download completo
      if (!jogoAutomaticoDisparado && bytesAcumulados >= BUFFER_INICIO_BYTES) {
        jogoAutomaticoDisparado = true;
        videoEl.play().catch(() => { /* autoplay bloqueado — usuário inicia manualmente */ });
      }
    }
  }

  /**
   * Solicita confirmação do usuário antes de acessar o arquivo local.
   * @param {string} nomeArquivo
   * @returns {Promise<boolean>}
   */
  async #pedirPermissao(nomeArquivo) {
    return new Promise(resolve => {
      const aceito = window.confirm(
        `Usar "${nomeArquivo}" do seu dispositivo como imagem do item?`
      );
      resolve(aceito);
    });
  }

  /**
   * Obtém o JWT da sessão atual para autorizar as chamadas ao BFF.
   * @returns {Promise<string>}
   * @throws {Error} se não houver sessão ativa
   */
  async #obterToken() {
    if (typeof SupabaseService !== 'undefined') {
      const session = await SupabaseService.getSession().catch(() => null);
      if (session?.access_token) return session.access_token;
    }
    throw new Error('[MediaP2P] Usuário não autenticado. Faça login antes de fazer upload.');
  }
}
