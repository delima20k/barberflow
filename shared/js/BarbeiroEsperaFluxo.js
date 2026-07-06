'use strict';

// =============================================================================
// BarbeiroEsperaFluxo.js — Fluxo de espera do barbeiro.
//
// Responsabilidade ÚNICA: gerenciar o estado de espera ativo enquanto
// o cliente ainda não se sentou na cadeira de produção.
//
// Notifica 1x ao iniciar a espera (iniciarEspera) — SEM timer recorrente.
// O barbeiro reabre o modal manualmente (clique na cadeira em espera,
// via #onCadeiraClick) quando quiser responder. Isso evita que a mesma
// notificação/modal reapareça sozinha em loop enquanto o cliente aguarda.
//
// Ciclo de vida:
//   iniciarEspera()     — registra estado, toca alerta 1x
//   abrirModalCadeira() — modal "O cliente já chegou?" (sempre manual)
//   finalizarEspera()   — remove estado, limpa localStorage
//   restaurar()         — reconstrói estado ao recarregar a página
//
// Dependências: FluxoDeFila, QueuePoller, localStorage, document.dispatchEvent
// =============================================================================

class BarbeiroEsperaFluxo {

  // ─── Estado estático (singleton) ───────────────────────────────────────────
  static #ESTADO       = new Map(); // entradaId → { clienteNome, barbershopId }
  static #LS_KEY       = 'bf_espera_barbeiro';
  static #MODAL_ID     = 'modal-espera-cadeira';

  // ─── Público ───────────────────────────────────────────────────────────────

