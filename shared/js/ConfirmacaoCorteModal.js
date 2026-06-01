'use strict';

// =============================================================
// ConfirmacaoCorteModal.js — Wrapper fino sobre FluxoDeFila.
//
// Responsabilidade ÚNICA: configurar e delegar à FluxoDeFila
// o modal de confirmação de presença do cliente na cadeira.
//
// Uso:
//   const resp = await ConfirmacaoCorteModal.abrir({ clienteNome, shopLogoUrl });
//   // resp: 'sim' | 'nao'
//
// Dependências: FluxoDeFila
// =============================================================

class ConfirmacaoCorteModal {

  /**
   * Exibe o modal de confirmação de presença.
   * @param {object}      opts
   * @param {string}      opts.clienteNome  nome do cliente a ser confirmado
   * @param {string|null} [opts.shopLogoUrl] URL pública do logo da barbearia
   * @returns {Promise<'sim'|'nao'>}
   */
  static abrir({ clienteNome, shopLogoUrl = null }) {
    const nome = FluxoDeFila.escapar(clienteNome);
    return FluxoDeFila.abrir({
      id:          'modal-cadeira-cliente',
      icone:       shopLogoUrl ?? '💈',
      iconeImagem: !!shopLogoUrl,
      titulo:      'É a sua vez!',
      corpo:       `${nome}, você já está na cadeira, pronto para o corte!`,
      acoes: [
        { label: '✅ Sim, estou!', valor: 'sim', variante: 'primario'   },
        { label: '❌ Não ainda',   valor: 'nao', variante: 'secundario' },
      ],
      fecharBtn: false,
      tocarSom:  false, // som gerenciado pelo CadeiraConfirmacaoService
    });
  }
}
