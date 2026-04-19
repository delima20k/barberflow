'use strict';

/**
 * AnimationService — SRP: responsável EXCLUSIVAMENTE pelas animações de transição de tela.
 *
 * Usa Web Animations API (WAAPI):
 *  - lê posição real do elemento antes de cancelar qualquer animação em andamento
 *  - anima DE onde o elemento está (interrupção fluida)
 *  - sem opacity — aba permanece visível durante o slide
 *  - duração proporcional ao deslocamento restante
 *
 * API pública:
 *   AnimationService.animar(saindo, entrando, classeSaida, classeEntrada)
 */
const AnimationService = (() => {
  'use strict';

  const EASE = 'cubic-bezier(0.4,0,0.2,1)';

  /**
   * Lê o translateX atual do elemento em percentual relativo à sua largura.
   * Funciona mesmo enquanto uma animação WAAPI está rodando.
   * @param {HTMLElement} el
   * @returns {number} valor em % (ex: -60.0 significa 60% fora pela esquerda)
   */
  function _xAtual(el) {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return el.offsetWidth ? (m.m41 / el.offsetWidth) * 100 : 0;
  }

  /**
   * Anima a transição entre telas.
   *
   * @param {HTMLElement|null} saindo    — Tela que sai   (null = home, sem animação)
   * @param {HTMLElement|null} entrando  — Tela que entra (null = home, sem animação)
   * @param {'saindo'|'saindo-direita'}  classeSaida   — Direção da saída
   * @param {'ativa'|'entrando-lento'}   classeEntrada — Velocidade de entrada
   */
  function animar(saindo, entrando, classeSaida = 'saindo', classeEntrada = 'ativa') {

    // ── Tela que SAI ───────────────────────────────────────────────────────
    if (saindo) {
      const fromX = _xAtual(saindo);
      const toX   = classeSaida === 'saindo-direita' ? 100 : -100;
      const dist  = Math.abs(toX - fromX) / 100;
      const dur   = Math.round(480 * dist);

      saindo.getAnimations().forEach(a => a.cancel());
      saindo.classList.remove('ativa', 'entrando-lento', 'saindo', 'saindo-direita');

      if (dur < 16) {
        saindo.style.display       = 'none';
        saindo.style.pointerEvents = '';
      } else {
        saindo.style.display       = 'flex';
        saindo.style.pointerEvents = 'none';

        const a = saindo.animate(
          [
            { transform: `translateX(${fromX.toFixed(2)}%)` },
            { transform: `translateX(${toX}%)`               },
          ],
          { duration: dur, easing: EASE, fill: 'both' }
        );

        a.onfinish = () => {
          a.cancel();
          saindo.style.display       = 'none';
          saindo.style.pointerEvents = '';
        };
      }
    }

    // ── Tela que ENTRA ────────────────────────────────────────────────────
    if (entrando) {
      const isVisible = entrando.style.display === 'flex';
      const fromX     = isVisible ? _xAtual(entrando) : -100;
      const baseDur   = classeEntrada === 'entrando-lento' ? 720 : 320;
      const dist      = Math.abs(fromX) / 100;
      const dur       = Math.round(baseDur * dist);

      entrando.getAnimations().forEach(a => a.cancel());
      entrando.classList.remove('saindo', 'saindo-direita', 'ativa', 'entrando-lento');
      entrando.style.display = 'flex';
      void entrando.offsetWidth; // força reflow

      if (dur < 16) {
        entrando.style.display = '';
        entrando.classList.add('ativa');
      } else {
        const a = entrando.animate(
          [
            { transform: `translateX(${fromX.toFixed(2)}%)` },
            { transform: 'translateX(0%)'                    },
          ],
          { duration: dur, easing: EASE, fill: 'both' }
        );

        a.onfinish = () => {
          a.cancel();
          entrando.style.display = '';
          entrando.classList.add('ativa');
        };
      }
    }
  }

  return Object.freeze({ animar });
})();
