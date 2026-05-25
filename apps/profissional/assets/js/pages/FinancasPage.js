'use strict';

// =============================================================
// FinancasPage.js — Dashboard financeira profissional.
//
// O frontend renderiza dados prontos da BFF. Calculos financeiros,
// taxas e divisao barbeiro/barbearia ficam centralizados em
// /api/v1/financeiro.
// =============================================================

class FinancasPage {
  static #METODOS_COM_TAXA = new Set(['credito', 'credit', 'debito', 'debit']);

  #telaEl = null;
  #periodoAtual = 'mes';
  #customDe = null;
  #customAte = null;
  #shopId = null;
  #canalTransacoes = null;
  #carregando = false;
  #resolvendo = false;
  #dados = null;
  #refs = {};

  bind() {
    this.#telaEl = document.getElementById('tela-financas');
    if (!this.#telaEl) return;

    this.#cacheRefs();
    this.#bindFiltros();
    this.#bindTransacaoEvento();

    new MutationObserver(() => {
      const ativa = this.#telaEl.classList.contains('ativa') ||
        this.#telaEl.classList.contains('entrando-lento');
      if (ativa) this.#aoEntrar();
      else this.#pararRealtime();
    }).observe(this.#telaEl, { attributes: true, attributeFilter: ['class'] });
  }

  #cacheRefs() {
    const q = id => document.getElementById(id);
    this.#refs = {
      resumo: q('fin-resumo'),
      graficos: q('fin-graficos'),
      metodos: q('fin-metodos'),
      barbeiros: q('fin-barbeiros'),
      tituloBarbeiros: q('fin-barbeiros-titulo'),
      statusEquipe: q('fin-status-equipe'),
      loading: q('fin-loading'),
      vazio: q('fin-vazio'),
      erro: q('fin-erro'),
      customWrap: q('fin-custom-wrap'),
      dataDe: q('fin-data-de'),
      dataAte: q('fin-data-ate'),
      aplicarCustom: q('fin-aplicar-custom'),
    };
  }

