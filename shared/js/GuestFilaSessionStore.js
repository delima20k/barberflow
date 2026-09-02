'use strict';

// =============================================================
// GuestFilaSessionStore.js — Rastreio local de fila para visitante
// sem conta (sem vínculo com login).
//
// Responsabilidade ÚNICA: lembrar, no navegador/aparelho deste
// visitante, qual é a entrada de fila que ele acabou de criar —
// sem depender de conta ou sessão Supabase.
//
// Limitação aceita (decisão de produto): se o visitante limpar o
// cache ou trocar de aparelho, perde essa referência. Não há
// vínculo com conta — é esperado preencher nome/telefone de novo.
//
// CAMADA: infra — único ponto de acesso ao localStorage para esse fim.
// Dependências: nenhuma
// =============================================================

class GuestFilaSessionStore {

  static #PREFIXO = 'bf:fila-convidado:';

  /**
   * Salva a referência da entrada de fila criada por um visitante.
   * @param {string} barbershopId
   * @param {{ entradaId: string, guestName: string, guestPhone?: string|null }} dados
   */
  static salvar(barbershopId, { entradaId, guestName, guestPhone = null }) {
    if (!barbershopId || !entradaId) return;
    try {
      localStorage.setItem(
        GuestFilaSessionStore.#chave(barbershopId),
        JSON.stringify({ entradaId, guestName: guestName ?? null, guestPhone, criadoEm: Date.now() }),
      );
    } catch {
      // localStorage indisponível (modo privado, quota, etc.) — segue sem persistir
    }
  }

  /**
   * @param {string} barbershopId
   * @returns {{ entradaId: string, guestName: string|null, guestPhone: string|null, criadoEm: number }|null}
   */
  static obter(barbershopId) {
    if (!barbershopId) return null;
    try {
      const raw = localStorage.getItem(GuestFilaSessionStore.#chave(barbershopId));
      if (!raw) return null;
      const dados = JSON.parse(raw);
      return dados?.entradaId ? dados : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} barbershopId
   */
  static limpar(barbershopId) {
    if (!barbershopId) return;
    try {
      localStorage.removeItem(GuestFilaSessionStore.#chave(barbershopId));
    } catch {
      // ignora — nada persistido pra limpar mesmo
    }
  }

  /**
   * @param {string} barbershopId
   * @returns {string}
   */
  static #chave(barbershopId) {
    return `${GuestFilaSessionStore.#PREFIXO}${barbershopId}`;
  }
}
