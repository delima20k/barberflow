'use strict';

// =============================================================
// BarberFinanceModal.js — Modal de extrato financeiro de um barbeiro.
//
// Responsabilidade ÚNICA: exibir lista de transações do barbeiro
// para um período, com totais e detalhes de cada corte.
//
// Uso:
//   await BarberFinanceModal.abrir({ professionalId, professionalNome, barbershopId, periodo });
//
// Dependências: FinanceiroService.js
// Camada: interfaces
// =============================================================

class BarberFinanceModal {

  static #METODO_LABEL = Object.freeze({
    pix:      'PIX',
    dinheiro: 'Dinheiro',
    cartao:   'Cartão',
  });

  // Sufixo CSS permitido por método — sem valores livres do banco em atributos DOM
  static #METODO_CLASSE = Object.freeze({
    pix:      'pix',
    dinheiro: 'dinheiro',
    cartao:   'cartao',
  });

  // ═══════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre a modal de extrato do barbeiro.
   * @param {object} opts
   * @param {string} opts.professionalId
   * @param {string} opts.professionalNome
   * @param {string} opts.barbershopId
   * @param {string} opts.periodo  'hoje' | 'semana' | 'mes' | 'total'
   * @returns {Promise<void>}
   */
  static abrir({ professionalId, professionalNome, barbershopId, periodo }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'bfm-overlay';

      const periodLabel = BarberFinanceModal.#periodoLabel(periodo);
      const inicial     = BarberFinanceModal.#inicial(professionalNome);

      overlay.innerHTML = `
        <div class="bfm-card" role="dialog" aria-modal="true" aria-label="Extrato de ${BarberFinanceModal.#escapar(professionalNome)}">
          <div class="bfm-header">
            <div class="bfm-header-info">
              <div class="bfm-avatar" aria-hidden="true">${inicial}</div>
              <div>
                <p class="bfm-nome">${BarberFinanceModal.#escapar(professionalNome)}</p>
                <p class="bfm-periodo-label">${periodLabel}</p>
              </div>
            </div>
            <button class="bfm-fechar" aria-label="Fechar">✕</button>
          </div>
          <div class="bfm-total-wrap">
            <p class="bfm-total-label">Total do período</p>
            <p class="bfm-total-valor bfm-skeleton-line" id="bfm-total-val">—</p>
          </div>
          <div class="bfm-lista-wrap">
            <ul class="bfm-lista" id="bfm-lista" aria-label="Transações">
              ${BarberFinanceModal.#skeletonLinhas(5)}
            </ul>
          </div>
        </div>`;

      const fechar = () => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.add('bfm-overlay--saindo');
        setTimeout(() => { overlay.remove(); resolve(); }, 230);
      };

      const onKey = e => { if (e.key === 'Escape') fechar(); };
      document.addEventListener('keydown', onKey);
      overlay.querySelector('.bfm-fechar').addEventListener('click', fechar);
      overlay.addEventListener('click', e => { if (e.target === overlay) fechar(); });

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('bfm-overlay--visivel'));

      // Carrega dados assincronamente
      FinanceiroService.getTransacoesBarbeiro(barbershopId, professionalId, periodo)
        .then(transacoes => BarberFinanceModal.#renderDados(overlay, transacoes))
        .catch(err => {
          LoggerService.warn('[BarberFinanceModal] erro ao carregar:', err?.message);
          BarberFinanceModal.#renderErro(overlay);
        });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — RENDER
  // ═══════════════════════════════════════════════════════════

  static #renderDados(overlay, transacoes) {
    const total = transacoes.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    const totalEl = overlay.querySelector('#bfm-total-val');
    if (totalEl) {
      totalEl.textContent = BarberFinanceModal.#formatarValor(total);
      totalEl.classList.remove('bfm-skeleton-line');
    }

    const listaEl = overlay.querySelector('#bfm-lista');
    if (!listaEl) return;

    if (!transacoes.length) {
      listaEl.innerHTML = '<li class="bfm-item bfm-item--vazio">Nenhum corte neste período.</li>';
      return;
    }

    listaEl.innerHTML = transacoes.map(t => {
      const data    = BarberFinanceModal.#formatarData(t.paid_at);
      const cliente = t.client?.full_name ? BarberFinanceModal.#escapar(t.client.full_name) : 'Walk-in';
      const metodo  = BarberFinanceModal.#METODO_LABEL[t.payment_method] ?? '—';
      const classe  = BarberFinanceModal.#METODO_CLASSE[t.payment_method] ?? 'outro';
      const valor   = BarberFinanceModal.#formatarValor(t.amount);

      return `
        <li class="bfm-item">
          <div class="bfm-item-info">
            <span class="bfm-item-cliente">${cliente}</span>
            <span class="bfm-item-data">${data}</span>
          </div>
          <div class="bfm-item-valores">
            <span class="bfm-item-metodo bfm-metodo--${classe}">${metodo}</span>
            <span class="bfm-item-valor">${valor}</span>
          </div>
        </li>`;
    }).join('');
  }

  static #renderErro(overlay) {
    const listaEl = overlay.querySelector('#bfm-lista');
    if (listaEl) listaEl.innerHTML = '<li class="bfm-item bfm-item--vazio">Erro ao carregar dados.</li>';
    const totalEl = overlay.querySelector('#bfm-total-val');
    if (totalEl) { totalEl.textContent = '—'; totalEl.classList.remove('bfm-skeleton-line'); }
  }

  static #skeletonLinhas(n) {
    return Array.from({ length: n }, () =>
      '<li class="bfm-item bfm-item--skel" aria-hidden="true"><div class="bfm-skel-line"></div><div class="bfm-skel-val"></div></li>',
    ).join('');
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — UTILITÁRIOS
  // ═══════════════════════════════════════════════════════════

  static #formatarValor(v) {
    return `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;
  }

  static #formatarData(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  static #periodoLabel(p) {
    const map = { hoje: 'Hoje', semana: 'Esta semana', mes: 'Este mês', total: 'Todos os períodos' };
    return map[p] ?? p;
  }

  static #inicial(nome) {
    return String(nome ?? '?').trim().charAt(0).toUpperCase() || '?';
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