  /**
   * Inicia o ciclo de espera para uma entrada de fila.
   * Guard: ignora chamada se entradaId já estiver em espera.
   *
   * @param {object} opts
   * @param {string} opts.clienteNome
   * @param {string} opts.entradaId
   * @param {string} opts.barbershopId
   */
  static iniciarEspera({ clienteNome, entradaId, barbershopId }) {
    if (BarbeiroEsperaFluxo.#ESTADO.has(entradaId)) return;
    BarbeiroEsperaFluxo.#ESTADO.set(entradaId, { clienteNome, barbershopId });
    BarbeiroEsperaFluxo.#tocarAlerta();
    BarbeiroEsperaFluxo.#persistir();
  }

  /**
   * Abre a modal de decisão (sempre manual, disparada pelo barbeiro).
   * null de FluxoDeFila (overlay duplicado removido) → trata como 'aguardar'.
   *
   * @param {object} opts
   * @param {string} opts.clienteNome
   * @param {string} opts.entradaId
   * @param {string} opts.barbershopId
   * @returns {Promise<'chegou'|'remover'|'aguardar'>}
   */
  static async abrirModalCadeira({
    clienteNome,
    entradaId,
    barbershopId,
    statusLabel = null,
    cadeira = null,
    dinamico = false,
    acaoConfirmar = 'chegou',
  }) {
    const nome       = FluxoDeFila.escapar(clienteNome ?? '');
    const statusTxt  = statusLabel ? FluxoDeFila.escapar(statusLabel) : null;
    const cadeiraTxt = cadeira ? FluxoDeFila.escapar(cadeira) : null;
    const corpoPush  = [
      `<strong>${nome}</strong> ${statusTxt ? statusTxt.toLowerCase() : 'avisou que esta a caminho'}.`,
      cadeiraTxt ? `Cadeira: <strong>${cadeiraTxt}</strong>.` : '',
      'Confirme como deseja seguir.',
    ].filter(Boolean).join('<br>');

    // Modal 1: barbeiro confirma se cliente já está na cadeira
    const raw1 = await FluxoDeFila.abrir({
      id:        BarbeiroEsperaFluxo.#MODAL_ID,
      icone:     '🪑',
      titulo:    dinamico ? (statusTxt ?? `${nome} esta a caminho`) : `${nome} está na cadeira?`,
      corpo:     dinamico ? corpoPush : `<strong>${nome}</strong> avisou que está a caminho. Já chegou e está pronto para cortar o cabelo?`,
      acoes: dinamico
        ? [
            { label: 'Confirmar recebimento', valor: 'sim', variante: 'primario' },
            { label: 'Chamar cliente',        valor: 'nao', variante: 'perigo'   },
          ]
        : [
            { label: 'Sim', valor: 'sim', variante: 'primario' },
            { label: 'Não', valor: 'nao', variante: 'neutro'   },
          ],
      fecharBtn: false,
      tocarSom:  false,
    });

    // Sim → confirmar chegada
    if (raw1 === 'sim') {
      if (acaoConfirmar === 'aguardar') return 'aguardar';
      BarbeiroEsperaFluxo.#despacharResolvida(entradaId, 'chegou', barbershopId);
      return 'chegou';
    }

    // null (overlay fechado por acidente) → aguardar por segurança
    if (raw1 !== 'nao') return 'aguardar';

    if (dinamico) {
      BarbeiroEsperaFluxo.#despacharResolvida(entradaId, 'remover', barbershopId);
      return 'remover';
    }

    // Não → Modal 2: esperar mais ou cancelar
    const raw2 = await FluxoDeFila.abrir({
      id:        BarbeiroEsperaFluxo.#MODAL_ID + '-opcao',
      icone:     '⏳',
      titulo:    'O que deseja fazer?',
      corpo:     `Deseja esperar mais ou cancelar o atendimento de <strong>${nome}</strong>?`,
      acoes: [
        { label: 'Esperar mais',         valor: 'esperar',  variante: 'primario' },
        { label: 'Cancelar atendimento', valor: 'cancelar', variante: 'perigo'   },
      ],
      fecharBtn: false,
      tocarSom:  false,
    });

    // cancelar (ou null no segundo modal) → remover
    if (raw2 === 'cancelar' || raw2 === null) {
      BarbeiroEsperaFluxo.#despacharResolvida(entradaId, 'remover', barbershopId);
      return 'remover';
    }

    // 'esperar' → aguardar
    return 'aguardar';
  }

  /**
   * Encerra a espera: remove estado, atualiza localStorage.
   * @param {string} entradaId
   */
  static finalizarEspera(entradaId) {
    BarbeiroEsperaFluxo.#ESTADO.delete(entradaId);
    BarbeiroEsperaFluxo.#limparPersistencia(entradaId);
  }

  /**
   * @param {string} entradaId
   * @returns {boolean}
   */
  static estaAguardando(entradaId) {
    return BarbeiroEsperaFluxo.#ESTADO.has(entradaId);
  }

  /**
   * @param {string} entradaId
   * @returns {{ clienteNome: string, barbershopId: string }|null}
   */
  static dadosEspera(entradaId) {
    return BarbeiroEsperaFluxo.#ESTADO.get(entradaId) ?? null;
  }

  /**
   * @deprecated Preservado só para não quebrar call-sites existentes
   * (#fluxoEspera em MinhaBarbeariaRuntimeController). Antes reiniciava o
   * timer recorrente de 5 min; hoje é no-op — não há mais timer recorrente,
   * o barbeiro reabre o modal manualmente quando quiser responder.
   * @param {string} entradaId
   */
  static resetarTimer(entradaId) {
    void entradaId; // no-op intencional
  }

  /**
   * Repopula estado a partir do localStorage (chamado em #carregar).
   * Não toca som (recarga silenciosa) e não agenda nenhum timer.
   */
  static restaurar() {
    let dados;
    try {
      const raw = localStorage.getItem(BarbeiroEsperaFluxo.#LS_KEY);
      dados = raw ? JSON.parse(raw) : {};
    } catch (_) {
      dados = {};
    }

    for (const [entradaId, info] of Object.entries(dados)) {
      if (BarbeiroEsperaFluxo.#ESTADO.has(entradaId)) continue;
      BarbeiroEsperaFluxo.#ESTADO.set(entradaId, {
        clienteNome:  info.clienteNome  ?? '',
        barbershopId: info.barbershopId ?? '',
      });
    }
  }

  // ─── Privado ───────────────────────────────────────────────────────────────

  static #tocarAlerta() {
    if (typeof QueuePoller !== 'undefined') QueuePoller.tocarSom();
  }

  static #persistir() {
    try {
      localStorage.setItem(
        BarbeiroEsperaFluxo.#LS_KEY,
        JSON.stringify(Object.fromEntries(BarbeiroEsperaFluxo.#ESTADO)),
      );
    } catch (_) { /* localStorage indisponível (ex: modo privado restrito) */ }
  }

  static #limparPersistencia(entradaId) {
    try {
      const raw   = localStorage.getItem(BarbeiroEsperaFluxo.#LS_KEY);
      const atual = raw ? JSON.parse(raw) : {};
      delete atual[entradaId];
      localStorage.setItem(BarbeiroEsperaFluxo.#LS_KEY, JSON.stringify(atual));
    } catch (_) { /* ignora */ }
  }

  static #despacharResolvida(entradaId, acao, barbershopId) {
    document.dispatchEvent(
      new CustomEvent('barberflow:espera-resolvida', {
        detail: { acao, entradaId, barbershopId },
      }),
    );
  }
}
