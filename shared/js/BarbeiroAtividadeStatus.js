'use strict';

class BarbeiroAtividadeStatus {
  static TABELA = 'professional_barbershop_presence';
  static EVENTO_ATUALIZADO = 'barberflow:barbeiro-atividade-atualizada';
  static EVENTO_BROADCAST = 'status';

  #barbershopId;
  #professionalId;
  #nome;
  #toggleEl;
  #textoEl;
  #statusEl;
  #onChange;
  #isAvailable = false;
  #salvando = false;
  #canal = null;
  #toggleHandler = null;

  constructor({ barbershopId, professionalId, nome = 'Barbeiro', toggleEl = null, textoEl = null, statusEl = null, onChange = null } = {}) {
    this.#barbershopId = barbershopId || '';
    this.#professionalId = professionalId || '';
    this.#nome = nome || 'Barbeiro';
    this.#toggleEl = toggleEl;
    this.#textoEl = textoEl;
    this.#statusEl = statusEl;
    this.#onChange = typeof onChange === 'function' ? onChange : null;

    if (this.#toggleEl) {
      this.#toggleHandler = () => { void this.toggle(); };
      this.#toggleEl.addEventListener('click', this.#toggleHandler);
    }
  }

  /**
   * @param {{ carregarStatus?: boolean }} [opts]
   *   carregarStatus=false pula o fetch inicial no BFF e preserva o status já
   *   semeado via atualizarStatus() — usado quando o chamador é a fonte da
   *   verdade (ex.: dono na Minha Barbearia, cujo mapa de presença já foi
   *   carregado com default ATIVO). O Realtime é assinado em ambos os casos.
   */
  async init({ carregarStatus = true } = {}) {
    if (carregarStatus) {
      const status = await BarbeiroAtividadeStatus.buscarStatus(this.#barbershopId, this.#professionalId);
      this.atualizarStatus(status, { emit: false });
    }
    this.#assinarRealtime();
    return this;
  }

  destroy() {
    if (this.#toggleEl && this.#toggleHandler) {
      this.#toggleEl.removeEventListener('click', this.#toggleHandler);
    }
    if (this.#canal && typeof SupabaseService !== 'undefined') {
      SupabaseService.removeChannel(this.#canal);
    }
    this.#toggleHandler = null;
    this.#canal = null;
  }

  get isAvailable() {
    return this.#isAvailable;
  }

  async toggle() {
    if (this.#salvando || !this.#barbershopId) return;
    this.#salvando = true;
    this.#render();
    try {
      const res = await BffApiService.barbearias.atualizarMeuStatusBarbeiro(this.#barbershopId, !this.#isAvailable);
      if (res?.error) throw new Error(res.error);
      const row = res?.data || res?.dados || { is_available: !this.#isAvailable };
      this.atualizarStatus(row);
      // Broadcast imediato: propaga a mudanca a todos os clientes inscritos no canal
      // sem depender de postgres_changes (publicacao do banco / RLS).
      this.#transmitir(row);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[BarbeiroAtividadeStatus] toggle:', err?.message || err);
      }
      if (typeof ToastService !== 'undefined') {
        ToastService.show?.('Nao foi possivel atualizar seu status agora.', 'error');
      }
    } finally {
      this.#salvando = false;
      this.#render();
    }
  }

  atualizarStatus(row = {}, opts = {}) {
    if (row?.professional_id && row.professional_id !== this.#professionalId) return;
    this.#isAvailable = row?.is_available === true;
    this.#render();
    if (opts.emit !== false) this.#emitir(row);
  }

  #assinarRealtime() {
    if (!this.#barbershopId || typeof BarbeiroAtividadeStatus.assinar !== 'function') return;
    this.#canal = BarbeiroAtividadeStatus.assinar(this.#barbershopId, payload => {
      const row = payload?.new || payload?.old || {};
      if (row.professional_id === this.#professionalId) this.atualizarStatus(row);
    });
  }

  /**
   * Transmite a mudanca de status via Supabase Broadcast no canal compartilhado.
   * Funciona instantaneamente entre apps, independente da publicacao do banco/RLS.
   * Best-effort: falha silenciosa se o canal ainda nao estiver conectado.
   */
  #transmitir(row = {}) {
    if (!this.#canal || typeof this.#canal.send !== 'function') return;
    try {
      void this.#canal.send({
        type: 'broadcast',
        event: BarbeiroAtividadeStatus.EVENTO_BROADCAST,
        payload: {
          barbershop_id: this.#barbershopId,
          professional_id: this.#professionalId,
          is_available: this.#isAvailable,
          updated_at: row?.updated_at ?? new Date().toISOString(),
        },
      });
    } catch (_) { /* broadcast best-effort */ }
  }

  #render() {
    const label = this.#isAvailable ? 'Ativo' : 'Inativo';
    if (this.#toggleEl) {
      this.#toggleEl.disabled = this.#salvando;
      this.#toggleEl.setAttribute('role', 'switch');
      this.#toggleEl.setAttribute('aria-checked', String(this.#isAvailable));
      this.#toggleEl.classList.toggle('mb-status-toggle--barbeiro-ativo', this.#isAvailable);
      this.#toggleEl.classList.toggle('mb-status-toggle--barbeiro-inativo', !this.#isAvailable);
    }
    if (this.#textoEl) {
      this.#textoEl.textContent = label;
      this.#textoEl.classList.toggle('mb-status-txt--barbeiro-ativo', this.#isAvailable);
      this.#textoEl.classList.toggle('mb-status-txt--barbeiro-inativo', !this.#isAvailable);
    }
    if (this.#statusEl) {
      BarbeiroAtividadeStatus.atualizarParagrafo(this.#statusEl, this.#isAvailable);
    }
  }

  #emitir(row = {}) {
    const detail = {
      barbershop_id: this.#barbershopId,
      professional_id: this.#professionalId,
      is_available: this.#isAvailable,
      ...row,
    };
    if (this.#onChange) this.#onChange(this.#isAvailable, detail);
    document.dispatchEvent(new CustomEvent(BarbeiroAtividadeStatus.EVENTO_ATUALIZADO, { detail }));
  }

  static async listar(barbershopId) {
    if (!barbershopId || typeof BffApiService === 'undefined') return [];
    try {
      const res = await BffApiService.barbearias.statusBarbeiros(barbershopId);
      if (res?.error) throw new Error(res.error);
      const lista = res?.data || res?.dados || [];
      return Array.isArray(lista) ? lista : [];
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[BarbeiroAtividadeStatus] listar:', err?.message || err);
      }
      return [];
    }
  }

  static async buscarStatus(barbershopId, professionalId) {
    const lista = await BarbeiroAtividadeStatus.listar(barbershopId);
    return lista.find(item => item.professional_id === professionalId) || {
      barbershop_id: barbershopId,
      professional_id: professionalId,
      is_available: false,
      updated_at: null,
    };
  }

  static mapa(lista = []) {
    return new Map((Array.isArray(lista) ? lista : []).map(item => [
      item.professional_id,
      {
        ...item,
        is_available: item?.is_available === true,
      },
    ]));
  }

  static criarParagrafo({ professionalId = '', isAvailable = false } = {}) {
    const p = document.createElement('p');
    p.className = 'barbeiro-atividade-status';
    if (professionalId) p.dataset.professionalId = professionalId;
    BarbeiroAtividadeStatus.atualizarParagrafo(p, isAvailable);
    return p;
  }

  static atualizarParagrafo(el, isAvailable = false) {
    if (!el) return;
    el.textContent = '';
    const valor = document.createElement('span');
    valor.className = `barbeiro-atividade-status__valor barbeiro-atividade-status__valor--${isAvailable ? 'ativo' : 'inativo'}`;
    valor.textContent = isAvailable ? 'Ativo' : 'Inativo';
    el.appendChild(valor);
  }

  static assinar(barbershopId, callback) {
    if (!barbershopId || typeof SupabaseService === 'undefined') return null;
    const emitir = payload => { if (typeof callback === 'function') callback(payload); };
    try {
      const canal = SupabaseService.channel(`barbeiro-status:${barbershopId}`)
        // postgres_changes: mudancas persistidas no banco (requer publicacao supabase_realtime)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: BarbeiroAtividadeStatus.TABELA,
            filter: `barbershop_id=eq.${barbershopId}`,
          },
          emitir,
        )
        // broadcast: propagacao imediata cliente-a-cliente, independente do banco/RLS
        .on(
          'broadcast',
          { event: BarbeiroAtividadeStatus.EVENTO_BROADCAST },
          msg => emitir({ new: msg?.payload || {} }),
        )
        .subscribe(status => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (typeof LoggerService !== 'undefined') {
              LoggerService.warn?.('[BarbeiroAtividadeStatus] Realtime falhou:', status);
            }
          }
        });
      return canal;
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[BarbeiroAtividadeStatus] Realtime indisponivel:', err?.message || err);
      }
      return null;
    }
  }
}

window.BarbeiroAtividadeStatus = BarbeiroAtividadeStatus;
