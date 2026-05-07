'use strict';

// =============================================================
// ClienteAusenteModal.js — Wrapper fino sobre FluxoDeFila.
//
// Responsabilidade ÚNICA: configurar e delegar à FluxoDeFila
// o modal de ação do barbeiro quando cliente não confirmou.
//
// Uso:
//   // Modo padrão — cliente não confirmou após grace:
//   const acao = await ClienteAusenteModal.abrir({ clienteNome });
//   // acao: 'remover' | 'mensagem' | null
//
//   // Modo 1º "Não":
//   const acao = await ClienteAusenteModal.abrir({ clienteNome, modo: 'nao_sentado' });
//   // acao: 'remover' | null
//
// Dependências: FluxoDeFila
// =============================================================

class ClienteAusenteModal {

  /**
   * @param {object}                   opts
   * @param {string}                   opts.clienteNome
   * @param {'ausente'|'nao_sentado'}  [opts.modo='ausente']
   * @returns {Promise<'remover'|'mensagem'|null>}
   */
  static async abrir({ clienteNome, modo = 'ausente' }) {
    const nome         = FluxoDeFila.escapar(clienteNome);
    const ehNaoSentado = modo === 'nao_sentado';

    const config = ehNaoSentado
      ? {
          id:        'modal-ausente-barbeiro',
          icone:     '⏳',
          titulo:    'Cliente ainda não está pronto',
          corpo:     `<strong>${nome}</strong> avisou que ainda não está sentado na cadeira.`,
          acoes: [
            { label: '✅ OK, aguardar',   valor: '_aguardar', variante: 'primario'   },
            { label: '🗑 Chamar próximo', valor: 'remover',   variante: 'secundario' },
          ],
          fecharBtn: false,
          tocarSom:  false, // som via NotificationService ao receber a notificação
        }
      : {
          id:        'modal-ausente-barbeiro',
          icone:     '🔔',
          titulo:    'Cliente ausente',
          corpo:     `<strong>${nome}</strong> não confirmou presença na cadeira.`,
          acoes: [
            { label: '🗑 Remover e chamar próximo', valor: 'remover',  variante: 'perigo' },
            { label: '💬 Enviar mensagem',          valor: 'mensagem', variante: 'neutro' },
          ],
          fecharBtn: true,
          tocarSom:  false,
        };

    const raw = await FluxoDeFila.abrir(config);

    // Mantém contrato legado: 'aguardar' → null (dismiss sem ação)
    if (raw === '_aguardar') return null;
    return raw;
  }
}


