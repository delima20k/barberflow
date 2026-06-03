'use strict';

class BarbeiroAtividadeStatus {
  static TABELA = 'professional_barbershop_presence';
  static EVENTO_ATUALIZADO = 'barberflow:barbeiro-atividade-atualizada';

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

  async init() {
    const status = await BarbeiroAtividadeStatus.buscarStatus(this.#barbershopId, this.#professionalId);
    this.atualizarStatus(status, { emit: false });
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
      this.atualizarStatus(res?.data || res?.dados || { is_available: !this.#isAvailable });
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
      this.#textoEl.textContent = `Barbeiro ${this.#nome} ${label}`;
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
    const prefixo = document.createElement('span');
    prefixo.textContent = 'Barbeiro';
    const valor = document.createElement('span');
    valor.className = `barbeiro-atividade-status__valor barbeiro-atividade-status__valor--${isAvailable ? 'ativo' : 'inativo'}`;
    valor.textContent = isAvailable ? 'Ativo' : 'Inativo';
    el.append(prefixo, valor);
  }

  static assinar(barbershopId, callback) {
    if (!barbershopId || typeof SupabaseService === 'undefined') return null;
    try {
      const canal = SupabaseService.channel(`barbeiro-status:${barbershopId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: BarbeiroAtividadeStatus.TABELA,
            filter: `barbershop_id=eq.${barbershopId}`,
          },
          payload => {
            if (typeof callback === 'function') callback(payload);
          },
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
