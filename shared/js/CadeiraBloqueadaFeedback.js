'use strict';

// =============================================================
// CadeiraBloqueadaFeedback.js — Feedback visual de cadeira bloqueada.
//
// Responsabilidade ÚNICA: quando o cliente clica na cadeira de um
// barbeiro indisponível (ex.: dono Inativo), balança a cadeira
// rapidamente para os lados (WAAPI) e exibe um balão acima dela
// informando a indisponibilidade. O balão é singleton (cliques
// repetidos não empilham) e se auto-remove.
//
// SRP: apenas UI — sem lógica de negócio. Quem decide se o barbeiro
// está indisponível é o chamador (ex.: BarbeariaPage).
//
// Dependências: nenhuma (DOM + WAAPI nativos).
// =============================================================

class CadeiraBloqueadaFeedback {

  static MENSAGEM_PADRAO  = 'Barbeiro indisponível no momento';
  static DURACAO_BALAO_MS = 2200;

  static #ID_ANIMACAO   = 'cadeira-balanco-bloqueada';
  static #FADE_MS       = 220;
  static #balaoAtivo    = null;
  static #timerEsconder = null;
  static #timerRemover  = null;

  /**
   * Balança a cadeira e mostra o balão de indisponibilidade acima dela.
   * @param {HTMLElement|null} cadeiraEl elemento .cdr-cadeira clicado
   * @param {string}           [mensagem]
   * @returns {boolean} true quando o feedback foi exibido
   */
  static mostrar(cadeiraEl, mensagem = CadeiraBloqueadaFeedback.MENSAGEM_PADRAO) {
    if (!cadeiraEl) return false;
    CadeiraBloqueadaFeedback.#balancar(cadeiraEl);
    CadeiraBloqueadaFeedback.#exibirBalao(cadeiraEl, mensagem);
    return true;
  }

  // ── Privados ────────────────────────────────────────────────

  /**
   * Balanço rápido para os lados via WAAPI (mesmo padrão do feedback de
   * clique da Cadeira). Cancela um balanço anterior antes de reiniciar.
   */
  static #balancar(el) {
    if (typeof el.animate !== 'function') return;

    el.getAnimations?.().forEach(animacao => {
      if (animacao.id === CadeiraBloqueadaFeedback.#ID_ANIMACAO) animacao.cancel();
    });

    const animacao = el.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(0)' },
    ], {
      duration: 420,
      easing: 'ease-in-out',
    });
    animacao.id = CadeiraBloqueadaFeedback.#ID_ANIMACAO;
  }

  /**
   * Balão flutuante acima da cadeira. position:fixed ancorado pelo
   * getBoundingClientRect — não clipa no scroll horizontal das rows.
   */
  static #exibirBalao(cadeiraEl, mensagem) {
    if (typeof document === 'undefined' || typeof cadeiraEl.getBoundingClientRect !== 'function') return;
    CadeiraBloqueadaFeedback.#removerBalao();

    const rect  = cadeiraEl.getBoundingClientRect();
    const balao = document.createElement('div');
    balao.className   = 'cdr-balao-indisponivel';
    balao.textContent = mensagem;
    balao.setAttribute('role', 'status');
    balao.style.left = `${rect.left + rect.width / 2}px`;
    balao.style.top  = `${rect.top}px`; // CSS translate(-50%, -100%) posiciona acima
    document.body.appendChild(balao);
    CadeiraBloqueadaFeedback.#balaoAtivo = balao;

    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => cb();
    raf(() => balao.classList.add('cdr-balao-indisponivel--visivel'));

    CadeiraBloqueadaFeedback.#timerEsconder = setTimeout(() => {
      CadeiraBloqueadaFeedback.#timerEsconder = null;
      balao.classList.remove('cdr-balao-indisponivel--visivel');
      CadeiraBloqueadaFeedback.#timerRemover = setTimeout(
        () => CadeiraBloqueadaFeedback.#removerBalao(),
        CadeiraBloqueadaFeedback.#FADE_MS,
      );
    }, CadeiraBloqueadaFeedback.DURACAO_BALAO_MS);
  }

  /** Remove o balão ativo e limpa timers (singleton — nunca empilha). */
  static #removerBalao() {
    if (CadeiraBloqueadaFeedback.#timerEsconder) clearTimeout(CadeiraBloqueadaFeedback.#timerEsconder);
    if (CadeiraBloqueadaFeedback.#timerRemover)  clearTimeout(CadeiraBloqueadaFeedback.#timerRemover);
    CadeiraBloqueadaFeedback.#timerEsconder = null;
    CadeiraBloqueadaFeedback.#timerRemover  = null;
    CadeiraBloqueadaFeedback.#balaoAtivo?.remove();
    CadeiraBloqueadaFeedback.#balaoAtivo = null;
  }
}

window.CadeiraBloqueadaFeedback = CadeiraBloqueadaFeedback;
