'use strict';

// =============================================================
// BarbeiroEsperaFluxo.js — Fluxo de espera do barbeiro quando
//                          o cliente ainda não está sentado.
//
// Responsabilidade ÚNICA: orquestrar as duas modais de decisão
// do barbeiro após receber 'client_not_seated' e escolher aguardar.
//
// Fluxo:
//   1. Modal "O cliente já está sentado?"
//      - "Sim" → { status: 'aguardando' }  (barbeiro aguarda normal)
//      - "Não" → continua
//   2. Modal "Deseja cancelar o atendimento?"
//      - "Aguardar mais" → { status: 'aguardando' }
//      - "Cancelar" + entradaId válido → CadeiraService.finalizar()
//                                      → { status: 'finalizado', proximoNome }
//      - "Cancelar" + entradaId null   → { status: 'aguardando' } (guard)
//
// Uso (MinhaBarbeariaPage.#onClienteAusente quando acao === null):
//   const res = await BarbeiroEsperaFluxo.iniciar({ clienteNome, entradaId, barbershopId });
//   if (res.status === 'finalizado') { toast + reRender }
//
// Dependências: FluxoDeFila, CadeiraService
// =============================================================

class BarbeiroEsperaFluxo {

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Inicia o fluxo de espera do barbeiro.
   *
   * @param {object}      opts
   * @param {string}      opts.clienteNome   Nome do cliente exibido nas modais
   * @param {string|null} opts.entradaId     UUID da queue_entry (guard: null → sem finalizar)
   * @param {string}      opts.barbershopId  UUID da barbearia
   * @returns {Promise<{ status: 'aguardando'|'finalizado', proximoNome?: string|null }>}
   */
  static async iniciar({ clienteNome, entradaId, barbershopId }) {
    const nome = FluxoDeFila.escapar(clienteNome ?? '');

    // ── Modal 1: "O cliente já está sentado?" ───────────────
    const assento = await FluxoDeFila.abrir({
      id:        'modal-espera-assento',
      icone:     '🪑',
      titulo:    'O cliente já está sentado?',
      corpo:     `<strong>${nome}</strong> já se acomodou na cadeira?`,
      acoes: [
        { label: '✅ Sim, já estou!', valor: 'sim',  variante: 'primario'   },
        { label: '❌ Ainda não',      valor: 'nao',  variante: 'secundario' },
      ],
      fecharBtn: false,
      tocarSom:  false,
    });

    if (assento === 'sim') return { status: 'aguardando' };

    // ── Modal 2: "Deseja cancelar o atendimento?" ───────────
    const decisao = await FluxoDeFila.abrir({
      id:        'modal-cancelar-atendimento',
      icone:     '⚠️',
      titulo:    'Deseja cancelar o atendimento?',
      corpo:     `<strong>${nome}</strong> ainda não está na cadeira. Deseja remover e chamar o próximo?`,
      acoes: [
        { label: '🗑 Sim, cancelar',  valor: 'remover',  variante: 'perigo' },
        { label: '⏳ Aguardar mais',  valor: 'aguardar', variante: 'neutro' },
      ],
      fecharBtn: false,
      tocarSom:  false,
    });

    if (decisao !== 'remover' || !entradaId) return { status: 'aguardando' };

    // ── Finalizar: remove cliente e promove próximo ─────────
    const res        = await CadeiraService.finalizar(entradaId, barbershopId);
    const proximoNome = res?.proximoNome ?? null;
    return { status: 'finalizado', proximoNome };
  }
}
