'use strict';

// =============================================================
// GeoService.js — Geolocalização do usuário (POO, Singleton)
//
// Responsabilidades:
//   - Solicitar permissão e posição GPS ao browser
//   - Cache em memória com TTL de 5 minutos
//   - Verificar estado atual da permissão (Permissions API)
//   - Solicitar GPS automaticamente na primeira abertura do app
//
// Uso:
//   const pos = await GeoService.obter();
//   const perm = await GeoService.verificarPermissao(); // 'granted'|'denied'|'prompt'|'unavailable'
//   GeoService.solicitarNaPrimeiraVez();               // chama no boot do app
//   const pos = await GeoService.carregarDoBanco();    // fallback — ultima posicao salva
// =============================================================

class GeoService {

  static #CACHE_TTL_MS      = 5  * 60 * 1000; // 5 minutos
  static #SALVAR_COOLDOWN_MS = 10 * 60 * 1000; // throttle: salva na BFF no max 1x/10min
  static #cache              = null;            // { lat, lng, ts }
  static #gpsPromise         = null;            // Promise em andamento para coalescer obter() concorrente
  static #ultimoSalvo        = null;            // Date.now() do ultimo save na BFF
  static #salvandoNaBff      = false;           // lock: evita chamadas concorrentes ao patch
  static #watchId            = null;            // ID do watchPosition ativo (ou null)
  static #solicitando        = false;           // guard: evita solicitarNaPrimeiraVez() duplicado

  static #LS_POSITION_KEY = 'geo:last_position';        // chave localStorage
  static #STORAGE_KEY     = 'sb-jfvjisqnzapxxagkbxcu-auth-token'; // token Supabase
  static #MAX_IDADE_BFF_MS = 60 * 60 * 1000;            // 1h — TTL posição do servidor

