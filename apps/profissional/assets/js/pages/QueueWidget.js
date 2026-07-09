'use strict';

// =============================================================
// QueueWidget.js — Fila ao vivo na tela "Início" do profissional.
// Mostra cadeiras e clientes em espera via Supabase Realtime.
// Atualiza automaticamente sem reload.
//
// Dependências: QueueRepository.js, CadeiraService.js, AuthService.js,
//               BarbershopRepository.js, SupabaseService.js
// =============================================================

class QueueWidget {

  #telaEl       = null;
  #cadeirasEl   = null;
  #filaEl       = null;
  #barbershopId = null;
  #iniciado     = false;

  constructor() {}

  bind() {
    this.#telaEl     = document.getElementById('tela-inicio');
    this.#cadeirasEl = document.getElementById('queue-cadeiras');
    this.#filaEl     = document.getElementById('queue-fila');
    if (!this.#telaEl) return;

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        this.#iniciarSeLogado();
      } else {
        this.#parar();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Privados ────────────────────────────────────────────────

  async #iniciarSeLogado() {
    if (this.#iniciado) return;

    const perfil = AuthService.getPerfil();
    if (!perfil?.id) return; // visitante — não carrega fila

    try {
      const shopId = await QueueWidget.#fetchShopId(perfil.id);
      if (!shopId) return; // pro sem barbearia ainda
      this.#barbershopId = shopId;
      this.#iniciado = true;

      // Exibe a seção que estava oculta no HTML
      const secao = document.getElementById('queue-section');
      if (secao) secao.style.display = '';

      // Carregamento inicial
      await this.#renderTudo();

      // Inscreve Realtime — apenas queue_entries
      QueueRepository.subscribe(shopId, (tipo, row) => {
        this.#onRealtimeEvent(tipo, row);
      });
    } catch (err) {
      LoggerService.error('[QueueWidget] erro ao iniciar:', err);
    }
  }

  #parar() {
    if (this.#barbershopId) {
      QueueRepository.unsubscribe(this.#barbershopId);
    }
    this.#iniciado = false;
    this.#barbershopId = null;
  }

  async #renderTudo() {
    const [fila, cadeiras] = await Promise.all([
      QueueRepository.getByBarbershop(this.#barbershopId),
      QueueRepository.getCadeiras(this.#barbershopId),
    ]);
    this.#renderCadeiras(cadeiras, fila);
    this.#renderFila(fila);
  }

  // ── Re-fetch completo a cada evento Realtime ─────────────────
  // (simples e robusto — fila pequena, custo mínimo)
  #onRealtimeEvent(_tipo, _row) {
    this.#renderTudo().catch(err => {
      LoggerService.warn('[QueueWidget] re-fetch realtime falhou:', err);
    });
  }

  // ── Renders ─────────────────────────────────────────────────

  #renderCadeiras(cadeiras, fila) {
    if (!this.#cadeirasEl) return;

    if (!cadeiras.length) {
      this.#cadeirasEl.innerHTML = '<span style="color:var(--text-muted);font-size:.8rem;">Nenhuma cadeira cadastrada.</span>';
      return;
    }

    this.#cadeirasEl.innerHTML = '';
    for (const c of cadeiras) {
      const entrada = fila.find(e => e.chair?.id === c.id && e.status === 'in_service') ?? null;
      const el = Cadeira.criar({
        tipo:           'producao',
        entrada,
        podeInteragir:  false,
        confirmacao:    entrada?.client_confirmed ?? null,
      });
      el.dataset.chairId = c.id;
      this.#cadeirasEl.appendChild(el);
    }
  }

  #renderFila(fila) {
    if (!this.#filaEl) return;

    const naFila = fila.filter(e => e.status === 'waiting');

    if (!naFila.length) {
      this.#filaEl.innerHTML = '<p class="agenda-vazio" style="font-size:.8rem;">Fila vazia agora.</p>';
      return;
    }

    this.#filaEl.innerHTML = naFila.map((e, i) => {
      const nome = e.client?.full_name ?? 'Cliente';
      const hora = new Date(e.check_in_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="agenda-item" style="padding:10px 12px;">
          <div class="agenda-time">
            <span class="agenda-hr" style="font-size:.85rem;">#${i + 1}</span>
          </div>
          <div class="avatar">${QueueWidget.#inicial(nome)}</div>
          <div class="agenda-info">
            <p class="agenda-name">${nome}</p>
            <p class="agenda-serv">Entrou às ${hora}</p>
          </div>
          <button class="badge" style="cursor:pointer;font-size:.7rem;"
                  onclick="QueueWidget._chamar('${e.id}', '${this.#barbershopId}', '${e.professional?.id ?? ''}')">Chamar</button>
        </div>`;
    }).join('');
  }

  // Método estático chamado pelo onclick do HTML gerado
  static async _chamar(entradaId, barbershopId, professionalId) {
    try {
      await CadeiraService.promoverParaProducao({
        entradaId,
        barbershopId,
        professionalId,
        clientConfirmed: 'yes',
      });
    } catch (err) {
      LoggerService.error('[QueueWidget] erro ao chamar cliente:', err);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────

  static async #fetchShopId(ownerId) {
    const { data, error } = await SupabaseService.barbershops()
      .select('id')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.id ?? null;
  }

  static #inicial(nome) {
    return nome.trim().charAt(0).toUpperCase() || '?';
  }
}
