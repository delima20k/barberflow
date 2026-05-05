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
      .select('client:profiles!client_id(id, full_name, avatar_path)')
      .eq('barbershop_id', barbershopId)
      .eq('status', 'done')
      .order('done_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Deduplica por id de cliente
    const vistos = new Set();
    const lista  = [];
    for (const entry of (data ?? [])) {
      const c = entry.client;
      if (!c?.id || vistos.has(c.id)) continue;
      vistos.add(c.id);
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
   * Delega ao Supabase via UserRepository — sem backend intermediário.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<{id:string, full_name:string, email:string|null, avatar_path:string|null, updated_at:string|null}[]>}
   */
  static async getClientesFavoritos(barbershopId, professionalId) {
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[CadeiraService] professionalId: ${rProf.msg}`);

    const { data, error } = await UserRepository.getFavoritosModal(
      barbershopId,
      professionalId,
    );
    if (error) throw error;
    return (data ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
      email:       p.email       ?? null,
      avatar_path: p.avatar_path ?? null,
      updated_at:  p.updated_at  ?? null,
    }));
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
   * @returns {Promise<object>}  entrada criada
   */
  static async sentar({ barbershopId, professionalId, clientId, guestName, serviceIds, tipo }) {
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

    // Calcula próxima posição livre para as cadeiras de espera
    let position = 0;
    if (tipo === 'fila') {
      const filaAtual = await CadeiraService.getFilaAtiva(barbershopId);
      const waiting   = filaAtual.filter(e => e.status === 'waiting');
      position        = waiting.length > 0
        ? Math.max(...waiting.map(e => e.position ?? 0)) + 1
        : 1;
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

    // Se for produção, muda para in_service imediatamente
    if (tipo === 'producao') {
      await QueueRepository.updateStatus(entrada.id, 'in_service');
    }

    // Salva serviços escolhidos (tabela queue_entry_services, se existir)
    if (serviceIds?.length) {
      await CadeiraService.#salvarServicos(entrada.id, barbershopId, serviceIds);
    }

    return entrada;
  }

  /**
   * Finaliza o atendimento de uma entrada.
   * Marca como 'done' e retorna o próximo cliente na fila.
   * As notificações são enviadas pelo trigger `trg_notify_queue_on_done` no banco.
   *
   * @param {string} entradaId
   * @param {string} barbershopId
   * @returns {Promise<{proximoClienteId:string|null, proximoNome:string|null}>}
   */
  static async finalizar(entradaId, barbershopId) {
    const rId   = InputValidator.uuid(entradaId);
    const rShop = InputValidator.uuid(barbershopId);
    if (!rId.ok)   throw new TypeError(`[CadeiraService] entradaId: ${rId.msg}`);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);

    await QueueRepository.updateStatus(entradaId, 'done');

    const filaAtiva = await CadeiraService.getFilaAtiva(barbershopId);
    const proximo   = CadeiraService.#proximoNaFila(filaAtiva);

    return {
      proximoClienteId: proximo?.client?.id       ?? null,
      proximoNome:      proximo?.client?.full_name ?? null,
    };
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

  /**
   * Insere uma row na tabela notifications para o próximo cliente da fila.
   * O NotificationService no app cliente ouve essa tabela via Realtime.
   * @param {object} entrada  queue_entry com embed client
   * @param {string} barbershopId
   */
  static async #notificarProximo(entrada, _barbershopId) {
    // Notificação gerenciada pelo trigger trg_notify_queue_on_done no banco.
    // O trigger insere em public.notifications para TODOS os clientes em espera
    // usando SECURITY DEFINER — sem necessidade de INSERT aqui.
    LoggerService.info('[CadeiraService] Finalização registrada — trigger DB notifica a fila.');
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
