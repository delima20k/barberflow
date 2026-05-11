'use strict';

// =============================================================
// FinancasPage.js — Tela "Finanças" do app profissional.
//
// Responsabilidades:
//  • Dashboard com filtro de período (hoje/semana/mês/total).
//  • Cards de resumo geral (total R$ + contagem de cortes).
//  • Grid de barbeiros com totais individuais.
//  • Clique em card de barbeiro → BarberFinanceModal (extrato).
//  • Realtime via Supabase: atualiza automaticamente ao receber
//    novo evento `barberflow:transacao-criada`.
//
// Dependências: FinanceiroService.js, BarberFinanceModal.js,
//               BarbershopRepository.js, AuthService.js,
//               SupabaseService.js, LoggerService.js
// =============================================================

class FinancasPage {

  // ── Estado ────────────────────────────────────────────────
  #telaEl          = null;
  #periodoAtual    = 'hoje';
  #shopId          = null;
  #canalTransacoes = null;
  #carregando      = false;
  #refs            = {};

  constructor() {}

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /** Chame uma vez após o DOM estar disponível. */
  bind() {
    this.#telaEl = document.getElementById('tela-financas');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindFiltros();
    this.#bindTransacaoEvento();

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
                    this.#telaEl.classList.contains('entrando-lento');
      if (ativa) {
        this.#aoEntrar();
      } else {
        this.#pararRealtime();
      }
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  // ══════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════

  #cacheRefs() {
    const q = id => document.getElementById(id);
    this.#refs = {
      resumo:    q('fin-resumo'),
      barbeiros: q('fin-barbeiros'),
      titulo:    q('fin-barbeiros-titulo'),
      loading:   q('fin-loading'),
      vazio:     q('fin-vazio'),
    };
  }

  #bindFiltros() {
    this.#telaEl.querySelectorAll('.fin-btn-periodo').forEach(btn => {
      btn.addEventListener('click', () => {
        this.#telaEl.querySelectorAll('.fin-btn-periodo').forEach(b => {
          b.classList.remove('fin-btn-periodo--ativo');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('fin-btn-periodo--ativo');
        btn.setAttribute('aria-pressed', 'true');
        this.#periodoAtual = btn.dataset.periodo;
        if (this.#shopId) this.#carregar();
      });
    });
  }

  /** Ouve evento disparado por FinanceiroService ao finalizar corte. */
  #bindTransacaoEvento() {
    document.addEventListener('barberflow:transacao-criada', e => {
      if (e.detail?.barbershopId === this.#shopId) this.#carregar();
    });
  }

  // ══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ══════════════════════════════════════════════════════════

  async #aoEntrar() {
    if (!this.#shopId) {
      await this.#resolverShopId();
      if (!this.#shopId) return;
    }
    await this.#carregar();
    this.#iniciarRealtime();
  }

  async #resolverShopId() {
    try {
      const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
      if (!perfil?.id) return;

      const { data, error } = await ApiService.from('barbershops')
        .select('id')
        .eq('owner_id', perfil.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // Barbeiro convidado: busca via professionals
      if (!data) {
        const { data: profData } = await ApiService.from('professionals')
          .select('barbershop_id')
          .eq('id', perfil.id)
          .limit(1)
          .single();
        this.#shopId = profData?.barbershop_id ?? null;
      } else {
        this.#shopId = data.id;
      }
    } catch (err) {
      LoggerService.warn('[FinancasPage] erro ao resolver shopId:', err?.message);
    }
  }

  // ══════════════════════════════════════════════════════════
  // CARGA E RENDER
  // ══════════════════════════════════════════════════════════

  async #carregar() {
    if (this.#carregando || !this.#shopId) return;
    this.#carregando = true;
    this.#mostrarLoading(true);

    try {
      const { geral, barbeiros } = await FinanceiroService.getResumo(
        this.#shopId, this.#periodoAtual,
      );

      this.#renderResumo(geral);
      this.#renderBarbeiros(barbeiros);
      this.#mostrarVazio(!geral.count);
    } catch (err) {
      LoggerService.warn('[FinancasPage] erro ao carregar:', err?.message);
      this.#mostrarVazio(true);
    } finally {
      this.#carregando = false;
      this.#mostrarLoading(false);
    }
  }

  #renderResumo({ count, total }) {
    const el = this.#refs.resumo;
    if (!el) return;

    el.innerHTML = `
      <div class="fin-card-resumo">
        <p class="fin-card-label">Receita total</p>
        <p class="fin-card-valor fin-card-valor--destaque">
          R$ ${(total).toFixed(2).replace('.', ',')}
        </p>
      </div>
      <div class="fin-card-resumo">
        <p class="fin-card-label">Cortes realizados</p>
        <p class="fin-card-valor">${count}</p>
      </div>`;
  }

  #renderBarbeiros(barbeiros) {
    const el     = this.#refs.barbeiros;
    const titulo = this.#refs.titulo;
    if (!el) return;

    if (!barbeiros.length) {
      el.innerHTML = '';
      if (titulo) titulo.hidden = true;
      return;
    }

    if (titulo) titulo.hidden = false;

    el.innerHTML = barbeiros.map(b => {
      const inicial = String(b.nome ?? '?').trim().charAt(0).toUpperCase() || '?';
      const total   = `R$ ${b.total.toFixed(2).replace('.', ',')}`;
      return `
        <button class="fin-barber-card"
                data-prof-id="${FinancasPage.#escapar(b.professionalId)}"
                data-prof-nome="${FinancasPage.#escapar(b.nome)}"
                aria-label="Ver extrato de ${FinancasPage.#escapar(b.nome)}">
          <div class="fin-barber-avatar" aria-hidden="true">${inicial}</div>
          <div class="fin-barber-info">
            <p class="fin-barber-nome">${FinancasPage.#escapar(b.nome)}</p>
            <p class="fin-barber-meta">${b.count} corte${b.count !== 1 ? 's' : ''}</p>
          </div>
          <p class="fin-barber-total">${total}</p>
          <span class="fin-barber-chevron" aria-hidden="true">›</span>
        </button>`;
    }).join('');

    // Bind cliques em cards de barbeiro
    el.querySelectorAll('.fin-barber-card').forEach(card => {
      card.addEventListener('click', () => {
        BarberFinanceModal.abrir({
          professionalId:   card.dataset.profId,
          professionalNome: card.dataset.profNome,
          barbershopId:     this.#shopId,
          periodo:          this.#periodoAtual,
        }).catch(() => {});
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════════════════

  #iniciarRealtime() {
    if (this.#canalTransacoes || !this.#shopId) return;

    try {
      this.#canalTransacoes = SupabaseService.channel(`financas:${this.#shopId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'transactions',
            filter: `barbershop_id=eq.${this.#shopId}`,
          },
          () => this.#carregar(),
        )
        .subscribe();
    } catch (e) {
      LoggerService.warn('[FinancasPage] Realtime indisponível:', e?.message);
    }
  }

  #pararRealtime() {
    if (this.#canalTransacoes) {
      try { SupabaseService.removeChannel(this.#canalTransacoes); } catch (_) {}
      this.#canalTransacoes = null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════════

  #mostrarLoading(visivel) {
    if (this.#refs.loading) this.#refs.loading.hidden = !visivel;
  }

  #mostrarVazio(visivel) {
    if (this.#refs.vazio) this.#refs.vazio.hidden = !visivel;
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
