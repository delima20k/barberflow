'use strict';

// =============================================================================
// BarbeiroEsperaFluxo.js — Fluxo persistente de espera do barbeiro.
//
// Responsabilidade ÚNICA: gerenciar o estado de espera ativo enquanto
// o cliente ainda não se sentou na cadeira de produção.
//
// Ciclo de vida:
//   iniciarEspera()  — registra estado, toca som, inicia timer recorrente
//   abrirModalCadeira() — modal "O cliente já chegou?" (manual ou pelo timer)
//   resetarTimer()   — cancela + reinicia o timer (após resposta "aguardar")
//   finalizarEspera() — cancela timer, remove estado, limpa localStorage
//   restaurar()      — reconstrói estado + timers ao recarregar a página
//
// Dependências: FluxoDeFila, QueuePoller, localStorage, document.dispatchEvent
// =============================================================================

class BarbeiroEsperaFluxo {

  // ─── Estado estático (singleton) ───────────────────────────────────────────
  static #ESTADO       = new Map(); // entradaId → { clienteNome, barbershopId }
  static #TIMERS       = new Map(); // entradaId → intervalId
  static #INTERVALO_MS = 5 * 60 * 1000;
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
    BarbeiroEsperaFluxo.#iniciarTimer(entradaId);
  }

  /**
   * Abre a modal de decisão manualmente (também usada pelo timer).
   * null de FluxoDeFila (overlay duplicado removido) → trata como 'aguardar'.
   *
   * @param {object} opts
   * @param {string} opts.clienteNome
   * @param {string} opts.entradaId
   * @param {string} opts.barbershopId
   * @returns {Promise<'chegou'|'remover'|'aguardar'>}
   */
  static async abrirModalCadeira({ clienteNome, entradaId, barbershopId }) {
    const nome = FluxoDeFila.escapar(clienteNome ?? '');

    // Modal 1: barbeiro confirma se cliente já está na cadeira
    const raw1 = await FluxoDeFila.abrir({
      id:        BarbeiroEsperaFluxo.#MODAL_ID,
      icone:     '🪑',
      titulo:    `${nome} está na cadeira?`,
      corpo:     `<strong>${nome}</strong> avisou que está a caminho. Já chegou e está pronto para cortar o cabelo?`,
      acoes: [
        { label: 'Sim', valor: 'sim', variante: 'primario' },
        { label: 'Não', valor: 'nao', variante: 'neutro'   },
      ],
      fecharBtn: false,
      tocarSom:  false,
    });

    // Sim → confirmar chegada
    if (raw1 === 'sim') {
      BarbeiroEsperaFluxo.#despacharResolvida(entradaId, 'chegou', barbershopId);
      return 'chegou';
    }

    // null (overlay fechado por acidente) → aguardar por segurança
    if (raw1 !== 'nao') return 'aguardar';

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
   * Encerra a espera: cancela timer, remove estado, atualiza localStorage.
   * @param {string} entradaId
   */
  static finalizarEspera(entradaId) {
    BarbeiroEsperaFluxo.#cancelarTimer(entradaId);
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
   * Cancela o timer atual e inicia um novo, sem duplicar.
   * Seguro chamar se entradaId não existe (no-op).
   * @param {string} entradaId
   */
  static resetarTimer(entradaId) {
    if (!BarbeiroEsperaFluxo.#ESTADO.has(entradaId)) return;
    BarbeiroEsperaFluxo.#cancelarTimer(entradaId);
    BarbeiroEsperaFluxo.#iniciarTimer(entradaId);
  }

  /**
   * Repopula estado + timers a partir do localStorage (chamado em #carregar).
   * Não toca som (recarga silenciosa).
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
      BarbeiroEsperaFluxo.#iniciarTimer(entradaId);
    }
  }

  // ─── Privado ───────────────────────────────────────────────────────────────

  static #iniciarTimer(entradaId) {
    BarbeiroEsperaFluxo.#cancelarTimer(entradaId);
    if (!BarbeiroEsperaFluxo.#ESTADO.has(entradaId)) return;

    const id = setInterval(async () => {
      const dados = BarbeiroEsperaFluxo.#ESTADO.get(entradaId);
      if (!dados) { BarbeiroEsperaFluxo.#cancelarTimer(entradaId); return; }

      BarbeiroEsperaFluxo.#tocarAlerta();
      const acao = await BarbeiroEsperaFluxo.abrirModalCadeira({ ...dados, entradaId });

      if (acao === 'aguardar') {
        BarbeiroEsperaFluxo.resetarTimer(entradaId);
      } else {
        BarbeiroEsperaFluxo.finalizarEspera(entradaId);
      }
    }, BarbeiroEsperaFluxo.#INTERVALO_MS);

    BarbeiroEsperaFluxo.#TIMERS.set(entradaId, id);
  }

  static #cancelarTimer(entradaId) {
    const id = BarbeiroEsperaFluxo.#TIMERS.get(entradaId);
    if (id !== undefined) {
      clearInterval(id);
      BarbeiroEsperaFluxo.#TIMERS.delete(entradaId);
    }
  }

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
