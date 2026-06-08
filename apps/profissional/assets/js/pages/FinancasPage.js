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
  #canaisResumo = [];
  #carregando = false;
  #resolvendo = false;
  #payoutEmAndamento = false;
  #acertoEmAndamento = false;
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
        .maybeSingle();

      if (shopErr) throw shopErr;
      if (shopData?.id) {
        this.#shopId = shopData.id;
        return;
      }

      const { data: linkData, error: linkErr } = await ApiService.from('professional_shop_links')
        .select('barbershop_id')
        .eq('professional_id', perfil.id)
        .eq('is_active', true)
        .maybeSingle();

      if (linkErr) throw linkErr;
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
    if (this.#carregando || !this.#shopId) return false;
    if (this.#periodoAtual === 'custom' && (!this.#customDe || !this.#customAte)) return false;

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
      return true;
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao carregar dashboard financeiro:', err?.message);
      }
      this.#render(null);
      this.#mostrarErro('Nao foi possivel carregar os dados financeiros agora.');
      this.#mostrarVazio(false);
      return false;
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
    this.#renderBarbeiros(dados.barbeiros || [], dados.isOwner === true);
  }

  #renderResumo(cards, isOwner = false) {
    const el = this.#refs.resumo;
    if (!el) return;

    const lucroPrincipalLabel = isOwner ? 'Lucro Total' : 'Meu Lucro';
    const lucroPrincipalCard  = isOwner ? cards?.lucroBarbearia : (cards?.meuLucro ?? cards?.lucroBarbearia);
    const lucroPrincipalIcon  = isOwner ? '100%' : 'ML';

    const cicloItems = isOwner ? [] : [
      { label: 'Valor pendente atual', valor: this.#moeda(cards?.saldoPendenteAtual?.total), meta: 'Ciclo aberto', icon: 'VP' },
      { label: 'Total recebido', valor: this.#moeda(cards?.totalRecebido?.total), meta: 'Confirmado', icon: 'TR' },
      { label: 'Faturamento historico', valor: this.#moeda(cards?.faturamentoHistorico?.total), meta: 'Servicos pagos', icon: 'FH' },
    ];

    const items = [
      ...cicloItems,
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
      {
        label: 'Mensalistas',
        valor: this.#moeda(cards?.mensalistas?.total),
        meta: `${this.#numero(cards?.mensalistas?.count)} ativo${cards?.mensalistas?.count !== 1 ? 's' : ''}`,
        icon: '👑',
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
      ${this.#renderAcertoSemanal(dados.acertoSemanal)}
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

    this.#refs.graficos.querySelector('.fin-settlement-confirm')?.addEventListener('click', () =>
      this.#confirmarAcertoSemanal(dados.acertoSemanal)
    );
  }

  #renderAcertoSemanal(acertoSemanal) {
    const resumo = acertoSemanal?.resumo;
    if (!resumo) return '';

    const statusPago = resumo.status === 'paid';
    const podeConfirmar = !statusPago && Number(resumo.valorARepassarBarbearia || 0) > 0;
    const historico = acertoSemanal.historico || [];
    return `
      <section class="fin-chart-panel fin-settlement-panel fin-chart-panel--wide">
        <div class="fin-panel-head">
          <div>
            <p class="fin-eyebrow">Acerto semanal</p>
            <h2>Resumo de Acerto Semanal</h2>
          </div>
          <span class="fin-settlement-status ${statusPago ? 'fin-settlement-status--paid' : 'fin-settlement-status--pending'}">
            Status: ${statusPago ? 'Pago' : 'Pendente'}
          </span>
        </div>
        <div class="fin-settlement-highlight">
          <span>Valor a Repassar para a Barbearia</span>
          <strong>${this.#moeda(resumo.valorARepassarBarbearia)}</strong>
          ${podeConfirmar ? '<button type="button" class="fin-settlement-confirm">Confirmar repasse</button>' : ''}
        </div>
        <dl class="fin-barber-metrics fin-settlement-metrics">
          <div><dt>Produção Bruta da Semana</dt><dd>${this.#moeda(resumo.producaoBrutaSemana)}</dd></div>
          <div><dt>Pix</dt><dd>${this.#moeda(resumo.metodos?.pix)}</dd></div>
          <div><dt>Dinheiro</dt><dd>${this.#moeda(resumo.metodos?.dinheiro)}</dd></div>
          <div><dt>Débito</dt><dd>${this.#moeda(resumo.metodos?.debit)}</dd></div>
          <div><dt>Crédito</dt><dd>${this.#moeda(resumo.metodos?.credit)}</dd></div>
          <div><dt>Taxas de maquininha aplicadas</dt><dd>${this.#moeda(resumo.taxasMaquininha)}</dd></div>
          <div><dt>Participação da Barbearia</dt><dd>${this.#moeda(resumo.participacaoBarbearia)}</dd></div>
          <div><dt>Participação do Barbeiro</dt><dd>${this.#moeda(resumo.participacaoBarbeiro)}</dd></div>
          <div><dt>Valor Líquido do Barbeiro</dt><dd>${this.#moeda(resumo.valorLiquidoBarbeiro)}</dd></div>
        </dl>
        <div class="fin-settlement-history">
          <h3>Histórico</h3>
          ${historico.length ? historico.map(item => `
            <p>
              <span>${FinancasPage.#escapar(item.semanaReferencia || '')}</span>
              <strong>${this.#moeda(item.valorBarbearia)}</strong>
              <em>${item.status === 'paid' ? 'Pago' : 'Pendente'}</em>
            </p>
          `).join('') : '<p><span>Sem fechamentos semanais.</span><strong>R$ 0,00</strong><em>Pendente</em></p>'}
        </div>
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
            <span>${this.#numero(item.cortes)} cortes · ${this.#moeda(item.taxas)} taxas${temTaxa ? ` · ${this.#numero(item.feePercent)}%` : ''}</span>
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

  #renderBarbeiros(barbeiros, isOwner = false) {
    const el = this.#refs.barbeiros;
    if (!el) return;
    if (this.#refs.tituloBarbeiros) this.#refs.tituloBarbeiros.hidden = !barbeiros.length;

    if (!barbeiros.length) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = barbeiros.map(barbeiro => {
      const inicial = String(barbeiro.nome || '?').trim().charAt(0).toUpperCase() || '?';
      const avatarUrl = FinancasPage.#resolverAvatarUrl(barbeiro);
      const avatar = avatarUrl
        ? `<img src="${FinancasPage.#escapar(avatarUrl)}" alt="${FinancasPage.#escapar(barbeiro.nome || 'Barbeiro')}" loading="lazy">`
        : FinancasPage.#escapar(inicial);
      const status = barbeiro.status === 'online' ? 'trabalhando' : (barbeiro.ativo ? 'ativo' : 'inativo');
      const semAcordo = !barbeiro.agreementConfigured;
      const podePagar = isOwner && barbeiro.papel !== 'owner' && Number(barbeiro.pendingPayoutAmount || 0) > 0;

      return `
        <article class="fin-barber-card" data-prof-id="${FinancasPage.#escapar(barbeiro.professionalId)}">
          <div class="fin-barber-head">
            <div class="fin-barber-avatar" data-inicial="${FinancasPage.#escapar(inicial)}">${avatar}</div>
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
            <div><dt>Total recebido</dt><dd>${this.#moeda(barbeiro.totalRecebido)}</dd></div>
            <div><dt>Fatur. historico</dt><dd>${this.#moeda(barbeiro.faturamentoHistorico)}</dd></div>
            <div><dt>Barbearia</dt><dd>${this.#numero(barbeiro.porcentagemBarbearia)}%</dd></div>
            <div><dt>Barbeiro</dt><dd>${this.#numero(barbeiro.porcentagemBarbeiro)}%</dd></div>
          </dl>
          <div class="fin-split-result">
            <div class="fin-payout-row">
              <p><span>Valor pendente atual</span><strong>${this.#moeda(barbeiro.saldoPendenteAtual ?? barbeiro.pendingPayoutAmount)}</strong></p>
              ${podePagar ? `<button type="button" class="fin-payout-btn" data-prof-id="${FinancasPage.#escapar(barbeiro.professionalId)}">Pagar</button>` : ''}
            </div>
            <p><span>Barbeiro recebe</span><strong>${this.#moeda(barbeiro.valorBarbeiro)}</strong></p>
            <p><span>Barbearia recebe</span><strong>${this.#moeda(barbeiro.valorBarbearia)}</strong></p>
          </div>
        </article>
      `;
    }).join('');

    el.querySelectorAll('.fin-payout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const barbeiro = barbeiros.find(item => item.professionalId === btn.dataset.profId);
        if (barbeiro) this.#abrirModalPagamento(barbeiro);
      });
    });
    el.querySelectorAll('.fin-barber-avatar img').forEach(img => {
      img.addEventListener('error', () => {
        const wrap = img.closest('.fin-barber-avatar');
        if (wrap) wrap.textContent = wrap.dataset.inicial || '?';
      }, { once: true });
    });
  }

  #abrirModalPagamento(barbeiro) {
    if (!barbeiro || this.#payoutEmAndamento || document.querySelector('.fin-payout-modal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'fin-payout-modal';
    overlay.innerHTML = `
      <div class="fin-payout-modal__box" role="dialog" aria-modal="true" aria-labelledby="fin-payout-title">
        <div class="fin-payout-modal__head">
          <h3 id="fin-payout-title">Confirmar pagamento</h3>
          <button type="button" class="fin-payout-modal__close" aria-label="Fechar">&times;</button>
        </div>
        <div class="fin-payout-modal__body">
          <p><span>Barbeiro</span><strong>${FinancasPage.#escapar(barbeiro.nome)}</strong></p>
          <p><span>Valor pendente atual</span><strong>${this.#moeda(barbeiro.saldoPendenteAtual ?? barbeiro.pendingPayoutAmount)}</strong></p>
          <p><span>Periodo</span><strong>${FinancasPage.#escapar(this.#periodoLabel())}</strong></p>
          <p><span>Cortes pendentes no ciclo aberto</span><strong>${this.#numero(barbeiro.cutsPendingPayout)}</strong></p>
        </div>
        <p class="fin-payout-modal__erro" hidden></p>
        <div class="fin-payout-modal__actions">
          <button type="button" class="fin-payout-cancel">Cancelar</button>
          <button type="button" class="fin-payout-confirm">Confirmar</button>
        </div>
      </div>
    `;

    const fechar = () => overlay.remove();
    overlay.querySelector('.fin-payout-modal__close')?.addEventListener('click', fechar);
    overlay.querySelector('.fin-payout-cancel')?.addEventListener('click', fechar);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) fechar();
    });
    overlay.querySelector('.fin-payout-confirm')?.addEventListener('click', () =>
      this.#confirmarPagamentoBarbeiro(barbeiro, overlay)
    );
    document.body?.appendChild(overlay);
  }

  async #confirmarPagamentoBarbeiro(barbeiro, overlay) {
    if (this.#payoutEmAndamento || !this.#shopId || !barbeiro?.professionalId) return;
    this.#payoutEmAndamento = true;
    const confirmBtn = overlay.querySelector('.fin-payout-confirm');
    const erroEl = overlay.querySelector('.fin-payout-modal__erro');
    if (confirmBtn) confirmBtn.disabled = true;
    if (erroEl) {
      erroEl.hidden = true;
      erroEl.textContent = '';
    }

    try {
      const { error } = await BffApiService.financeiro.confirmarPagamentoBarbeiro({
        barbershopId: this.#shopId,
        professionalId: barbeiro.professionalId,
        periodo: this.#periodoAtual,
        de: this.#customDe,
        ate: this.#customAte,
        displayedAmount: barbeiro.saldoPendenteAtual ?? barbeiro.pendingPayoutAmount,
      });
      if (error) throw error;
      overlay.remove();
      await this.#carregar();
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao confirmar pagamento:', err?.message);
      }
      if (erroEl) {
        erroEl.textContent = err?.message || 'Nao foi possivel registrar o pagamento.';
        erroEl.hidden = false;
      }
      if (confirmBtn) confirmBtn.disabled = false;
    } finally {
      this.#payoutEmAndamento = false;
    }
  }

  async #confirmarAcertoSemanal(acertoSemanal) {
    const resumo = acertoSemanal?.resumo;
    if (this.#acertoEmAndamento || !this.#shopId || !resumo) return;
    this.#acertoEmAndamento = true;
    const btn = this.#refs.graficos?.querySelector('.fin-settlement-confirm');
    if (btn) btn.disabled = true;

    try {
      const { data, error } = await BffApiService.financeiro.confirmarAcertoSemanal({
        barbershopId: this.#shopId,
        periodo: 'semana',
        displayedAmount: resumo.valorARepassarBarbearia,
      });
      if (error) throw error;

      if (data?.acertoSemanal && this.#dados) {
        this.#dados = { ...this.#dados, acertoSemanal: data.acertoSemanal };
        this.#renderGraficos(this.#dados);
      }

      const recarregado = await this.#carregar();
      if (!recarregado) {
        this.#renderGraficos(this.#dados);
      }
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] erro ao confirmar acerto semanal:', err?.message);
      }
      this.#mostrarErro(err?.message || 'Nao foi possivel confirmar o repasse semanal.');
      if (btn) btn.disabled = false;
    } finally {
      this.#acertoEmAndamento = false;
    }
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
    if (this.#canaisResumo.length || !this.#shopId || typeof SupabaseService === 'undefined') return;
    try {
      this.#canaisResumo = [
        this.#assinarTabelaResumo('transactions'),
        this.#assinarTabelaResumo('agreements'),
        this.#assinarTabelaResumo('professional_shop_links'),
        this.#assinarTabelaResumo('professional_barbershop_presence'),
        this.#assinarTabelaResumo('financial_payment_method_fees'),
        this.#assinarBarbeariaResumo(),
      ].filter(Boolean);
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.warn?.('[FinancasPage] Realtime indisponivel:', err?.message);
      }
    }
  }

  #assinarTabelaResumo(tabela) {
    return SupabaseService.channel(`financas:${tabela}:${this.#shopId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: tabela,
        filter: `barbershop_id=eq.${this.#shopId}`,
      }, () => this.#carregar())
      .subscribe();
  }

  #assinarBarbeariaResumo() {
    return SupabaseService.channel(`financas:barbershops:${this.#shopId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'barbershops',
        filter: `id=eq.${this.#shopId}`,
      }, () => this.#carregar())
      .subscribe();
  }

  #pararRealtime() {
    if (!this.#canaisResumo.length) return;
    for (const canal of this.#canaisResumo) {
      try { SupabaseService.removeChannel(canal); } catch (_) {}
    }
    this.#canaisResumo = [];
  }

  #alternarCustom(visivel) {
    if (this.#refs.customWrap) this.#refs.customWrap.hidden = !visivel;
  }

  #periodoLabel() {
    if (this.#periodoAtual === 'custom') {
      return `${this.#customDe || ''} ate ${this.#customAte || ''}`.trim();
    }
    const labels = {
      hoje: 'Hoje',
      ontem: 'Ontem',
      semana: 'Semana',
      mes: 'Mes',
      ano: 'Ano',
    };
    return labels[this.#periodoAtual] || 'Periodo';
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

  static #resolverAvatarUrl(barbeiro) {
    const path = barbeiro?.avatarPath || barbeiro?.avatar_path || barbeiro?.avatarUrl || barbeiro?.avatar_url || '';
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    if (typeof ApiService !== 'undefined' && ApiService.resolveAvatarUrl) {
      return ApiService.resolveAvatarUrl(path, barbeiro?.updatedAt || barbeiro?.updated_at || null);
    }
    if (typeof SupabaseService !== 'undefined' && SupabaseService.resolveAvatarUrl) {
      return SupabaseService.resolveAvatarUrl(path, barbeiro?.updatedAt || barbeiro?.updated_at || null);
    }
    return '';
  }
}
