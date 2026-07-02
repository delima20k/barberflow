'use strict';

// =============================================================
// FinalizarCorteModal.js - Modal de finalizacao da cadeira.
//
// Coleta metodo de pagamento ou libera a cadeira sem registrar corte.
// =============================================================

class FinalizarCorteModal {

  static #METODOS = Object.freeze([
    { valor: 'pix',       icone: '&#9889;',   label: 'PIX' },
    { valor: 'dinheiro',  icone: '&#128181;', label: 'Dinheiro' },
    { valor: 'credito',   icone: '&#128179;', label: 'Cr&eacute;dito' },
    { valor: 'debito',    icone: '&#127974;', label: 'D&eacute;bito' },
    { valor: 'sem_corte', icone: '&#8634;',   label: 'N&atilde;o cortou', especial: true },
  ]);

  /**
   * @param {object} opts
   * @param {string} opts.clienteNome
   * @param {string|null} opts.proximoNome
   * @returns {Promise<{confirmado:boolean, paymentMethod:string|null, semCorte:boolean}>}
   */
  static abrir({ clienteNome, proximoNome }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'fcm-overlay';

      const proximoHtml = proximoNome
        ? `<p class="fcm-proximo">Pr&oacute;ximo: <strong>${FinalizarCorteModal.#escapar(proximoNome)}</strong></p>`
        : '<p class="fcm-proximo fcm-proximo--vazia">Fila vazia ap&oacute;s este atendimento.</p>';

      const metodosHtml = FinalizarCorteModal.#METODOS.map(m =>
        `<button class="fcm-metodo${m.especial ? ' fcm-metodo--sem-corte' : ''}" data-metodo="${m.valor}" type="button" aria-pressed="false">
          <span class="fcm-metodo-icone">${m.icone}</span>
          <span class="fcm-metodo-label">${m.label}</span>
        </button>`,
      ).join('');

      overlay.innerHTML = `
        <div class="fcm-card" role="dialog" aria-modal="true" aria-label="Finalizar corte">
          <p class="fcm-titulo">Finalizar corte</p>
          <p class="fcm-cliente">
            Cliente: <strong>${FinalizarCorteModal.#escapar(clienteNome)}</strong>
          </p>
          ${proximoHtml}
          <p class="fcm-pagamento-label">Como deseja finalizar?</p>
          <div class="fcm-metodos">${metodosHtml}</div>
          <div class="fcm-acoes">
            <button class="fcm-btn fcm-btn--confirmar" disabled>Finalizar</button>
            <button class="fcm-btn fcm-btn--cancelar">Cancelar</button>
          </div>
        </div>`;

      let metodoSelecionado = null;
      const btnConfirmar = overlay.querySelector('.fcm-btn--confirmar');

      overlay.querySelectorAll('.fcm-metodo').forEach(btn => {
        btn.addEventListener('click', () => {
          overlay.querySelectorAll('.fcm-metodo').forEach(b => {
            b.classList.remove('fcm-metodo--ativo');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('fcm-metodo--ativo');
          btn.setAttribute('aria-pressed', 'true');
          metodoSelecionado = btn.dataset.metodo;
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = metodoSelecionado === 'sem_corte'
            ? 'Liberar sem corte'
            : 'Finalizar';
        });
      });

      const fechar = confirmado => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('fcm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);

        const semCorte = confirmado && metodoSelecionado === 'sem_corte';
        resolve({
          confirmado,
          paymentMethod: confirmado && !semCorte ? metodoSelecionado : null,
          semCorte,
        });
      };

      const onKey = e => { if (e.key === 'Escape') fechar(false); };
      document.addEventListener('keydown', onKey);

      btnConfirmar.addEventListener('click', () => {
        if (!metodoSelecionado) return;
        fechar(true);
      });
      overlay.querySelector('.fcm-btn--cancelar').addEventListener('click', () => fechar(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) fechar(false); });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('fcm-overlay--visivel'));
    });
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
