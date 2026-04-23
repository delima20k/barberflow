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

  /**
   * Animação GASPAR — as palavras do texto aparecem uma a uma (fade-in escalonado)
   * e depois toda a mensagem desaparece suavemente (fade-out).
   *
   * Uso:
   *   AnimationService.gaspar(elemento, 'Mensagem aqui', 3500);
   *   AnimationService.gaspar(elemento, 'Mensagem aqui', 3500, 'gaspar-ok');
   *
   * @param {HTMLElement} el               — Elemento que exibirá a mensagem
   * @param {string}      texto            — Texto a ser animado
   * @param {number}      [duracaoMs=3500] — Tempo total visível antes do fade-out
   * @param {string}      [classeExtra=''] — Classe CSS aplicada durante a animação (removida no fim)
   */
  function gaspar(el, texto, duracaoMs = 3500, classeExtra = '') {
    if (!el || !texto) return;

    // Cancela execução anterior se houver
    if (el._gasparTimer) { clearTimeout(el._gasparTimer); el._gasparTimer = null; }
    el.getAnimations().forEach(a => a.cancel());
    el.style.opacity = '';
    if (el._gasparClasse) { el.classList.remove(el._gasparClasse); el._gasparClasse = null; }
    if (classeExtra) { el.classList.add(classeExtra); el._gasparClasse = classeExtra; }

    // Fase 1 — Entrada: cada palavra aparece escalonada (opacity 0 → 1)
    const palavras         = String(texto).trim().split(/\s+/);
    el.innerHTML           = palavras.map(p => `<span style="opacity:0">${p}</span>`).join(' ');
    const spans            = [...el.querySelectorAll('span')];
    const DELAY_PALAVRA_MS = 110;
    const DUR_ENTRADA_MS   = 350;

    spans.forEach((span, i) => {
      span.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: DUR_ENTRADA_MS, delay: i * DELAY_PALAVRA_MS, fill: 'forwards', easing: 'ease-out' }
      );
    });

    // Fase 2 — Saída: elemento some suavemente após pausa
    const totalEntrada = spans.length * DELAY_PALAVRA_MS + DUR_ENTRADA_MS;
    const pausa        = Math.max(duracaoMs - totalEntrada - 900, 600);
    const DUR_SAIDA_MS = 900;

    el._gasparTimer = setTimeout(() => {
      el._gasparTimer = null;
      el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: DUR_SAIDA_MS, fill: 'forwards', easing: 'ease-in' }
      ).onfinish = () => {
        el.innerHTML     = '';
        el.style.opacity = '';
        if (el._gasparClasse) { el.classList.remove(el._gasparClasse); el._gasparClasse = null; }
      };
    }, totalEntrada + pausa);
  }

  return Object.freeze({ animar, gaspar });
})();
