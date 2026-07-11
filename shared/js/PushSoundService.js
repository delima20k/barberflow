'use strict';

// =============================================================
// PushSoundService.js — Som customizado de push (POO, static)
//
// Responsabilidade:
//   Tocar o som de notificação (mp3) quando um push chega com o app
//   ABERTO (foreground). Corta automaticamente em 3s, mesmo que o
//   arquivo seja mais longo.
//
// Contexto:
//   - App aberto  → o Service Worker manda BF_PUSH_SOUND para a página;
//     a página tenta tocar este mp3 e solicita vibração.
//   - App fechado → o Service Worker NÃO consegue tocar áudio (sem
//     Audio/AudioContext no SW); a própria notificação usa o som do
//     sistema (silent:false) + vibração. Limitação da plataforma.
//
// Uso:
//   PushSoundService.tocar();  // chamado ao receber BF_PUSH_SOUND
//
// Best-effort: autoplay pode ser bloqueado sem gesto do usuário; nesse
// caso registra o erro sem quebrar o fluxo da notificação.
// =============================================================

class PushSoundService {

  static #URL      = '/shared/audio/notificacao-push.mp3';
  static #CORTE_MS = 3000;   // toca no máximo os primeiros 3 segundos
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
        if (p && typeof p.then === 'function') {
          p.then(finalizar).catch(err => {
            PushSoundService.#registrarErro('audio.play() de preparação falhou:', err);
            finalizar();
          });
        }
        else finalizar();
      } catch (err) {
        PushSoundService.#registrarErro('preparação do áudio falhou:', err);
      }
    };

    for (const evento of PushSoundService.#EVENTOS_PREPARO) {
      document.addEventListener(evento, prepararNoGesto, { capture: true, passive: true });
    }
  }

  /**
   * Toca o som de notificação e o interrompe após 3 segundos.
   * Reinicia do zero se já estiver tocando (evita sobreposição).
   */
  static tocar() {
    try {
      const audio = PushSoundService.#garantirAudio();

      clearTimeout(PushSoundService.#timer);
      try { audio.pause(); } catch (_) { /* ignore */ }
      audio.currentTime = 0;

      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => PushSoundService.#registrarErro('audio.play() falhou:', err));
      }

      // Corte em 3s (independe da duração do arquivo).
      PushSoundService.#timer = setTimeout(() => {
        try { audio.pause(); audio.currentTime = 0; } catch (_) { /* ignore */ }
      }, PushSoundService.#CORTE_MS);
    } catch (err) {
      PushSoundService.#registrarErro('não foi possível iniciar o áudio:', err);
    }
  }

  /**
   * Tenta reproduzir o MP3 e vibrar quando existe uma página aberta.
   * A API de vibração é best-effort e pode não ser suportada no desktop.
   * @param {number[]} [pattern]
   */
  static alertar(pattern = [200, 100, 200]) {
    PushSoundService.tocar();
    PushSoundService.vibrar(pattern);
  }

  static vibrar(pattern = [200, 100, 200]) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
    try {
      return navigator.vibrate(pattern);
    } catch (err) {
      PushSoundService.#registrarErro('navigator.vibrate() falhou:', err);
      return false;
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

  static #registrarErro(mensagem, erro) {
    if (typeof LoggerService !== 'undefined' && typeof LoggerService.error === 'function') {
      LoggerService.error(`[PushSoundService] ${mensagem}`, erro);
      return;
    }
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(`[PushSoundService] ${mensagem}`, erro);
    }
  }
}
