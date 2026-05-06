'use strict';

// =============================================================
// ClienteAusenteModal.js — Modal para o BARBEIRO quando o cliente
//                          não confirmou presença na cadeira.
//
// Responsabilidade ÚNICA: apresentar as opções de ação ao barbeiro
// (remover cliente ou enviar mensagem) e retornar a escolha.
//
// Uso:
//   const acao = await ClienteAusenteModal.abrir({ clienteNome });
//   // acao: 'remover' | 'mensagem' | null (fechado sem escolha)
//
// Dependências: nenhuma
// =============================================================

class ClienteAusenteModal {

  // ──────────────────────────────────────────────────────────
  // Exibe o modal de cliente ausente para o barbeiro.
  // @param {object} opts
  // @param {string} opts.clienteNome  nome do cliente ausente
  // @returns {Promise<'remover'|'mensagem'|null>}
  // ──────────────────────────────────────────────────────────
  static abrir({ clienteNome }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'cam-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Cliente ausente');

      overlay.innerHTML = `
        <div class="cam-card">
          <button class="cam-fechar" aria-label="Fechar">✕</button>
          <div class="cam-icone" aria-hidden="true">🔔</div>
          <p class="cam-titulo">Cliente ausente</p>
          <p class="cam-corpo">
            <strong>${ClienteAusenteModal.#escapar(clienteNome)}</strong>
            não confirmou presença na cadeira.
          </p>
          <div class="cam-acoes">
            <button class="cam-btn cam-btn--remover">🗑 Remover e chamar próximo</button>
            <button class="cam-btn cam-btn--mensagem">💬 Enviar mensagem</button>
          </div>
        </div>`;

      const _fechar = (acao) => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('cam-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(acao);
      };

      overlay.querySelector('.cam-fechar').addEventListener('click', () => _fechar(null));
      overlay.querySelector('.cam-btn--remover').addEventListener('click', () => _fechar('remover'));
      overlay.querySelector('.cam-btn--mensagem').addEventListener('click', () => _fechar('mensagem'));

      const onKey = (e) => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('cam-overlay--visivel'));
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
