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
  #resolvendo      = false;   // guard contra chamadas concorrentes a #resolverShopId
  #dadosPorMetodo  = null;    // cache local do último breakdown
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
      // Estado inicial de acessibilidade
      btn.setAttribute('aria-pressed', btn.classList.contains('fin-btn-periodo--ativo') ? 'true' : 'false');

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

  /** Ouve evento disparado por FinanceiroService ao finalizar ou atualizar corte. */
  #bindTransacaoEvento() {
    document.addEventListener('barberflow:transacao-criada', e => {
      if (e.detail?.barbershopId === this.#shopId) this.#carregar();
    });
    document.addEventListener('barberflow:transacao-atualizada', e => {
      if (e.detail?.barbershopId === this.#shopId) this.#carregar();
    });
  }

  // ══════════════════════════════════════════════════════════
  // ENTRADA NA TELA
  // ══════════════════════════════════════════════════════════

  async #aoEntrar() {
    if (!this.#shopId && !this.#resolvendo) {
      await this.#resolverShopId();
      if (!this.#shopId) return;
    } else if (this.#resolvendo) {
      return;
    }
    await this.#carregar();
    this.#iniciarRealtime();
  }

  async #resolverShopId() {
    this.#resolvendo = true;
    try {
      const perfil = typeof AuthService !== 'undefined' ? AuthService.getPerfil?.() : null;
      if (!perfil?.id) return;

      // 1. Tenta como dono da barbearia
      const { data: shopData, error: shopErr } = await ApiService.from('barbershops')
        .select('id')
        .eq('owner_id', perfil.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (shopErr && shopErr.code !== 'PGRST116') throw shopErr;

      if (shopData?.id) {
        this.#shopId = shopData.id;
        return;
      }

      // 2. Barbeiro convidado: vínculo via professional_shop_links
      //    (professionals não tem coluna barbershop_id)
      const { data: linkData, error: linkErr } = await ApiService.from('professional_shop_links')
        .select('barbershop_id')
        .eq('professional_id', perfil.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (linkErr && linkErr.code !== 'PGRST116') throw linkErr;
      this.#shopId = linkData?.barbershop_id ?? null;
    } catch (err) {
      LoggerService.warn('[FinancasPage] erro ao resolver shopId:', err?.message);
    } finally {
      this.#resolvendo = false;
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
      const [{ geral, barbeiros }, dadosPorMetodo] = await Promise.all([
        FinanceiroService.getResumo(this.#shopId, this.#periodoAtual),
        FinanceiroService.getResumoPorMetodoPagamento(this.#shopId, this.#periodoAtual),
      ]);

      this.#dadosPorMetodo = dadosPorMetodo;
      this.#renderResumoMetodos(dadosPorMetodo, geral);
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

  #renderResumoMetodos({ credito, debito, pixDinheiro, totalGeral }, geral) {
    const el = this.#refs.resumo;
    if (!el) return;

    const fmtValor = v => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`;

    el.innerHTML = `
      <div class="fin-metodos-grid">
        <div class="fin-card-metodo" data-metodo="credito">
          <div class="fin-card-metodo-header">
            <p class="fin-card-label">Crédito</p>
            <button
              class="btn-float fin-btn-menos-pct"
              data-metodo="credito"
              type="button"
              aria-label="Aplicar taxa em Crédito"
              title="Aplicar taxa da maquininha"
            >Menos %</button>
          </div>
          <p class="fin-card-valor">${fmtValor(credito.total)}</p>
          <p class="fin-card-meta">${credito.count} corte${credito.count !== 1 ? 's' : ''}</p>
        </div>
        <div class="fin-card-metodo" data-metodo="debito">
          <div class="fin-card-metodo-header">
            <p class="fin-card-label">Débito</p>
            <button
              class="btn-float fin-btn-menos-pct"
              data-metodo="debito"
              type="button"
              aria-label="Aplicar taxa em Débito"
              title="Aplicar taxa da maquininha"
            >Menos %</button>
          </div>
          <p class="fin-card-valor">${fmtValor(debito.total)}</p>
          <p class="fin-card-meta">${debito.count} corte${debito.count !== 1 ? 's' : ''}</p>
        </div>
        <div class="fin-card-metodo fin-card-metodo--pix">
          <p class="fin-card-label">PIX &amp; Dinheiro</p>
          <p class="fin-card-valor">${fmtValor(pixDinheiro.total)}</p>
          <p class="fin-card-meta">${pixDinheiro.count} corte${pixDinheiro.count !== 1 ? 's' : ''}</p>
        </div>
        <div class="fin-card-metodo fin-card-metodo--total">
          <p class="fin-card-label">Total Geral</p>
          <p class="fin-card-valor fin-card-valor--destaque">${fmtValor(totalGeral)}</p>
          <p class="fin-card-meta">${geral.count} corte${geral.count !== 1 ? 's' : ''}</p>
        </div>
      </div>`;

    // Event delegation — evita rebind ao re-renderizar
    el.querySelectorAll('.fin-btn-menos-pct').forEach(btn => {
      btn.addEventListener('click', () => this.#onMenosPercent(btn.dataset.metodo));
    });
  }

  async #onMenosPercent(metodo) {
    if (!this.#dadosPorMetodo || !this.#shopId) return;
    const grupo     = metodo === 'credito' ? this.#dadosPorMetodo.credito : this.#dadosPorMetodo.debito;
    const valorBruto = grupo.grossTotal;

    const { confirmado, porcentagem } = await MenosPercentualModal.abrir({ metodo, valorBruto });
    if (!confirmado || porcentagem === null) return;

    try {
      await FinanceiroService.aplicarDescontoMetodo(
        this.#shopId, this.#periodoAtual, metodo, porcentagem,
      );
      // barberflow:transacao-atualizada é despachado por aplicarDescontoMetodo → recarrega
    } catch (err) {
      LoggerService.warn('[FinancasPage] erro ao aplicar desconto:', err?.message);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast('Erro', 'Não foi possível aplicar a taxa. Tente novamente.', 'erro');
      }
    }
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
      const total   = `R$ ${(Number(b.total) || 0).toFixed(2).replace('.', ',')}`;
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
