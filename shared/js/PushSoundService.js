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
  static #preparado = false;
  static #EVENTOS_PREPARO = ['pointerdown', 'touchstart', 'keydown', 'click'];

  /**
   * Prepara o elemento de audio no primeiro gesto do usuario.
   * Isso reduz rejeicoes de autoplay quando o push chega com a janela em background.
   */
  static preparar() {
    if (PushSoundService.#preparado) return;
    if (typeof document === 'undefined' || typeof Audio === 'undefined') return;
    PushSoundService.#preparado = true;

    const prepararNoGesto = () => {
      for (const evento of PushSoundService.#EVENTOS_PREPARO) {
        document.removeEventListener(evento, prepararNoGesto, true);
      }

      try {
        const audio = PushSoundService.#garantirAudio();
        const volumeAnterior = audio.volume;
        const mutedAnterior = audio.muted;
        audio.volume = 0;
        audio.muted = true;

        const finalizar = () => {
          try {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = volumeAnterior;
            audio.muted = mutedAnterior;
          } catch (_) { /* ignore */ }
        };

        const p = audio.play();
        if (p && typeof p.then === 'function') p.then(finalizar).catch(finalizar);
        else finalizar();
      } catch (_) {
        // Preparacao e best-effort; tocar() ainda tentara quando o push chegar.
      }
    };

    for (const evento of PushSoundService.#EVENTOS_PREPARO) {
      document.addEventListener(evento, prepararNoGesto, { capture: true, passive: true });
    }
  }

  /**
   * Toca o som de notificação e o interrompe após 5 segundos.
   * Reinicia do zero se já estiver tocando (evita sobreposição).
   */
  static tocar() {
    try {
      const audio = PushSoundService.#garantirAudio();

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

  static #garantirAudio() {
    if (!PushSoundService.#audio) {
      PushSoundService.#audio = new Audio(PushSoundService.#URL);
      PushSoundService.#audio.preload = 'auto';
    }
    return PushSoundService.#audio;
  }
}
