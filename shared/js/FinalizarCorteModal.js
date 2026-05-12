'use strict';

// =============================================================
// FinalizarCorteModal.js — Modal de confirmação de finalização.
//
// Responsabilidade ÚNICA: confirmar que o barbeiro deseja finalizar
// o atendimento, coletar o método de pagamento e exibir quem é
// o próximo na fila.
//
// Uso:
//   const { confirmado, paymentMethod } =
//     await FinalizarCorteModal.abrir({ clienteNome, proximoNome });
//   // confirmado: true | false
  //   // paymentMethod: 'pix' | 'dinheiro' | 'credito' | 'debito' | null
//
// Dependências: nenhuma
// =============================================================

class FinalizarCorteModal {

  static #METODOS = Object.freeze([
    { valor: 'pix',      icone: '⚡', label: 'PIX'     },
    { valor: 'dinheiro', icone: '💵', label: 'Dinheiro' },
    { valor: 'credito',  icone: '💳', label: 'Crédito'  },
    { valor: 'debito',   icone: '🏧', label: 'Débito'   },
  ]);

  // ──────────────────────────────────────────────────────────
  // Exibe a modal de finalização de corte.
  // @param {object} opts
  // @param {string}      opts.clienteNome  nome do cliente sendo atendido
  // @param {string|null} opts.proximoNome  nome do próximo (null se fila vazia)
  // @returns {Promise<{confirmado: boolean, paymentMethod: string|null}>}
  // ──────────────────────────────────────────────────────────
  static abrir({ clienteNome, proximoNome }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'fcm-overlay';

      const proximoHtml = proximoNome
        ? `<p class="fcm-proximo">Próximo: <strong>${FinalizarCorteModal.#escapar(proximoNome)}</strong></p>`
        : `<p class="fcm-proximo fcm-proximo--vazia">Fila vazia após este atendimento.</p>`;

      const metodosHtml = FinalizarCorteModal.#METODOS.map(m =>
        `<button class="fcm-metodo" data-metodo="${m.valor}" type="button" aria-pressed="false">
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
          <p class="fcm-pagamento-label">Como o cliente pagou?</p>
          <div class="fcm-metodos">${metodosHtml}</div>
          <div class="fcm-acoes">
            <button class="fcm-btn fcm-btn--confirmar" disabled>✅ Finalizar</button>
            <button class="fcm-btn fcm-btn--cancelar">Cancelar</button>
          </div>
        </div>`;

      let metodoSelecionado = null;
      const btnConfirmar    = overlay.querySelector('.fcm-btn--confirmar');

      // Seleção de método de pagamento
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
        });
      });

      const fechar = confirmado => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('fcm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve({ confirmado, paymentMethod: confirmado ? metodoSelecionado : null });
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

  // ── Privados ────────────────────────────────────────────────

  /**
   * Escapa texto para inserção segura em innerHTML.
   * @param {string} str
   * @returns {string}
   */
  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
