'use strict';

// =============================================================
// CadeiraService.js — Lógica de negócio das cadeiras da fila.
//
// Responsabilidade ÚNICA: gerenciar o ciclo de vida de um cliente
// nas cadeiras (sentar → atender → finalizar) e notificar a fila.
//
// Dependências: ApiService.js, QueueRepository.js,
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
   * Fonte: barbershop_interactions (type='favorite') + favorite_professionals.
   * Falhas silenciosas por tabela para manter resiliência.
   * @param {string} barbershopId
   * @param {string} professionalId
   * @returns {Promise<{id:string, full_name:string, avatar_path:string|null, updated_at:string|null}[]>}
   */
  static async getClientesFavoritos(barbershopId, professionalId) {
    const rShop = InputValidator.uuid(barbershopId);
    const rProf = InputValidator.uuid(professionalId);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[CadeiraService] professionalId: ${rProf.msg}`);

    const ids = new Set();

    // Usuários que favoritaram a barbearia
    try {
      const { data } = await ApiService.from('barbershop_interactions')
        .select('user_id')
        .eq('barbershop_id', barbershopId)
        .eq('type', 'favorite');
      (data ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });
    } catch (_) { /* silencioso — tabela pode não ter dados */ }

    // Usuários que favoritaram o barbeiro
    try {
      const { data } = await ApiService.from('favorite_professionals')
        .select('user_id')
        .eq('professional_id', professionalId);
      (data ?? []).forEach(r => { if (r.user_id) ids.add(r.user_id); });
    } catch (_) { /* silencioso — tabela pode não existir */ }

    if (!ids.size) return [];

    const { data, error } = await ApiService.from('profiles')
      .select('id, full_name, avatar_path, updated_at')
      .in('id', [...ids])
      .eq('is_active', true);

    if (error) throw error;
    return (data ?? []).map(p => ({
      id:          p.id,
      full_name:   p.full_name   ?? 'Cliente',
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
   * @param {string}   opts.barbershopId
   * @param {string}   opts.professionalId  UUID do barbeiro responsável
   * @param {string}   opts.clientId
   * @param {string[]} opts.serviceIds      IDs dos serviços escolhidos
   * @param {'producao'|'fila'} opts.tipo
   * @returns {Promise<object>}  entrada criada
   */
  static async sentar({ barbershopId, professionalId, clientId, serviceIds, tipo }) {
    const rShop  = InputValidator.uuid(barbershopId);
    const rProf  = InputValidator.uuid(professionalId);
    const rCli   = InputValidator.uuid(clientId);
    if (!rShop.ok) throw new TypeError(`[CadeiraService] barbershopId: ${rShop.msg}`);
    if (!rProf.ok) throw new TypeError(`[CadeiraService] professionalId: ${rProf.msg}`);
    if (!rCli.ok)  throw new TypeError(`[CadeiraService] clientId: ${rCli.msg}`);
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
      client_id:       clientId,
    };
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
   * Marca como 'done', busca o próximo waiting e notifica via
   * insert na tabela notifications.
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

    // Busca próximo cliente na fila
    const filaAtiva  = await CadeiraService.getFilaAtiva(barbershopId);
    const proximo    = CadeiraService.#proximoNaFila(filaAtiva);

    if (proximo) {
      await CadeiraService.#notificarProximo(proximo, barbershopId);
    }

    return {
      proximoClienteId: proximo?.client?.id   ?? null,
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
  static async #notificarProximo(entrada, barbershopId) {
    const clientId = entrada?.client?.id;
    if (!clientId) return;

    try {
      await ApiService.from('notifications')
        .insert({
          user_id:      clientId,
          barbershop_id: barbershopId,
          tipo:         'fila_avancou',
          titulo:       'É a sua vez!',
          corpo:        'O barbeiro está pronto para te atender. Dirija-se à cadeira.',
          lida:         false,
          created_at:   new Date().toISOString(),
        });
    } catch (err) {
      LoggerService.warn('[CadeiraService] falha ao notificar próximo:', err);
    }
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
