'use strict';

// =============================================================
// GuestFilaModal.js — Formulário compacto de identificação para
// visitante sem login entrar na fila (Frente B).
//
// Responsabilidade ÚNICA: coletar nome (obrigatório) e WhatsApp
// (opcional) e devolver os dados — sem nenhuma regra de negócio,
// sem tocar em rede. A validação real acontece no servidor
// (POST /api/v1/fila/entrar); o que existe aqui é só UX.
//
// Uso:
//   const dados = await GuestFilaModal.abrir();
//   // dados: { nome: string, telefone: string|null } | null (cancelado)
//
// Dependências: nenhuma
// =============================================================

class GuestFilaModal {

  static #NOME_MAX = 80;

  /** @returns {Promise<{ nome: string, telefone: string|null }|null>} */
  static abrir() {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'gfm-overlay';
      overlay.innerHTML = `
        <div class="gfm-card" role="dialog" aria-modal="true" aria-label="Entrar na fila">
          <div class="gfm-header">
            <p class="gfm-titulo">Entrar na fila</p>
            <button type="button" class="gfm-fechar" aria-label="Fechar">✕</button>
          </div>
          <form class="gfm-form" novalidate>
            <label class="gfm-campo">
              <span class="gfm-label">Nome</span>
              <input class="gfm-input" name="nome" type="text" maxlength="${GuestFilaModal.#NOME_MAX}" autocomplete="name" required>
            </label>
            <label class="gfm-campo">
              <span class="gfm-label">WhatsApp <small>(opcional)</small></span>
              <input class="gfm-input" name="telefone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 99999-9999">
            </label>
            <input class="gfm-hp" name="site" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="gfm-footer">
              <button type="submit" class="gfm-btn gfm-btn--confirmar" disabled>OK</button>
              <button type="button" class="gfm-btn gfm-btn--cancelar">Cancelar</button>
            </div>
          </form>
        </div>`;

      const form         = overlay.querySelector('.gfm-form');
      const nomeInput     = overlay.querySelector('input[name="nome"]');
      const telefoneInput = overlay.querySelector('input[name="telefone"]');
      const hpInput       = overlay.querySelector('.gfm-hp');
      const confirmarBtn  = overlay.querySelector('.gfm-btn--confirmar');

      const atualizar = () => { confirmarBtn.disabled = nomeInput.value.trim().length === 0; };
      nomeInput.addEventListener('input', atualizar);

      form.addEventListener('submit', e => {
        e.preventDefault();
        // Honeypot preenchido → provável bot; descarta silenciosamente sem
        // dar sinal de sucesso nem de falha (mesma UX de um cancelamento).
        if (hpInput.value) { _fechar(null); return; }

        const nome = nomeInput.value.trim();
        if (!nome) return;
        _fechar({ nome, telefone: telefoneInput.value.trim() || null });
      });

      overlay.querySelector('.gfm-btn--cancelar').addEventListener('click', () => _fechar(null));
      overlay.querySelector('.gfm-fechar').addEventListener('click',         () => _fechar(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) _fechar(null); });
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      function _fechar(resultado) {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('gfm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(resultado);
      }

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        overlay.classList.add('gfm-overlay--visivel');
        nomeInput.focus();
      });
    });
  }
}