  // ── Debug helper (ativo só quando window.GEO_DEBUG === true) ────
  static #debug(...args) {
    if (typeof window !== 'undefined' && window.GEO_DEBUG) console.debug(...args);
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna a posição atual do usuário (com cache de 5 min).
   * @returns {Promise<{lat: number, lng: number}>}
   */
  static obter() {
    if (GeoService.#cacheValido()) {
      return Promise.resolve({ lat: GeoService.#cache.lat, lng: GeoService.#cache.lng });
    }
    if (GeoService.#gpsPromise) return GeoService.#gpsPromise;

    GeoService.#gpsPromise = GeoService.#solicitarGPSComRetry()
      .finally(() => {
        GeoService.#gpsPromise = null;
      });
    return GeoService.#gpsPromise;
  }

  /**
   * Verifica o estado atual da permissão de localização.
   * @returns {Promise<'granted'|'denied'|'prompt'|'unavailable'>}
   */
  static async verificarPermissao() {
    if (!navigator.geolocation) return 'unavailable';
    if (!navigator.permissions) return 'prompt'; // fallback: navegadores antigos
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state; // 'granted' | 'denied' | 'prompt'
    } catch {
      return 'prompt';
    }
  }

  /**
   * Solicita GPS automaticamente na primeira abertura do app.
   * - Se bloqueado pelo browser: vai direto ao fallback (sem gerar warning no console)
   * - Se 'prompt': dispara o dialog nativo do browser para o usuário aceitar
   * - Se concedido: salva no banco + notifica widgets
   * - Se negado agora: tenta fallback do banco (ultima posicao salva)
   */
  static async solicitarNaPrimeiraVez() {
    if (GeoService.#solicitando) return;
    GeoService.#solicitando = true;
    if (!navigator.geolocation) {
      GeoService.#tentarFallbackBanco();
      return;
    }

    // Verifica o estado da permissão ANTES de chamar getCurrentPosition.
    // Quando o Chrome bloqueia automaticamente (dismissed várias vezes),
    // chamar getCurrentPosition sem verificar gera o warning no console
    // e nunca exibe o prompt ao usuário.
    const permissao = await GeoService.verificarPermissao();

    if (permissao === 'denied') {
      // Permissão bloqueada no browser — notifica via evento e usa fallback do banco
      document.dispatchEvent(new CustomEvent('geo:negado'));
      GeoService.#tentarFallbackBanco();
      return;
    }

    // 'prompt' ou 'granted' — chama normalmente (exibe o dialog se necessário)
    GeoService.obter()
      .then(() => {
        document.dispatchEvent(new CustomEvent('geo:concedido'));
      })
      .catch(() => {
        // Usuário rejeitou agora — fallback silencioso
        GeoService.#tentarFallbackBanco();
      });
  }

  /**
   * Retorna a ultima posicao salva para o usuario logado.
   * Prioridade: localStorage → BFF → Supabase (fallback compat).
   * Só retorna posição com menos de 1 hora.
   * @returns {Promise<{lat: number, lng: number}|null>}
   */
  static async carregarDoBanco() {
    try {
      // 1) localStorage (síncrono, sem rede)
      const posLocal = GeoService.#lerLocalStorage();
      if (posLocal) {
        GeoService.#debug('[GeoService] carregarDoBanco: cache localStorage', posLocal);
        return posLocal;
      }

      // 2) BFF autenticada
      if (typeof BffApiService !== 'undefined') {
        GeoService.#debug('[GeoService] carregarDoBanco: consultando BFF');
        const { data, error } = await BffApiService.get('/api/v1/clientes/localizacao');
        if (!error && data?.lat != null && data?.lng != null) {
          GeoService.#debug('[GeoService] carregarDoBanco: BFF ok', data);
          return { lat: data.lat, lng: data.lng };
        }
      }

      // 3) Supabase direto — fallback de compatibilidade
      if (typeof SupabaseService !== 'undefined') {
        GeoService.#debug('[GeoService] carregarDoBanco: fallback Supabase');
        const user = await SupabaseService.getUser();
        if (!user) return null;
        const { data, error } = await SupabaseService.profiles()
          .select('last_lat, last_lng, last_location_at')
          .eq('id', user.id)
          .single();
        if (error || !data?.last_lat || !data?.last_lng) return null;
        const umHoraAtras = Date.now() - GeoService.#MAX_IDADE_BFF_MS;
        if (new Date(data.last_location_at).getTime() < umHoraAtras) return null;
        return { lat: Number(data.last_lat), lng: Number(data.last_lng) };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Limpa o cache forçando nova leitura na próxima chamada.
   */
  static limparCache() {
    GeoService.#cache = null;
  }

  /**
   * Inicia o monitoramento contínuo de posição via watchPosition.
   * Cada atualização do GPS chama onUpdate(lat, lng) e atualiza o cache.
   * Seguro chamar várias vezes — só abre um único watch.
   * @param {Function} onUpdate — callback(lat: number, lng: number)
   */
  static iniciarWatch(onUpdate) {
    if (GeoService.#watchId !== null || !navigator.geolocation) return;
    GeoService.#watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        GeoService.#cache = { lat, lng, ts: Date.now() };
        GeoService.#salvarNaBff(lat, lng); // fire-and-forget, throttled
        if (typeof onUpdate === 'function') onUpdate(lat, lng);
      },
      () => { /* silencioso — watchPosition continua após erro transitório */ },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }

  /**
   * Para o monitoramento contínuo de posição iniciado por iniciarWatch.
   */
  static pararWatch() {
    if (GeoService.#watchId !== null) {
      navigator.geolocation.clearWatch(GeoService.#watchId);
      GeoService.#watchId = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #cacheValido() {
    return (
      GeoService.#cache !== null &&
      Date.now() - GeoService.#cache.ts < GeoService.#CACHE_TTL_MS
    );
  }

  /**
   * Tenta obter GPS com até 3 tentativas (timeouts: 8s, 10s, 12s).
   * Aborta imediatamente se o usuário negou a permissão (code 1).
   */
  static async #solicitarGPSComRetry() {
    const TIMEOUTS = [8000, 10000, 12000];
    let ultimoErro;
    for (const timeout of TIMEOUTS) {
      try {
        return await GeoService.#solicitarGPS(timeout);
      } catch (err) {
        ultimoErro = err;
        // code 1 = permissão negada — não adianta tentar de novo
        if (err?._code === 1) break;
      }
    }
    throw ultimoErro;
  }

  static #solicitarGPS(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('GPS não disponível neste dispositivo.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            ts:  Date.now(),
          };
          GeoService.#cache = pos;
          GeoService.#salvarNaBff(pos.lat, pos.lng); // fire-and-forget
          resolve({ lat: pos.lat, lng: pos.lng });
        },
        (err) => {
          const error = new Error(GeoService.#mensagemErro(err.code));
          error._code = err.code;
          reject(error);
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  }

  /**
   * Converte código de erro da Geolocation API em mensagem amigável.
   * @param {number} code
   * @returns {string}
   */
  static #mensagemErro(code) {
    const MSGS = {
      1: 'Permissão de localização negada. Ative o GPS nas configurações.',
      2: 'Não foi possível determinar sua localização. Tente novamente.',
      3: 'Tempo esgotado ao obter localização. Verifique o sinal GPS.',
    };
    return MSGS[code] ?? 'Erro desconhecido ao obter localização.';
  }

  /**
   * Salva lat/lng via BFF com throttle de 10 min.
   * Persiste em localStorage imediatamente (sem rede).
   * Se BFF offline, enfileira no OfflineSyncQueue para replay.
   * Fire-and-forget — não bloqueia o fluxo.
   */
  static async #salvarNaBff(lat, lng) {
    if (GeoService.#salvandoNaBff) return;
    if (
      GeoService.#ultimoSalvo &&
      Date.now() - GeoService.#ultimoSalvo < GeoService.#SALVAR_COOLDOWN_MS
    ) return;

    // 1) Sempre persiste em localStorage (síncrono, sem rede necessária)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          GeoService.#LS_POSITION_KEY,
          JSON.stringify({ lat, lng, ts: Date.now() }),
        );
      }
    } catch { /* silencioso */ }

    GeoService.#debug('[GeoService] #salvarNaBff', { lat, lng });

    // 2) Envia para BFF autenticada — só se houver token válido
    if (typeof BffApiService === 'undefined' || !BffApiService.temTokenValido()) return;

    GeoService.#salvandoNaBff = true;
    try {
      const { error } = await BffApiService.patch(
        '/api/v1/clientes/localizacao',
        { lat, lng },
      );
      GeoService.#ultimoSalvo = Date.now();
      if (!error) {
        GeoService.#debug('[GeoService] BFF patch ok');
        return;
      }
      // 401 = token inválido/expirado — não adianta enfileirar para replay
      if (error.status === 401) {
        GeoService.#debug('[GeoService] BFF 401 — token inválido, não enfileirando');
        return;
      }
      // Erro de rede ou servidor (5xx) — enfileira para replay quando online
      GeoService.#debug('[GeoService] BFF offline, enfileirando IDB', error?.message);
      await GeoService.#enfileirarOffline(lat, lng);
    } finally {
      GeoService.#salvandoNaBff = false;
    }
  }

  /**
   * Enfileira PATCH de localização no IndexedDB para replay via Background Sync.
   * Só age se OfflineSyncQueue estiver disponível.
   */
  static async #enfileirarOffline(lat, lng) {
    if (typeof OfflineSyncQueue === 'undefined') return;
    try {
      const token   = GeoService.#lerToken();
      const baseUrl = typeof BffApiService !== 'undefined'
        ? BffApiService.baseUrl
        : 'https://bff.berberflow.shop';
      await OfflineSyncQueue.enqueue({
        tag:     'bf-sync-queue',
        url:     `${baseUrl}/api/v1/clientes/localizacao`,
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ lat, lng }),
      });
    } catch { /* silencioso */ }
  }

  /**
   * Lê a posição salva em localStorage se válida (< 1h).
   * @returns {{ lat: number, lng: number }|null}
   */
  static #lerLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(GeoService.#LS_POSITION_KEY);
      if (!raw) return null;
      const { lat, lng, ts } = JSON.parse(raw);
      if (Date.now() - ts > GeoService.#MAX_IDADE_BFF_MS) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }

  /**
   * Lê o access_token JWT do localStorage (Supabase).
   * Valida expiração com buffer de 60s, alinhado com BffApiService.
   * @returns {string|null}
   */
  static #lerToken() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(GeoService.#STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const token = parsed?.access_token ?? null;
      const expiresAt = parsed?.expires_at;
      if (!token || !expiresAt) return null;
      if (Date.now() / 1000 > expiresAt - 60) return null;
      return token;
    } catch {
      return null;
    }
  }

  /**
   * Tenta usar a ultima posicao salva no banco como fallback.
   * Notifica os widgets com o resultado.
   */
  static async #tentarFallbackBanco() {
    const pos = await GeoService.carregarDoBanco();
    if (pos) {
      // Popula cache com posicao do banco
      GeoService.#cache = { lat: pos.lat, lng: pos.lng, ts: Date.now() };
      document.dispatchEvent(new CustomEvent('geo:concedido'));
    } else {
      document.dispatchEvent(new CustomEvent('geo:negado'));
    }
  }
}