  #bindFiltros() {
    this.#telaEl.querySelectorAll('.fin-btn-periodo').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.classList.contains('fin-btn-periodo--ativo') ? 'true' : 'false');
      btn.addEventListener('click', () => {
        this.#periodoAtual = btn.dataset.periodo || 'mes';
        this.#telaEl.querySelectorAll('.fin-btn-periodo').forEach(item => {
          item.classList.toggle('fin-btn-periodo--ativo', item === btn);
          item.setAttribute('aria-pressed', item === btn ? 'true' : 'false');
        });
        this.#alternarCustom(this.#periodoAtual === 'custom');
        if (this.#periodoAtual !== 'custom' && this.#shopId) this.#carregar();
      });
    });

    this.#refs.aplicarCustom?.addEventListener('click', () => {
      const de = this.#refs.dataDe?.value || '';
      const ate = this.#refs.dataAte?.value || '';
      if (!de || !ate || de > ate) {
        this.#mostrarErro('Selecione um intervalo personalizado valido.');
        return;
      }
      this.#customDe = de;
      this.#customAte = ate;
      this.#carregar();
    });
  }

  #bindTransacaoEvento() {
    document.addEventListener('barberflow:transacao-criada', event => {
      if (event.detail?.barbershopId === this.#shopId) this.#carregar();
    });
    document.addEventListener('barberflow:transacao-atualizada', event => {
      if (event.detail?.barbershopId === this.#shopId) this.#carregar();
    });
  }

  async #aoEntrar() {
    if (!this.#shopId && !this.#resolvendo) {
      await this.#resolverShopId();
      if (!this.#shopId) {
        this.#mostrarErro('Nao foi possivel identificar a barbearia vinculada.');
        return;
      }
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

      const { data: linkData, error: linkErr } = await ApiService.from('professional_shop_links')
        .select('barbershop_id')
        .eq('professional_id', perfil.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (linkErr && linkErr.code !== 'PGRST116') throw linkErr;
      this.#shopId = linkData?.barbershop_id ?? null;
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao resolver shopId:', err?.message);
      }
    } finally {
      this.#resolvendo = false;
    }
  }

  async #carregar() {
    if (this.#carregando || !this.#shopId) return;
    if (this.#periodoAtual === 'custom' && (!this.#customDe || !this.#customAte)) return;

    this.#carregando = true;
    this.#mostrarLoading(true);
    this.#mostrarErro('');

    try {
      const { data, error } = await BffApiService.financeiro.dashboard({
        barbershopId: this.#shopId,
        periodo: this.#periodoAtual,
        de: this.#customDe,
        ate: this.#customAte,
      });

      if (error) throw error;
      this.#dados = data;
      this.#render(data);
      this.#mostrarVazio(!data?.cards?.totalCortes?.total);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao carregar dashboard financeiro:', err?.message);
      }
      this.#render(null);
      this.#mostrarErro('Nao foi possivel carregar os dados financeiros agora.');
      this.#mostrarVazio(false);
    } finally {
      this.#carregando = false;
      this.#mostrarLoading(false);
    }
  }

  #render(dados) {
    if (!dados) {
      this.#limpar();
      return;
    }

    this.#renderResumo(dados.cards, dados.isOwner ?? false);
    this.#renderGraficos(dados);
    this.#renderMetodos(dados.metodosPagamento || []);
    this.#renderStatusEquipe(dados.statusEquipe || dados.cards?.totalBarbeiros || {});
    this.#renderBarbeiros(dados.barbeiros || []);
  }

  #renderResumo(cards, isOwner = false) {
    const el = this.#refs.resumo;
    if (!el) return;

    const lucroPrincipalLabel = isOwner ? 'Lucro Total' : 'Meu Lucro';
    const lucroPrincipalCard  = isOwner ? cards?.lucroBarbearia : (cards?.meuLucro ?? cards?.lucroBarbearia);
    const lucroPrincipalIcon  = isOwner ? '100%' : 'ML';

    const items = [
      { label: 'Receita Bruta', valor: this.#moeda(cards?.receitaBruta?.total), meta: this.#variacao(cards?.receitaBruta?.variacaoPct), icon: 'R$' },
      { label: 'Receita Liquida', valor: this.#moeda(cards?.receitaLiquida?.total), meta: this.#variacao(cards?.receitaLiquida?.variacaoPct), icon: 'LQ' },
      { label: lucroPrincipalLabel, valor: this.#moeda(lucroPrincipalCard?.total), meta: this.#variacao(lucroPrincipalCard?.variacaoPct), icon: lucroPrincipalIcon },
      { label: 'Total de Cortes', valor: this.#numero(cards?.totalCortes?.total), meta: this.#variacao(cards?.totalCortes?.variacaoPct), icon: '#' },
      {
        label: 'Total de Barbeiros',
        valor: this.#numero(cards?.totalBarbeiros?.total),
        meta: `${this.#numero(cards?.totalBarbeiros?.online)} online · ${this.#numero(cards?.totalBarbeiros?.inativos)} inativos`,
        icon: 'EQ',
      },
    ];

    el.innerHTML = items.map(item => `
      <article class="fin-kpi-card">
        <div class="fin-kpi-top">
          <span class="fin-kpi-icon">${FinancasPage.#escapar(item.icon)}</span>
          <span class="fin-kpi-meta ${this.#classeVariacao(item.meta)}">${item.meta}</span>
        </div>
        <p class="fin-kpi-label">${FinancasPage.#escapar(item.label)}</p>
        <strong class="fin-kpi-value">${FinancasPage.#escapar(item.valor)}</strong>
      </article>
    `).join('');
  }

  #renderGraficos(dados) {
    if (!this.#refs.graficos) return;
    const series = dados.series || [];
    const barbeiros = (dados.barbeiros || []).slice(0, 6);
    const donut = dados.donut || [];

    this.#refs.graficos.innerHTML = `
      <section class="fin-chart-panel fin-chart-panel--wide">
        <div class="fin-panel-head">
          <div>
            <p class="fin-eyebrow">Fluxo financeiro</p>
            <h2>Faturamento do periodo</h2>
          </div>
          <span class="fin-kpi-meta ${this.#classeVariacao(dados.comparativo?.receitaLiquida)}">${this.#variacao(dados.comparativo?.receitaLiquida)}</span>
        </div>
        ${this.#lineChart(series)}
      </section>
      <section class="fin-chart-panel">
        <div class="fin-panel-head">
          <div>
            <p class="fin-eyebrow">Performance</p>
            <h2>Receita por barbeiro</h2>
          </div>
        </div>
        ${this.#barChart(barbeiros)}
      </section>
      <section class="fin-chart-panel">
        <div class="fin-panel-head">
          <div>
            <p class="fin-eyebrow">Distribuicao</p>
            <h2>Divisao financeira</h2>
          </div>
        </div>
        ${this.#donutChart(donut)}
      </section>
    `;
  }

  #lineChart(series) {
    if (!series.length) return '<div class="fin-chart-empty">Sem serie para o periodo.</div>';
    const width = 620;
    const height = 220;
    const values = series.map(item => Number(item.receitaLiquida || 0));
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value / max) * (height - 28)) - 14;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const area = `0,${height} ${points} ${width},${height}`;

    return `
      <svg class="fin-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico de faturamento">
        <defs>
          <linearGradient id="finAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#0f766e" stop-opacity="0.28"></stop>
            <stop offset="100%" stop-color="#0f766e" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <polyline class="fin-line-grid" points="0,55 ${width},55"></polyline>
        <polyline class="fin-line-grid" points="0,115 ${width},115"></polyline>
        <polygon class="fin-line-area" points="${area}"></polygon>
        <polyline class="fin-line-path" points="${points}"></polyline>
      </svg>
    `;
  }

  #barChart(barbeiros) {
    if (!barbeiros.length) return '<div class="fin-chart-empty">Sem barbeiros no periodo.</div>';
    const max = Math.max(...barbeiros.map(item => Number(item.receitaLiquida || 0)), 1);
    return `
      <div class="fin-bar-chart">
        ${barbeiros.map(item => {
          const pct = Math.max(3, (Number(item.receitaLiquida || 0) / max) * 100);
          return `
            <div class="fin-bar-row">
              <span>${FinancasPage.#escapar(item.nome)}</span>
              <div class="fin-bar-track"><i style="width:${pct.toFixed(1)}%"></i></div>
              <strong>${this.#moeda(item.receitaLiquida)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  #donutChart(donut) {
    const total = donut.reduce((sum, item) => sum + Number(item.value || 0), 0);
    if (!total) return '<div class="fin-chart-empty">Sem distribuicao financeira.</div>';
    let start = 0;
    const stops = donut.map(item => {
      const pct = (Number(item.value || 0) / total) * 100;
      const segment = `${item.color} ${start.toFixed(2)}% ${(start + pct).toFixed(2)}%`;
      start += pct;
      return segment;
    }).join(', ');

    return `
      <div class="fin-donut-wrap">
        <div class="fin-donut" style="background: conic-gradient(${stops})">
          <span>${this.#moeda(total)}</span>
        </div>
        <div class="fin-donut-legend">
          ${donut.map(item => `
            <p><i style="background:${FinancasPage.#escapar(item.color)}"></i>${FinancasPage.#escapar(item.label)} <strong>${this.#moeda(item.value)}</strong></p>
          `).join('')}
        </div>
      </div>
    `;
  }

  #renderMetodos(metodos) {
    const el = this.#refs.metodos;
    if (!el) return;
    if (!metodos.length) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = metodos.map(item => {
      const temTaxa = FinancasPage.#METODOS_COM_TAXA.has(String(item.metodo).toLowerCase());
      return `
        <article class="fin-metodo-card">
          <div>
            <p>${FinancasPage.#escapar(item.label || item.metodo)}</p>
            <strong>${this.#moeda(item.receitaLiquida)}</strong>
            <span class="fin-metodo-bruto">Bruto: ${this.#moeda(item.receitaBruta)}</span>
            <span>${this.#numero(item.cortes)} cortes · ${this.#moeda(item.taxas)} taxas</span>
          </div>
          ${temTaxa ? `<button type="button" class="fin-taxa-btn" data-metodo="${FinancasPage.#escapar(item.metodo)}">Menos %</button>` : ''}
        </article>
      `;
    }).join('');

    el.querySelectorAll('.fin-taxa-btn').forEach(btn => {
      btn.addEventListener('click', () => this.#onMenosPercent(btn.dataset.metodo));
    });
  }

  #renderStatusEquipe(statusEquipe) {
    const el = this.#refs.statusEquipe;
    if (!el) return;
    el.innerHTML = `
      <span><strong>${this.#numero(statusEquipe.total)}</strong> barbeiros</span>
      <span><strong>${this.#numero(statusEquipe.online)}</strong> trabalhando</span>
      <span><strong>${this.#numero(statusEquipe.ativos)}</strong> ativos</span>
      <span><strong>${this.#numero(statusEquipe.inativos)}</strong> inativos</span>
    `;
  }

  #renderBarbeiros(barbeiros) {
    const el = this.#refs.barbeiros;
    if (!el) return;
    if (this.#refs.tituloBarbeiros) this.#refs.tituloBarbeiros.hidden = !barbeiros.length;

    if (!barbeiros.length) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = barbeiros.map(barbeiro => {
      const inicial = String(barbeiro.nome || '?').trim().charAt(0).toUpperCase() || '?';
      const avatar = barbeiro.avatarUrl && /^https?:\/\//.test(barbeiro.avatarUrl)
        ? `<img src="${FinancasPage.#escapar(barbeiro.avatarUrl)}" alt="">`
        : FinancasPage.#escapar(inicial);
      const status = barbeiro.status === 'online' ? 'trabalhando' : (barbeiro.ativo ? 'ativo' : 'inativo');
      const semAcordo = !barbeiro.agreementConfigured;

      return `
        <article class="fin-barber-card" data-prof-id="${FinancasPage.#escapar(barbeiro.professionalId)}">
          <div class="fin-barber-head">
            <div class="fin-barber-avatar">${avatar}</div>
            <div>
              <h3>${FinancasPage.#escapar(barbeiro.nome)}</h3>
              <p class="fin-status fin-status--${FinancasPage.#escapar(status)}">${FinancasPage.#escapar(status)}</p>
            </div>
            <span class="fin-growth ${Number(barbeiro.crescimentoPct) >= 0 ? 'positivo' : 'negativo'}">${this.#variacao(barbeiro.crescimentoPct)}</span>
          </div>
          ${semAcordo ? '<p class="fin-alerta-acordo">sem acordo configurado</p>' : ''}
          <dl class="fin-barber-metrics">
            <div><dt>Cortes</dt><dd>${this.#numero(barbeiro.cortes)}</dd></div>
            <div><dt>Bruto</dt><dd>${this.#moeda(barbeiro.receitaBruta)}</dd></div>
            <div><dt>Taxas</dt><dd>${this.#moeda(barbeiro.taxas)}</dd></div>
            <div><dt>Liquido</dt><dd>${this.#moeda(barbeiro.receitaLiquida)}</dd></div>
            <div><dt>Barbearia</dt><dd>${this.#numero(barbeiro.porcentagemBarbearia)}%</dd></div>
            <div><dt>Barbeiro</dt><dd>${this.#numero(barbeiro.porcentagemBarbeiro)}%</dd></div>
          </dl>
          <div class="fin-split-result">
            <p><span>Barbeiro recebe</span><strong>${this.#moeda(barbeiro.valorBarbeiro)}</strong></p>
            <p><span>Barbearia recebe</span><strong>${this.#moeda(barbeiro.valorBarbearia)}</strong></p>
          </div>
        </article>
      `;
    }).join('');
  }

  async #onMenosPercent(metodo) {
    if (!this.#shopId || !metodo || typeof MenosPercentualModal === 'undefined') return;
    const { confirmado, porcentagem } = await MenosPercentualModal.abrir({ metodo, valorBruto: 0 });
    if (!confirmado || porcentagem === null) return;

    try {
      const { error } = await BffApiService.financeiro.aplicarTaxaMetodo({
        barbershopId: this.#shopId,
        metodo,
        porcentagem,
        periodo: this.#periodoAtual,
        de: this.#customDe,
        ate: this.#customAte,
      });
      if (error) throw error;
      await this.#carregar();
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao aplicar taxa:', err?.message);
      }
      if (typeof NotificationService !== 'undefined') {
        NotificationService.mostrarToast?.('Erro', 'Nao foi possivel aplicar a taxa.', 'erro');
      }
    }
  }

  #iniciarRealtime() {
    if (this.#canalTransacoes || !this.#shopId || typeof SupabaseService === 'undefined') return;
    try {
      this.#canalTransacoes = SupabaseService.channel(`financas:${this.#shopId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `barbershop_id=eq.${this.#shopId}`,
        }, () => this.#carregar())
        .subscribe();
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] Realtime indisponivel:', err?.message);
      }
    }
  }

  #pararRealtime() {
    if (!this.#canalTransacoes) return;
    try { SupabaseService.removeChannel(this.#canalTransacoes); } catch (_) {}
    this.#canalTransacoes = null;
  }

  #alternarCustom(visivel) {
    if (this.#refs.customWrap) this.#refs.customWrap.hidden = !visivel;
  }

  #mostrarLoading(visivel) {
    if (this.#refs.loading) this.#refs.loading.hidden = !visivel;
  }

  #mostrarVazio(visivel) {
    if (this.#refs.vazio) this.#refs.vazio.hidden = !visivel;
  }

  #mostrarErro(mensagem) {
    if (!this.#refs.erro) return;
    this.#refs.erro.hidden = !mensagem;
    this.#refs.erro.textContent = mensagem || '';
  }

  #limpar() {
    ['resumo', 'graficos', 'metodos', 'statusEquipe', 'barbeiros'].forEach(key => {
      if (this.#refs[key]) this.#refs[key].innerHTML = '';
    });
  }

  #moeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(Number(valor || 0));
  }

  #numero(valor) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
      .format(Number(valor || 0));
  }

  #variacao(valor) {
    const numero = Number(valor || 0);
    const sinal = numero > 0 ? '+' : '';
    return `${sinal}${this.#numero(numero)}%`;
  }

  #classeVariacao(valor) {
    const texto = String(valor || '');
    const numero = Number(texto.replace('%', '').replace('+', '').replace(',', '.'));
    if (texto.includes('-') || numero < 0) return 'negativo';
    if (texto.includes('+') || numero > 0) return 'positivo';
    return 'neutro';
  }

  static #escapar(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
