'use strict';

// =============================================================
// MenosPercentualModal.js — Modal para aplicar taxa da maquininha.
//
// Responsabilidade ÚNICA: coletar um percentual numérico do usuário
// (ex.: 1,5%) e confirmar a aplicação do desconto sobre o valor bruto.
//
// Uso:
//   const { confirmado, porcentagem } =
//     await MenosPercentualModal.abrir({ metodo: 'credito', valorBruto: 120.50 });
//   // confirmado: true | false
//   // porcentagem: number | null
//
// Dependências: nenhuma
// Camada: interfaces
// =============================================================

class MenosPercentualModal {

  static #METODO_LABEL = Object.freeze({
    credito: 'Crédito',
    debito:  'Débito',
  });

  // ═══════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre o modal de taxa da maquininha.
   * @param {object} opts
   * @param {string} opts.metodo      'credito' | 'debito'
   * @param {number} opts.valorBruto  valor original da receita
   * @returns {Promise<{confirmado: boolean, porcentagem: number|null}>}
   */
  static abrir({ metodo, valorBruto }) {
    return new Promise(resolve => {
      const label = MenosPercentualModal.#METODO_LABEL[metodo] ?? metodo;
      const bruto = Number(valorBruto) || 0;

      const overlay = document.createElement('div');
      overlay.className = 'mpm-overlay';

      overlay.innerHTML = `
        <div class="mpm-card" role="dialog" aria-modal="true" aria-label="Taxa da maquininha">
          <p class="mpm-titulo">Taxa da maquininha</p>
          <p class="mpm-subtitulo">${MenosPercentualModal.#escapar(label)}</p>
          <div class="mpm-bruto-wrap">
            <span class="mpm-bruto-label">Valor bruto</span>
            <span class="mpm-bruto-valor">${MenosPercentualModal.#formatarValor(bruto)}</span>
          </div>
          <div class="mpm-input-wrap">
            <input
              id="mpm-input"
              class="mpm-input"
              type="number"
              min="0.01"
              max="99.99"
              step="0.01"
              placeholder="ex: 1,5"
              inputmode="decimal"
              aria-label="Percentual da taxa"
            />
            <span class="mpm-pct-sufixo" aria-hidden="true">%</span>
          </div>
          <p class="mpm-preview" id="mpm-preview" aria-live="polite"></p>
          <div class="mpm-acoes">
            <button class="mpm-btn mpm-btn--cancelar" id="mpm-cancelar" type="button">Cancelar</button>
            <button class="mpm-btn mpm-btn--ok" id="mpm-ok" type="button" disabled>OK</button>
          </div>
        </div>`;

      const inputEl    = overlay.querySelector('#mpm-input');
      const okEl       = overlay.querySelector('#mpm-ok');
      const cancelarEl = overlay.querySelector('#mpm-cancelar');
      const previewEl  = overlay.querySelector('#mpm-preview');

      const fechar = (confirmado, porcentagem) => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('mpm-overlay--saindo');
        setTimeout(() => { overlay.remove(); resolve({ confirmado, porcentagem }); }, 220);
      };

      const onKey = e => { if (e.key === 'Escape') fechar(false, null); };
      document.addEventListener('keydown', onKey);

      cancelarEl.addEventListener('click', () => fechar(false, null));

      okEl.addEventListener('click', () => {
        const pct = MenosPercentualModal.#parsePct(inputEl.value);
        if (pct === null) return;
        fechar(true, pct);
      });

      inputEl.addEventListener('input', () => {
        const pct = MenosPercentualModal.#parsePct(inputEl.value);
        const valido = pct !== null;
        okEl.disabled = !valido;
        if (valido && bruto > 0) {
          const liquido = bruto * (1 - pct / 100);
          previewEl.textContent =
            `${MenosPercentualModal.#formatarValor(bruto)} → ${MenosPercentualModal.#formatarValor(liquido)}`;
        } else {
          previewEl.textContent = '';
        }
      });

      overlay.addEventListener('click', e => { if (e.target === overlay) fechar(false, null); });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('mpm-overlay--visivel');
        inputEl.focus();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Converte string do input em número válido ou null.
   * Aceita ponto e vírgula como separador decimal.
   * @param {string} val
   * @returns {number|null}
   */
  static #parsePct(val) {
    const str = String(val ?? '').trim().replace(',', '.');
    const n   = Number(str);
    if (str === '' || Number.isNaN(n) || n <= 0 || n >= 100) return null;
    return n;
  }

  static #formatarValor(v) {
    return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
