// =============================================================
// ClienteAusenteModal.js — Modal para o BARBEIRO quando o cliente
//                          não confirmou presença na cadeira.
//
// Responsabilidade ÚNICA: apresentar as opções de ação ao barbeiro
// (remover cliente ou enviar mensagem) e retornar a escolha.
//
// Uso:
//   // Modo padrão — cliente não confirmou após grace:
//   const acao = await ClienteAusenteModal.abrir({ clienteNome });
//   // acao: 'remover' | 'mensagem' | null (fechado sem escolha)
//
//   // Modo 1º "Não" — cliente avisou que ainda não está pronto:
//   const acao = await ClienteAusenteModal.abrir({ clienteNome, modo: 'nao_sentado' });
//   // acao: 'remover' | null
//
// Dependências: nenhuma
// =============================================================

class ClienteAusenteModal {

  // ──────────────────────────────────────────────────────────
  // Exibe o modal de cliente ausente para o barbeiro.
  // @param {object}                   opts
  // @param {string}                   opts.clienteNome  nome do cliente
  // @param {'ausente'|'nao_sentado'}  [opts.modo='ausente']
  // @returns {Promise<'remover'|'mensagem'|null>}
  // ──────────────────────────────────────────────────────────
  static abrir({ clienteNome, modo = 'ausente' }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'cam-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', modo === 'nao_sentado' ? 'Cliente ainda não pronto' : 'Cliente ausente');

      const nomeEscapado = ClienteAusenteModal.#escapar(clienteNome);

      const conteudo = modo === 'nao_sentado'
        ? {
            icone:  '⏳',
            titulo: 'Cliente ainda não está pronto',
            corpo:  `<strong>${nomeEscapado}</strong> avisou que ainda não está sentado na cadeira.`,
            acoes:  `
              <button class="cam-btn cam-btn--mensagem">✅ OK, aguardar</button>
              <button class="cam-btn cam-btn--remover">🗑 Chamar próximo</button>`,
          }
        : {
            icone:  '🔔',
            titulo: 'Cliente ausente',
            corpo:  `<strong>${nomeEscapado}</strong> não confirmou presença na cadeira.`,
            acoes:  `
              <button class="cam-btn cam-btn--remover">🗑 Remover e chamar próximo</button>
              <button class="cam-btn cam-btn--mensagem">💬 Enviar mensagem</button>`,
          };

      overlay.innerHTML = `
        <div class="cam-card">
          <button class="cam-fechar" aria-label="Fechar">✕</button>
          <div class="cam-icone" aria-hidden="true">${conteudo.icone}</div>
          <p class="cam-titulo">${conteudo.titulo}</p>
          <p class="cam-corpo">${conteudo.corpo}</p>
          <div class="cam-acoes">${conteudo.acoes}</div>
        </div>`;

      const _fechar = (acao) => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('cam-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(acao);
      };

      overlay.querySelector('.cam-fechar').addEventListener('click', () => _fechar(null));
      overlay.querySelector('.cam-btn--remover').addEventListener('click', () => _fechar('remover'));

      // Botão mensagem: no modo nao_sentado é "OK, aguardar" → retorna null (dismiss)
      const btnMensagem = overlay.querySelector('.cam-btn--mensagem');
      if (btnMensagem) {
        btnMensagem.addEventListener('click', () =>
          _fechar(modo === 'nao_sentado' ? null : 'mensagem'),
        );
      }

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
