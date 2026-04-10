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
  static #SALVAR_COOLDOWN_MS = 10 * 60 * 1000; // throttle: salva no banco no max 1x/10min
  static #cache              = null;            // { lat, lng, ts }
  static #ultimoSalvo        = null;            // Date.now() do ultimo save no banco

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
    return GeoService.#solicitarGPS();
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
   * - Se concedido: salva no banco + notifica widgets
   * - Se negado: tenta fallback do banco (ultima posicao salva)
   */
  static solicitarNaPrimeiraVez() {
    if (!navigator.geolocation) {
      GeoService.#tentarFallbackBanco();
      return;
    }
    GeoService.obter()
      .then(() => {
        if (typeof MapWidget               !== 'undefined') MapWidget.onGPSConcedido();
        if (typeof NearbyBarbershopsWidget  !== 'undefined') NearbyBarbershopsWidget.onGPSConcedido();
      })
      .catch(() => {
        // GPS negado — tenta posicao do banco como fallback silencioso
        GeoService.#tentarFallbackBanco();
      });
  }

  /**
   * Retorna a ultima posicao salva no banco para o usuario logado.
   * Util como fallback quando o GPS esta negado.
   * So usa se a posicao tiver menos de 1 hora.
   * @returns {Promise<{lat: number, lng: number}|null>}
   */
  static async carregarDoBanco() {
    try {
      const { data: { user } } = await SupabaseService.client.auth.getUser();
      if (!user) return null;
      const { data, error } = await SupabaseService.client
        .from('profiles')
        .select('last_lat, last_lng, last_location_at')
        .eq('id', user.id)
        .single();
      if (error || !data?.last_lat || !data?.last_lng) return null;
      // Invalida se a posicao tiver mais de 1 hora
      const umHoraAtras = Date.now() - 60 * 60 * 1000;
      if (new Date(data.last_location_at).getTime() < umHoraAtras) return null;
      return { lat: Number(data.last_lat), lng: Number(data.last_lng) };
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

  // ═══════════════════════════════════════════════════════════
  // PRIVADO
  // ═══════════════════════════════════════════════════════════

  static #cacheValido() {
    return (
      GeoService.#cache !== null &&
      Date.now() - GeoService.#cache.ts < GeoService.#CACHE_TTL_MS
    );
  }

  static #solicitarGPS() {
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
          GeoService.#salvarNoBanco(pos.lat, pos.lng); // fire-and-forget
          resolve({ lat: pos.lat, lng: pos.lng });
        },
        (err) => {
          reject(new Error(GeoService.#mensagemErro(err.code)));
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
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
   * Salva lat/lng no banco (profiles) com throttle de 10 min.
   * Fire-and-forget — nao bloqueia o fluxo.
   */
  static async #salvarNoBanco(lat, lng) {
    if (
      GeoService.#ultimoSalvo &&
      Date.now() - GeoService.#ultimoSalvo < GeoService.#SALVAR_COOLDOWN_MS
    ) return;
    try {
      const { data: { user } } = await SupabaseService.client.auth.getUser();
      if (!user) return;
      await SupabaseService.client
        .from('profiles')
        .update({
          last_lat:         lat,
          last_lng:         lng,
          last_location_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      GeoService.#ultimoSalvo = Date.now();
    } catch { /* silencioso — nao interrumpe o app */ }
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
      if (typeof MapWidget               !== 'undefined') MapWidget.onGPSConcedido();
      if (typeof NearbyBarbershopsWidget  !== 'undefined') NearbyBarbershopsWidget.onGPSConcedido();
    } else {
      if (typeof MapWidget               !== 'undefined') MapWidget.onGPSNegado();
      if (typeof NearbyBarbershopsWidget  !== 'undefined') NearbyBarbershopsWidget.onGPSNegado();
    }
  }
}
