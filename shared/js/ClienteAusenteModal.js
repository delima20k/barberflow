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
//   // Com logo da barbearia (ícone duplo app + barbearia):
//   const acao = await ClienteAusenteModal.abrir({ clienteNome, modo, logoBarbearia: url });
//
// Dependências: FluxoDeFila
// =============================================================

class ClienteAusenteModal {

  static #APP_LOGO = '/shared/img/Logo01.png';

  /**
   * @param {object}                   opts
   * @param {string}                   opts.clienteNome
   * @param {'ausente'|'nao_sentado'}  [opts.modo='ausente']
   * @param {string|null}              [opts.logoBarbearia=null]
   * @returns {Promise<'remover'|'mensagem'|null>}
   */
  static async abrir({ clienteNome, modo = 'ausente', logoBarbearia = null }) {
    const nome         = FluxoDeFila.escapar(clienteNome);
    const ehNaoSentado = modo === 'nao_sentado';
    const iconesDuplos = { app: ClienteAusenteModal.#APP_LOGO, barbearia: logoBarbearia ?? null };

    const config = ehNaoSentado
      ? {
          id:           'modal-ausente-barbeiro',
          iconesDuplos,
          titulo:       'Cliente a caminho',
          corpo:        `<strong>${nome}</strong> avisou que ainda está a caminho.`,
          acoes: [
            { label: 'OK, aguardar',    valor: '_aguardar', variante: 'primario'   },
            { label: 'Chamar próximo', valor: 'remover',   variante: 'secundario' },
          ],
          fecharBtn: false,
          tocarSom:  false,
        }
      : {
          id:           'modal-ausente-barbeiro',
          iconesDuplos,
          titulo:       'Cliente ausente',
          corpo:        `<strong>${nome}</strong> não confirmou presença na cadeira.`,
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



