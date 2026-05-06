'use strict';

// =============================================================
// ConfirmacaoCorteModal.js — Modal de confirmação de presença
//                            do cliente na cadeira de produção.
//
// Responsabilidade ÚNICA: perguntar ao cliente se já está sentado
// para o corte e retornar a resposta.
//
// Uso:
//   const resp = await ConfirmacaoCorteModal.abrir({ clienteNome });
//   // resp: 'sim' | 'nao'
//
// Dependências: nenhuma
// =============================================================

class ConfirmacaoCorteModal {

  // ──────────────────────────────────────────────────────────
  // Exibe o modal de confirmação de presença.
  // @param {object}      opts
  // @param {string}      opts.clienteNome  nome do cliente a ser confirmado
  // @param {string|null} [opts.shopLogoUrl] URL pública do logo da barbearia
  // @returns {Promise<'sim'|'nao'>}
  // ──────────────────────────────────────────────────────────
  static abrir({ clienteNome, shopLogoUrl = null }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ccm-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Confirmação de presença');

      const iconeHtml = shopLogoUrl
        ? `<img class="ccm-icone-img" src="${ConfirmacaoCorteModal.#escaparAttr(shopLogoUrl)}" alt="" onerror="this.parentElement.innerHTML='💈'">`
        : '💈';

      overlay.innerHTML = `
        <div class="ccm-card">
          <div class="ccm-icone" aria-hidden="true">${iconeHtml}</div>
          <p class="ccm-titulo">É a sua vez!</p>
          <p class="ccm-corpo">
            ${ConfirmacaoCorteModal.#escapar(clienteNome)},
            você já está sentado para o corte?
          </p>
          <div class="ccm-acoes">
            <button class="ccm-btn ccm-btn--sim" autofocus>✅ Sim, estou!</button>
            <button class="ccm-btn ccm-btn--nao">❌ Não ainda</button>
          </div>
        </div>`;

      const _fechar = (resp) => {
        overlay.classList.add('ccm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(resp);
      };

      overlay.querySelector('.ccm-btn--sim').addEventListener('click', () => _fechar('sim'));
      overlay.querySelector('.ccm-btn--nao').addEventListener('click', () => _fechar('nao'));

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('ccm-overlay--visivel'));
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

  /**
   * Escapa string para uso seguro em atributos HTML (ex: src="...").
   * @param {string} str
   * @returns {string}
   */
  static #escaparAttr(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
