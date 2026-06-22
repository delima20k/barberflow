'use strict';

// =============================================================
// MusicCacheService.js — cache em memória com TTL (padrão 30min).
//
// Guarda valores por chave com expiração. Suporta "offline parcial":
// mesmo expirado, o último valor continua acessível via stale(), para
// degradar bem quando a rede falha.
//
// `now` injetável p/ teste determinístico do TTL.
// =============================================================

class MusicCacheService {
  static TTL_MS = 30 * 60 * 1000; // 30 minutos

  #ttl;
  #now;
  #mapa = new Map(); // key -> { value, expiresAt }

  constructor({ ttlMs = MusicCacheService.TTL_MS, now = () => Date.now() } = {}) {
    this.#ttl = Number(ttlMs) > 0 ? Number(ttlMs) : MusicCacheService.TTL_MS;
    this.#now = typeof now === 'function' ? now : () => Date.now();
  }

  /** Grava o valor com expiração agora + TTL. */
  set(key, value) {
    this.#mapa.set(key, { value, expiresAt: this.#now() + this.#ttl });
    return value;
  }

  /** Valor se ainda válido (não expirado); senão undefined. */
  get(key) {
    const e = this.#mapa.get(key);
    if (!e) return undefined;
    return e.expiresAt > this.#now() ? e.value : undefined;
  }

  /** Há valor válido (dentro do TTL)? */
  valido(key) {
    const e = this.#mapa.get(key);
    return !!e && e.expiresAt > this.#now();
  }

  /** Último valor guardado MESMO expirado (offline parcial); undefined se nunca houve. */
  stale(key) {
    return this.#mapa.get(key)?.value;
  }

  invalidar(key) {
    if (key === undefined) this.#mapa.clear();
    else this.#mapa.delete(key);
  }
}

// UMD — testes via require(); ignorado no browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicCacheService };
}
