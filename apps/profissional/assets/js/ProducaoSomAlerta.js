'use strict';

// =============================================================
// ProducaoSomAlerta.js — Som de alerta quando um cliente senta na
// cadeira de produção (app profissional ABERTO).
//
// Responsabilidade ÚNICA: observar payloads Realtime de queue_entries
// e tocar o som de notificação (PushSoundService.alertar → mp3 3s +
// vibração) na PRIMEIRA vez em que cada entrada aparece como
// 'in_service'. É o fallback do Web Push: garante o alerta sonoro com
// o app aberto mesmo quando o push não chega (VAPID/subscription).
//
// SRP: sem DOM, sem rede. Dedup por id da entrada evita som repetido
// nos UPDATEs da mesma entrada; o cooldown evita rajada do Realtime e
// reduz o eco com o BF_PUSH_SOUND do Service Worker.
//
// Dependências: PushSoundService (opcional — degrada em silêncio).
// =============================================================

class ProducaoSomAlerta {

  static COOLDOWN_MS  = 4000;
  static MAX_ENTRADAS = 200;

  #alertadas    = new Set(); // ids de entrada que já dispararam o alerta
  #ultimoAlerta = 0;

  /**
   * Processa um payload Realtime de queue_entries e toca o som quando
   * uma entrada entra em produção (in_service) pela primeira vez.
   * @param {object|null} payload — payload do Supabase Realtime
   * @returns {boolean} true quando o som foi disparado
   */
  processarEvento(payload) {
    const entrada = payload?.new ?? null;
    if (!entrada?.id || entrada.status !== 'in_service') return false;
    if (this.#alertadas.has(entrada.id)) return false;

    this.#lembrar(entrada.id);

    const agora = Date.now();
    if (agora - this.#ultimoAlerta < ProducaoSomAlerta.COOLDOWN_MS) return false;
    this.#ultimoAlerta = agora;

    if (typeof PushSoundService !== 'undefined') {
      try { PushSoundService.alertar(); } catch (_) { /* autoplay pode bloquear */ }
    }
    return true;
  }

  /** Zera o estado (ex.: troca de barbearia). */
  reset() {
    this.#alertadas.clear();
    this.#ultimoAlerta = 0;
  }

  /** Guarda o id com teto de memória (recicla o conjunto ao estourar). */
  #lembrar(id) {
    if (this.#alertadas.size >= ProducaoSomAlerta.MAX_ENTRADAS) this.#alertadas.clear();
    this.#alertadas.add(id);
  }
}

window.ProducaoSomAlerta = ProducaoSomAlerta;
