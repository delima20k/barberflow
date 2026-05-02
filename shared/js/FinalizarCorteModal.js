'use strict';

// =============================================================
// FinalizarCorteModal.js — Modal de confirmação de finalização.
//
// Responsabilidade ÚNICA: confirmar que o dono deseja finalizar
// o atendimento de um cliente e exibir quem é o próximo na fila.
//
// Uso:
//   const ok = await FinalizarCorteModal.abrir({ clienteNome, proximoNome });
//   // ok: true (confirmado) | false (cancelado)
//
// Dependências: nenhuma
// =============================================================

class FinalizarCorteModal {

  // ──────────────────────────────────────────────────────────
  // Exibe a modal de finalização de corte.
  // @param {object} opts
  // @param {string}      opts.clienteNome  nome do cliente sendo atendido
  // @param {string|null} opts.proximoNome  nome do próximo (null se fila vazia)
  // @returns {Promise<boolean>}
  // ──────────────────────────────────────────────────────────
  static abrir({ clienteNome, proximoNome }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'fcm-overlay';

      const proximoHtml = proximoNome
        ? `<p class="fcm-proximo">Próximo: <strong>${FinalizarCorteModal.#escapar(proximoNome)}</strong></p>`
        : `<p class="fcm-proximo fcm-proximo--vazia">Fila vazia após este atendimento.</p>`;

      overlay.innerHTML = `
        <div class="fcm-card" role="dialog" aria-modal="true" aria-label="Finalizar corte">
          <p class="fcm-titulo">Finalizar corte</p>
          <p class="fcm-cliente">
            Cliente: <strong>${FinalizarCorteModal.#escapar(clienteNome)}</strong>
          </p>
          ${proximoHtml}
          <div class="fcm-acoes">
            <button class="fcm-btn fcm-btn--confirmar">✅ Finalizar</button>
            <button class="fcm-btn fcm-btn--cancelar">Cancelar</button>
          </div>
        </div>`;

      overlay.querySelector('.fcm-btn--confirmar').addEventListener('click', () => _fechar(true));
      overlay.querySelector('.fcm-btn--cancelar').addEventListener('click',  () => _fechar(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(false); });
      const onKey = e => { if (e.key === 'Escape') _fechar(false); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('fcm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(resultado);
      }

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
