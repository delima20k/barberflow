'use strict';

// =============================================================
// StatusFechamentoModal.js — Modal de confirmação de fechamento
//
// Responsabilidade ÚNICA: exibir uma mini-modal com as opções de
// motivo de fechamento e retornar a escolha via Promise.
//
// Uso:
//   const tipo = await StatusFechamentoModal.confirmarFechamento();
//   // tipo: 'normal' | 'almoco' | 'janta' | null (cancelado)
//
// Reutilizável: pode ser usado por MinhaBarbeariaPage,
//   BarbeiroPage ou qualquer outra tela que precise desse fluxo.
// =============================================================

class StatusFechamentoModal {

  // ── Constantes de tipo ─────────────────────────────────────
  static TIPO = Object.freeze({
    NORMAL: 'normal',
    ALMOCO: 'almoco',
    JANTA:  'janta',
  });

  // ── Labels públicos (usados pelos renderers) ───────────────
  static LABELS = Object.freeze({
    aberta:  'Aberta',
    normal:  'Fechada',
    almoco:  'Pausa para Almoço',
    janta:   'Pausa para Janta',
  });

  // Resolve a label de exibição a partir do estado armazenado
  static labelStatus(isOpen, closeReason = null) {
    if (isOpen) return StatusFechamentoModal.LABELS.aberta;
    const r = closeReason?.toLowerCase();
    if (r === 'almoco') return StatusFechamentoModal.LABELS.almoco;
    if (r === 'janta')  return StatusFechamentoModal.LABELS.janta;
    return StatusFechamentoModal.LABELS.normal;
  }

  // Resolve a classe CSS de cor a partir do estado
  static classeStatus(isOpen, closeReason = null) {
    if (isOpen) return 'status--aberta';
    const r = closeReason?.toLowerCase();
    if (r === 'almoco' || r === 'janta') return 'status--pausa';
    return 'status--fechada';
  }

  // Resolve a variante bp-badge--* para cards e badges da página barbearia
  static classBadge(isOpen, closeReason = null) {
    if (isOpen) return 'bp-badge--open';
    const r = closeReason?.toLowerCase();
    if (r === 'almoco' || r === 'janta') return 'bp-badge--pausa';
    return 'bp-badge--closed';
  }

  // ──────────────────────────────────────────────────────────
  // Exibe a modal e retorna a escolha via Promise.
  // Retorna null se o usuário cancelar.
  // @returns {Promise<'normal'|'almoco'|'janta'|null>}
  // ──────────────────────────────────────────────────────────
  static confirmarFechamento() {
    return new Promise(resolve => {
      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'sfm-overlay';

      // Card da modal
      overlay.innerHTML = `
        <div class="sfm-card" role="dialog" aria-modal="true" aria-label="Fechar barbearia">
          <p class="sfm-titulo">Como deseja fechar?</p>
          <button class="sfm-btn sfm-btn--almoco" data-tipo="almoco">
            🍽️ Pausa para Almoço
          </button>
          <button class="sfm-btn sfm-btn--janta" data-tipo="janta">
            🌙 Pausa para Janta
          </button>
          <button class="sfm-btn sfm-btn--normal" data-tipo="normal">
            🔒 Fechar Normal
          </button>
          <button class="sfm-btn sfm-btn--cancelar" data-tipo="cancelar">
            Cancelar
          </button>
        </div>`;

      // Fecha ao clicar fora do card
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { _fechar(null); }
      });

      // Fecha com Escape
      const onKey = e => { if (e.key === 'Escape') _fechar(null); };
      document.addEventListener('keydown', onKey);

      overlay.querySelectorAll('[data-tipo]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tipo = btn.dataset.tipo;
          _fechar(tipo === 'cancelar' ? null : tipo);
        });
      });

      function _fechar(tipo) {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('sfm-overlay--saindo');
        setTimeout(() => overlay.remove(), 220);
        resolve(tipo);
      }

      document.body.appendChild(overlay);
      // Força reflow para a transição de entrada funcionar
      requestAnimationFrame(() => overlay.classList.add('sfm-overlay--visivel'));
    });
  }
}
