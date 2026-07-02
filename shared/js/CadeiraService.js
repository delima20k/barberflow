'use strict';

// =============================================================
// CadeiraService.js — Lógica de negócio das cadeiras da fila.
//
// Responsabilidade ÚNICA: gerenciar o ciclo de vida de um cliente
// nas cadeiras (sentar → atender → finalizar) e notificar a fila.
//
// Dependências: ApiService.js, UserRepository.js, QueueRepository.js,
//               InputValidator.js, LoggerService.js
//
// NOTA DE CAMADA: esta classe é application — não toca DOM.
// Quem chama (interfaces) é responsável por re-renders/eventos.
// =============================================================

class CadeiraService {

  // ═══════════════════════════════════════════════════════════
  // LEITURA
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna clientes distintos que já foram atendidos nessa barbearia.
   * Fonte: queue_entries com status='done'.
   * @param {string} barbershopId
   * @returns {Promise<{id:string, full_name:string, avatar_path:string|null}[]>}
   */
  static async getClientesConhecidos(barbershopId) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[CadeiraService] barbershopId: ${r.msg}`);

    const { data, error } = await ApiService.from('queue_entries')
      .select('client_id')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'done')
      .order('done_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Deduplica por id de cliente mantendo a ordem dos atendimentos mais recentes.
    const vistos = new Set();
    const ids = [];
    for (const entry of (data ?? [])) {
      const id = entry.client_id;
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      ids.push(id);
    }

    if (ids.length === 0) return [];

    const { data: perfis, error: perfisError } = await ApiService.from('profiles_public')
      .select('id, full_name, avatar_path')
      .in('id', ids);
    if (perfisError) throw perfisError;

    const porId = new Map((perfis ?? []).map(p => [p.id, p]));
    const lista = [];
    for (const id of ids) {
      const c = porId.get(id);
      if (!c) continue;
      lista.push({ id: c.id, full_name: c.full_name ?? 'Cliente', avatar_path: c.avatar_path ?? null });
    }
    return lista;
  }

  /**
   * Retorna as entradas ativas (waiting + in_service) de uma barbearia.
   * @param {string} barbershopId
   * @returns {Promise<object[]>}
   */
  static async getFilaAtiva(barbershopId) {
    return QueueRepository.getByBarbershop(barbershopId);
  }

  /**
   * Retorna perfis de usuários que favoritaram a barbearia OU o barbeiro.
   * Delega a FavoritosClientesService — fonte única da regra de favoritos.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<{id:string, full_name:string, email:string|null, avatar_path:string|null, updated_at:string|null}[]>}
   */
  static async getClientesFavoritos(barbershopId, professionalId) {
    return FavoritosClientesService.listarPorBarbeiro(barbershopId, professionalId);
  }

  // ═══════════════════════════════════════════════════════════
  // ESCRITA
  // ═══════════════════════════════════════════════════════════

  /**
   * Senta um cliente em uma cadeira (produção ou espera).
   * - 'producao': cria entrada com status='in_service', served_at=now
   * - 'fila':     cria entrada com status='waiting', position=próximo disponível
   *
   * @param {object} opts
   * @param {string}        opts.barbershopId
   * @param {string}        opts.professionalId  UUID do barbeiro responsável
   * @param {string|null}   opts.clientId        UUID do cliente cadastrado; null para walk-in
   * @param {string}        [opts.guestName]     Nome avulso (obrigatório quando clientId=null)
   * @param {string[]}      opts.serviceIds      IDs dos serviços escolhidos
   * @param {'producao'|'fila'} opts.tipo
   * @param {boolean}      [opts.notificarCliente=true] envia push ao cliente ao mover para in_service
   * @param {boolean}      [opts.confirmarPresenca=false] marca presença quando o profissional coloca em produção
   * @returns {Promise<object>}  entrada criada
   */
  static async sentar({
    barbershopId,
    professionalId,
    clientId,
    guestName,
    serviceIds,
    tipo,
    notificarCliente = true,
    confirmarPresenca = false,
  }) {
    const rShop  = InputValidator.uuid(barbershopId);
    const rProf  = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[CadeiraService] professionalId: ${rProf.msg}`);

    // clientId pode ser null para clientes walk-in (sem cadastro)
    if (clientId !== null && clientId !== undefined) {
      const rCli = InputValidator.uuid(clientId);
      if (!rCli.ok) throw new TypeError(`[CadeiraService] clientId: ${rCli.msg}`);
    } else if (!guestName?.trim()) {
      throw new Error('[CadeiraService] clientId ou guestName é obrigatório.');
    }

    if (!['producao', 'fila'].includes(tipo)) throw new Error(`[CadeiraService] tipo inválido: ${tipo}`);

    // Guard: verifica se a barbearia está aberta antes de inserir
    const { data: shopStatus } = await ApiService.from('barbershops')
      .select('is_open, close_reason, name')
      .eq('id', barbershopId)
      .maybeSingle();

    if (shopStatus && shopStatus.is_open === false) {
      const nome  = shopStatus.name ?? 'A barbearia';
      const razao = (shopStatus.close_reason ?? '').toLowerCase().trim();
      let msg = `${nome} está fechada no momento.`;
      if (razao === 'almoco') msg = `${nome} está em pausa para almoço.`;
      if (razao === 'janta')  msg = `${nome} está em pausa para janta.`;
      throw Object.assign(new Error(msg), { status: 403 });
    }

    // Calcula próxima posição e verifica se produção está vazia (tipo='fila')
    let position      = 0;
    let producaoVazia = false;
    if (tipo === 'fila') {
      const filaAtual = await CadeiraService.getFilaAtiva(barbershopId);
      const waiting   = filaAtual.filter(e => e.status === 'waiting');
      position        = waiting.length > 0
        ? Math.max(...waiting.map(e => e.position ?? 0)) + 1
        : 1;
      producaoVazia   = !filaAtual.some(
        e => e.status === 'in_service' && e.professional?.id === professionalId,
      );
    }

    const payload = {
      barbershop_id:   barbershopId,
      professional_id: professionalId,
    };
    if (clientId)         payload.client_id  = clientId;
    if (guestName?.trim()) payload.guest_name = guestName.trim();
    if (tipo === 'fila') {
      payload.position = position;
    }

    // Insere via QueueRepository (valida e insere)
    const entrada = await QueueRepository.entrar(payload);

    // Produção direta → in_service imediatamente
    if (tipo === 'producao') {
      await QueueRepository.updateStatus(
        entrada.id,
        'in_service',
        confirmarPresenca ? { clientConfirmed: 'yes' } : undefined,
      );
      if (notificarCliente) {
        CadeiraService.#notificarClienteInService(clientId, barbershopId, entrada.id);
      }
    }

    // Fila de espera com produção vazia → auto-avança para in_service
    if (tipo === 'fila' && producaoVazia) {
      await QueueRepository.updateStatus(
        entrada.id,
        'in_service',
        confirmarPresenca ? { clientConfirmed: 'yes' } : undefined,
      );
      if (notificarCliente) {
        CadeiraService.#notificarClienteInService(clientId, barbershopId, entrada.id);
      }
    }

    // Salva serviços escolhidos (tabela queue_entry_services, se existir)
    if (serviceIds?.length) {
      await CadeiraService.#salvarServicos(entrada.id, barbershopId, serviceIds);
    }

    return entrada;
  }

  /**
   * Finaliza o atendimento de uma entrada.
   * Marca como 'done', auto-avança o próximo waiting do mesmo barbeiro
   * para 'in_service' e retorna seus dados.
   * As notificações são enviadas pelo trigger `trg_notify_queue_on_done` no banco.
   *
   * @param {string}      entradaId
   * @param {string}      barbershopId
   * @param {string|null} [professionalId]  filtra fila pelo barbeiro; null = primeiro geral
   * @returns {Promise<{proximoClienteId:string|null, proximoNome:string|null}>}
   */
  static async finalizar(entradaId, barbershopId, professionalId = null) {
    const rId   = InputValidator.uuid(entradaId);
    const rShop = InputValidator.uuid(barbershopId);
    if (!rId.ok)   throw new TypeError(`[CadeiraService] entradaId: ${rId.msg}`);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);

    await QueueRepository.updateStatus(entradaId, 'done');

    const filaAtiva = await CadeiraService.getFilaAtiva(barbershopId);
    const filtrada  = professionalId
      ? filaAtiva.filter(e => e.professional?.id === professionalId)
      : filaAtiva;
    const proximo   = CadeiraService.#proximoNaFila(filtrada);

    // Auto-avança o próximo da fila de espera para produção
    if (proximo) {
      await QueueRepository.updateStatus(proximo.id, 'in_service');
      CadeiraService.#notificarClienteInService(
        proximo.client?.id ?? null,
        barbershopId,
        proximo.id,
      );
    }

    return {
      proximoClienteId: proximo?.client?.id       ?? null,
      proximoNome:      proximo?.client?.full_name ?? null,
    };
  }

  /**
   * Libera a cadeira sem contar como corte realizado.
   * Usado quando o profissional colocou o cliente em producao por engano.
   *
   * @param {string}      entradaId
   * @param {string}      barbershopId
   * @param {string|null} [professionalId]  filtra fila pelo barbeiro
   * @returns {Promise<{proximoClienteId:string|null, proximoNome:string|null}>}
   */
  static async liberarSemCorte(entradaId, barbershopId, professionalId = null) {
    const rId   = InputValidator.uuid(entradaId);
    const rShop = InputValidator.uuid(barbershopId);
    if (!rId.ok)   throw new TypeError(`[CadeiraService] entradaId: ${rId.msg}`);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);

    await QueueRepository.updateStatus(entradaId, 'cancelled');

    const filaAtiva = await CadeiraService.getFilaAtiva(barbershopId);
    const filtrada  = professionalId
      ? filaAtiva.filter(e => e.professional?.id === professionalId)
      : filaAtiva;
    const proximo   = CadeiraService.#proximoNaFila(filtrada);

    if (proximo) {
      await QueueRepository.updateStatus(proximo.id, 'in_service');
      CadeiraService.#notificarClienteInService(
        proximo.client?.id ?? null,
        barbershopId,
        proximo.id,
      );
    }

    return {
      proximoClienteId: proximo?.client?.id       ?? null,
      proximoNome:      proximo?.client?.full_name ?? null,
    };
  }

  /**
   * Sincroniza a fila ao carregar a página (ou após re-render):
   * para cada profissional com produção vazia mas entradas `waiting`,
   * promove automaticamente a de menor position para `in_service`.
   *
   * Garante que a UI nunca mostre a cadeira de produção vazia
   * enquanto há clientes na fila de espera.
   *
   * @param {string} barbershopId
   * @returns {Promise<object[]>}  fila atualizada (com promoções já aplicadas)
   */
  static async sincronizarFilas(barbershopId) {
    const r = InputValidator.uuid(barbershopId);
    if (!r.ok) throw new TypeError(`[CadeiraService] barbershopId: ${r.msg}`);

    const filaAtiva = await CadeiraService.getFilaAtiva(barbershopId);

    // Agrupa entradas por profissional
    const grupos = new Map(); // profKey → { temInService: bool, waiting: [] }
    for (const e of filaAtiva) {
      const key = e.professional?.id ?? '__sem_prof__';
      if (!grupos.has(key)) grupos.set(key, { temInService: false, waiting: [] });
      const g = grupos.get(key);
      if (e.status === 'in_service') g.temInService = true;
      else if (e.status === 'waiting') g.waiting.push(e);
    }

    // Para cada grupo sem in_service: promove o primeiro waiting
    let houveMudanca = false;
    for (const g of grupos.values()) {
      if (g.temInService || g.waiting.length === 0) continue;
      const proximo = g.waiting.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
      await QueueRepository.updateStatus(proximo.id, 'in_service');
      houveMudanca = true;
    }

    // Rebusca somente se houve promoção, para retornar estado correto
    return houveMudanca ? CadeiraService.getFilaAtiva(barbershopId) : filaAtiva;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna a primeira entrada com status='waiting' ordenada por position.
   * @param {object[]} fila
   * @returns {object|null}
   */
  static #proximoNaFila(fila) {
    const waiting = fila
      .filter(e => e.status === 'waiting')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return waiting[0] ?? null;
  }

  static async #notificarProximo(entrada, _barbershopId) {
    // Notificação gerenciada pelo trigger trg_notify_queue_on_done no banco.
    // O trigger insere em public.notifications para TODOS os clientes em espera
    // usando SECURITY DEFINER — sem necessidade de INSERT aqui.
    LoggerService.info('[CadeiraService] Finalização registrada — trigger DB notifica a fila.');
  }

  /**
   * Envia Web Push para o cliente que foi movido para in_service.
   * Best-effort: nunca bloqueia o fluxo principal — erros são silenciados.
   * Apenas clientes cadastrados recebem push (walk-in = clientId null).
   *
   * Chama a Edge Function send-push autenticada com o JWT do barbeiro.
   * @param {string|null} clientId
   * @param {string}      barbershopId
   * @param {string}      entradaId
   */
  static #notificarClienteInService(clientId, barbershopId, entradaId) {
    if (!clientId) return; // walk-in sem conta — sem push

    // Fire-and-forget: não bloqueia o fluxo do barbeiro
    ;(async () => {
      try {
        const session = await SupabaseService.getSession();
        const token   = session?.access_token;
        if (!token) return;

        await fetch(
          'https://jfvjisqnzapxxagkbxcu.supabase.co/functions/v1/send-push',
          {
            method:  'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ clientId, barbershopId, entradaId, appId: 'cliente' }),
          },
        );
      } catch { /* push é best-effort — silencioso */ }
    })();
  }

  /**
   * Salva os serviços escolhidos para a entrada na fila.
   * Silencioso: se a tabela não existir (404), ignora.
   * @param {string}   entradaId
   * @param {string}   barbershopId
   * @param {string[]} serviceIds
   */
  static async #salvarServicos(entradaId, barbershopId, serviceIds) {
    try {
      const rows = serviceIds.map(sid => ({
        queue_entry_id: entradaId,
        barbershop_id:  barbershopId,
        service_id:     sid,
      }));
      await ApiService.from('queue_entry_services').insert(rows);
    } catch (err) {
      LoggerService.warn('[CadeiraService] #salvarServicos ignorado:', err?.message);
    }
  }

}
