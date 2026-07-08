'use strict';

// =============================================================
// PushSoundService.js — Som customizado de push (POO, static)
//
// Responsabilidade:
//   Tocar o som de notificação (mp3) quando um push chega com o app
//   ABERTO (foreground). Corta automaticamente em 5s, mesmo que o
//   arquivo seja mais longo.
//
// Contexto (Opção C):
//   - App aberto  → o Service Worker silencia o som do sistema
//     (showNotification silent:true) e manda BF_PUSH_SOUND para a
//     página; a página toca este mp3.
//   - App fechado → o Service Worker NÃO consegue tocar áudio (sem
//     Audio/AudioContext no SW); a própria notificação usa o som do
//     sistema (silent:false) + vibração. Limitação da plataforma.
//
// Uso:
//   PushSoundService.tocar();  // chamado ao receber BF_PUSH_SOUND
//
// Best-effort: autoplay pode ser bloqueado sem gesto do usuário; nesse
// caso falha em silêncio (sem quebrar nada, sem UI).
// =============================================================

class PushSoundService {

  static #URL      = '/shared/audio/notificacao-push.mp3';
  static #CORTE_MS = 5000;   // toca no máximo os primeiros 5 segundos
  static #audio    = null;   // instância reutilizada (evita empilhar áudios)
  static #timer    = null;

  /**
   * Toca o som de notificação e o interrompe após 5 segundos.
   * Reinicia do zero se já estiver tocando (evita sobreposição).
   */
  static tocar() {
    try {
      if (!PushSoundService.#audio) {
        PushSoundService.#audio = new Audio(PushSoundService.#URL);
        PushSoundService.#audio.preload = 'auto';
      }
      const audio = PushSoundService.#audio;

      clearTimeout(PushSoundService.#timer);
      try { audio.pause(); } catch (_) { /* ignore */ }
      audio.currentTime = 0;

      const p = audio.play();
      // Política de autoplay pode rejeitar sem gesto prévio → best-effort.
      if (p && typeof p.catch === 'function') p.catch(() => {});

      // Corte em 5s (independe da duração do arquivo).
      PushSoundService.#timer = setTimeout(() => {
        try { audio.pause(); audio.currentTime = 0; } catch (_) { /* ignore */ }
      }, PushSoundService.#CORTE_MS);
    } catch (_) {
      // Audio indisponível (SSR, browser antigo) — silencioso.
    }
  }

  /** Para o som imediatamente (ex.: usuário abriu a notificação). */
  static parar() {
    clearTimeout(PushSoundService.#timer);
    if (PushSoundService.#audio) {
      try { PushSoundService.#audio.pause(); PushSoundService.#audio.currentTime = 0; } catch (_) { /* ignore */ }
    }
  }
}
