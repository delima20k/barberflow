'use strict';

const Money = require('./Money');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FinanceiroCalculator centraliza as regras financeiras da barbearia.
 */
class FinanceiroCalculator {
  static periodos = ['hoje', 'ontem', 'semana', 'mes', 'ano', 'custom'];

  resolverPeriodo(periodo = 'mes', de = null, ate = null, now = new Date()) {
    const tipo = FinanceiroCalculator.periodos.includes(periodo) ? periodo : 'mes';
    const base = new Date(now);
    const fimDia = date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    const inicioDia = date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

    let inicio;
    let fim;

    if (tipo === 'custom') {
      if (!de || !ate) throw new Error('Periodo custom exige de e ate.');
      inicio = inicioDia(new Date(`${de}T00:00:00`));
      fim = fimDia(new Date(`${ate}T00:00:00`));
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
        throw new Error('Periodo custom invalido.');
      }
    } else if (tipo === 'hoje') {
      inicio = inicioDia(base);
      fim = fimDia(base);
    } else if (tipo === 'ontem') {
      const ontem = new Date(base.getTime() - DAY_MS);
      inicio = inicioDia(ontem);
      fim = fimDia(ontem);
    } else if (tipo === 'semana') {
      const day = base.getDay();
      const diff = day === 0 ? 6 : day - 1;
      inicio = inicioDia(new Date(base.getFullYear(), base.getMonth(), base.getDate() - diff));
      fim = fimDia(base);
    } else if (tipo === 'ano') {
      inicio = new Date(base.getFullYear(), 0, 1, 0, 0, 0, 0);
      fim = fimDia(base);
    } else {
      inicio = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
      fim = fimDia(base);
    }

    const janelaMs = fim.getTime() - inicio.getTime() + 1;
    const fimAnterior = new Date(inicio.getTime() - 1);
    const inicioAnterior = new Date(fimAnterior.getTime() - janelaMs + 1);

    return {
      tipo,
      inicio,
      fim,
      inicioAnterior,
      fimAnterior,
      de: this.#dateOnly(inicio),
      ate: this.#dateOnly(fim),
      anteriorDe: this.#dateOnly(inicioAnterior),
      anteriorAte: this.#dateOnly(fimAnterior),
    };
  }

  calcularDashboard({
    periodo,
    transacoes = [],
    transacoesAnteriores = [],
    agreements = [],
    profissionais = [],
    statusEquipe = {},
    isOwner = false,
    viewerProfessionalId = null,
    mensalistas = null,
    despesas = [],
    despesasAnteriores = [],
    taxasMetodoPagamento = [],
  }) {
    const barbeiroMap = this.#barbeiroMap(profissionais, statusEquipe);
    const agreementMap = this.#agreementMap(agreements, barbeiroMap);
    const taxaMetodoMap = this.#taxaMetodoMap(taxasMetodoPagamento);
    const atual = this.#agregar(transacoes, agreementMap, barbeiroMap, taxaMetodoMap);
    const anterior = this.#agregar(transacoesAnteriores, agreementMap, barbeiroMap, taxaMetodoMap);
    const barbeiros = this.#barbeirosOrdenados(atual.barbeiros, anterior.barbeiros, barbeiroMap, agreementMap);
    const mensalidadesAtual = this.#mensalidadesParceiros(agreements, periodo, barbeiroMap);
    const mensalidadesAnterior = this.#mensalidadesParceiros(agreements, this.#periodoAnterior(periodo), barbeiroMap);
    const despesasAtual = this.#somarDespesas(despesas);
    const despesasAnterior = this.#somarDespesas(despesasAnteriores);
    const receitaLiquidaOwner = atual.shop.plus(mensalidadesAtual.total);
    const receitaLiquidaOwnerAnterior = anterior.shop.plus(mensalidadesAnterior.total);

    const lucroBarbeariaCard = isOwner
      ? {
        ...this.#cardMoney(
          receitaLiquidaOwner.minus(despesasAtual),
          receitaLiquidaOwnerAnterior.minus(despesasAnterior),
        ),
        despesas: despesasAtual.toNumber(),
        limitacaoDespesas: false,
      }
      : this.#cardMoney(atual.shop, anterior.shop);
    const receitaLiquidaCard = isOwner
      ? this.#cardMoney(receitaLiquidaOwner, receitaLiquidaOwnerAnterior)
      : this.#cardMoney(atual.net, anterior.net);
    const online = this.#onlineCount(barbeiroMap, statusEquipe);
    const ativos = online;
    const inativos = Math.max(0, barbeiroMap.size - online);

    let meuLucro = null;
    if (!isOwner && viewerProfessionalId) {
      const meuBarbeiro = atual.barbeiros.get(viewerProfessionalId);
      const meuBarbeiroAnterior = anterior.barbeiros.get(viewerProfessionalId);
      meuLucro = this.#cardMoney(
        meuBarbeiro?.valorBarbeiro || Money.zero(),
        meuBarbeiroAnterior?.valorBarbeiro || Money.zero(),
      );
    }

    return {
      periodo,
      isOwner,
      comparativo: {
        receitaBruta: this.comparativo(atual.gross, anterior.gross),
        receitaLiquida: this.comparativo(
          isOwner ? receitaLiquidaOwner : atual.net,
          isOwner ? receitaLiquidaOwnerAnterior : anterior.net,
        ),
        lucroBarbearia: this.comparativo(
          isOwner ? receitaLiquidaOwner.minus(despesasAtual) : atual.shop,
          isOwner ? receitaLiquidaOwnerAnterior.minus(despesasAnterior) : anterior.shop,
        ),
        cortes: this.comparativo(atual.cortes, anterior.cortes),
      },
      cards: {
        receitaBruta: this.#cardMoney(atual.gross, anterior.gross),
        receitaLiquida: receitaLiquidaCard,
        lucroBarbearia: lucroBarbeariaCard,
        meuLucro,
        totalCortes: this.#cardNumber(atual.cortes, anterior.cortes),
        totalBarbeiros: {
          total: barbeiroMap.size,
          ativos,
          online,
          inativos,
        },
        mensalistas: isOwner
          ? { total: mensalidadesAtual.total.toNumber(), count: mensalidadesAtual.count }
          : (mensalistas ?? { total: 0, count: 0 }),
      },
      metodosPagamento: [...atual.metodos.values()]
        .filter(m => m.metodo !== 'outros')
        .sort((a, b) => b.receitaLiquida - a.receitaLiquida),
      barbeiros,
      series: this.#series(transacoes, agreementMap, barbeiroMap, taxaMetodoMap),
      donut: [
        { label: 'Barbearia', value: atual.shop.toNumber(), color: '#0f766e' },
        { label: 'Barbeiros', value: atual.barbers.toNumber(), color: '#2563eb' },
        { label: 'Taxas', value: atual.fees.toNumber(), color: '#f97316' },
      ],
      statusEquipe: {
        total: barbeiroMap.size,
        online,
        ativos,
        inativos,
      },
    };
  }

  comparativo(atual, anterior) {
    const atualNumero = atual instanceof Money ? atual.toNumber() : Number(atual || 0);
    const anteriorNumero = anterior instanceof Money ? anterior.toNumber() : Number(anterior || 0);
    if (anteriorNumero === 0 && atualNumero === 0) return 0;
    if (anteriorNumero === 0) return 100;
    return Number((((atualNumero - anteriorNumero) / anteriorNumero) * 100).toFixed(1));
  }

  #agregar(transacoes, agreementMap, barbeiroMap, taxaMetodoMap) {
    const total = {
      gross: Money.zero(),
      net: Money.zero(),
      fees: Money.zero(),
      shop: Money.zero(),
      barbers: Money.zero(),
      cortes: 0,
      metodos: new Map(),
      barbeiros: new Map(),
    };

    for (const tx of transacoes) {
      const professionalId = tx.professional_id || 'sem-profissional';
      const profissional = barbeiroMap.get(professionalId);
      const agreement = this.#agreementFor(professionalId, agreementMap, profissional);
      const financial = this.#transacaoFinanceira(tx, taxaMetodoMap);
      const { gross, net, fees } = financial;
      const split = this.#splitTransaction(net, agreement, profissional);

      total.gross = total.gross.plus(gross);
      total.net = total.net.plus(net);
      total.fees = total.fees.plus(fees);
      total.shop = total.shop.plus(split.shopTotal);
      total.barbers = total.barbers.plus(split.barberTotal);
      total.cortes += 1;

      this.#somarMetodo(total.metodos, tx.payment_method, financial);
      this.#somarBarbeiro(total.barbeiros, professionalId, profissional, agreement, financial, split);
    }

    return total;
  }

  #somarMetodo(metodos, metodo, financial) {
    const key = this.#normalizarMetodoPagamento(metodo);
    const { gross, net, fees, feePercent } = financial;
    const atual = metodos.get(key) || {
      metodo: key,
      label: this.#labelMetodo(key),
      cortes: 0,
      receitaBruta: 0,
      receitaLiquida: 0,
      taxas: 0,
      feePercent,
    };
    atual.cortes += 1;
    atual.feePercent = feePercent;
    atual.receitaBruta = Money.from(atual.receitaBruta).plus(gross).toNumber();
    atual.receitaLiquida = Money.from(atual.receitaLiquida).plus(net).toNumber();
    atual.taxas = Money.from(atual.taxas).plus(fees).toNumber();
    metodos.set(key, atual);
  }

  #somarBarbeiro(map, professionalId, profissional, agreement, financial, split) {
    const atual = map.get(professionalId) || {
      professionalId,
      nome: profissional?.nome || 'Profissional',
      avatarUrl: profissional?.avatarUrl || '',
      status: profissional?.status || 'offline',
      ativo: profissional?.ativo !== false,
      cortes: 0,
      receitaBruta: Money.zero(),
      taxas: Money.zero(),
      receitaLiquida: Money.zero(),
      porcentagemBarbearia: agreement.shopPercent,
      porcentagemBarbeiro: agreement.barberPercent,
      valorBarbeiro: Money.zero(),
      valorBarbearia: Money.zero(),
      agreementConfigured: agreement.configured,
    };

    atual.cortes += 1;
    atual.receitaBruta = atual.receitaBruta.plus(financial.gross);
    atual.taxas = atual.taxas.plus(financial.fees);
    atual.receitaLiquida = atual.receitaLiquida.plus(financial.net);
    atual.valorBarbeiro = atual.valorBarbeiro.plus(split.barberDisplay);
    atual.valorBarbearia = atual.valorBarbearia.plus(split.shopDisplay);
    map.set(professionalId, atual);
  }

  #barbeirosOrdenados(atualMap, anteriorMap, barbeiroMap, agreementMap) {
    const ids = new Set([...barbeiroMap.keys(), ...atualMap.keys()]);
    return [...ids].map(id => {
      const atual = atualMap.get(id);
      const base = barbeiroMap.get(id) || {};
      const agreement = this.#agreementFor(id, agreementMap, base);
      const anterior = anteriorMap.get(id);
      return {
        professionalId: id,
        nome: atual?.nome || base.nome || 'Profissional',
        avatarUrl: atual?.avatarUrl || base.avatarUrl || '',
        status: atual?.status || base.status || 'offline',
        ativo: atual?.ativo ?? base.ativo ?? true,
        cortes: atual?.cortes || 0,
        receitaBruta: (atual?.receitaBruta || Money.zero()).toNumber(),
        taxas: (atual?.taxas || Money.zero()).toNumber(),
        receitaLiquida: (atual?.receitaLiquida || Money.zero()).toNumber(),
        porcentagemBarbearia: atual?.porcentagemBarbearia ?? agreement.shopPercent,
        porcentagemBarbeiro: atual?.porcentagemBarbeiro ?? agreement.barberPercent,
        valorBarbeiro: (atual?.valorBarbeiro || Money.zero()).toNumber(),
        valorBarbearia: (atual?.valorBarbearia || Money.zero()).toNumber(),
        agreementConfigured: atual?.agreementConfigured ?? agreement.configured,
        crescimentoPct: this.comparativo(atual?.receitaLiquida || Money.zero(), anterior?.receitaLiquida || Money.zero()),
      };
    }).sort((a, b) => b.receitaLiquida - a.receitaLiquida);
  }

  #series(transacoes, agreementMap, barbeiroMap, taxaMetodoMap) {
    const buckets = new Map();
    for (const tx of transacoes) {
      const key = this.#dateOnly(new Date(tx.paid_at || tx.created_at || Date.now()));
      const profissional = barbeiroMap.get(tx.professional_id);
      const agreement = this.#agreementFor(tx.professional_id, agreementMap, profissional);
      const { gross, net } = this.#transacaoFinanceira(tx, taxaMetodoMap);
      const split = this.#splitTransaction(net, agreement, profissional);
      const current = buckets.get(key) || { data: key, receitaBruta: Money.zero(), receitaLiquida: Money.zero(), lucroBarbearia: Money.zero() };
      current.receitaBruta = current.receitaBruta.plus(gross);
      current.receitaLiquida = current.receitaLiquida.plus(net);
      current.lucroBarbearia = current.lucroBarbearia.plus(split.shopTotal);
      buckets.set(key, current);
    }

    return [...buckets.values()]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(item => ({
        data: item.data,
        receitaBruta: item.receitaBruta.toNumber(),
        receitaLiquida: item.receitaLiquida.toNumber(),
        lucroBarbearia: item.lucroBarbearia.toNumber(),
      }));
  }

  #agreementMap(agreements, barbeiroMap) {
    const map = new Map();
    for (const agreement of agreements) {
      if (String(agreement.type || 'percentage').toLowerCase() !== 'percentage') continue;
      if (!agreement.professional_id) continue;
      if (map.has(agreement.professional_id)) continue;
      const profissional = barbeiroMap.get(agreement.professional_id);
      if (profissional?.papel === 'owner') {
        map.set(agreement.professional_id, {
          barberPercent: 100,
          shopPercent: 100,
          configured: true,
          owner: true,
        });
        continue;
      }
      const barberPercent = Math.min(100, Math.max(0, Number(agreement.value || 0)));
      map.set(agreement.professional_id, {
        barberPercent,
        shopPercent: Math.max(0, 100 - barberPercent),
        configured: true,
        owner: false,
      });
    }
    return map;
  }

  #agreementFor(professionalId, agreementMap, profissional) {
    if (profissional?.papel === 'owner') {
      return {
        barberPercent: 100,
        shopPercent: 100,
        configured: true,
        owner: true,
      };
    }
    return agreementMap.get(professionalId) || {
      barberPercent: 0,
      shopPercent: 0,
      configured: false,
      owner: false,
    };
  }

  #splitTransaction(net, agreement, profissional) {
    if (agreement.owner === true || profissional?.papel === 'owner') {
      return {
        shopTotal: net,
        barberTotal: Money.zero(),
        barberDisplay: net,
        shopDisplay: net,
        cardTaxas: Money.zero(),
      };
    }

    if (agreement.configured !== true) {
      return {
        shopTotal: Money.zero(),
        barberTotal: Money.zero(),
        barberDisplay: Money.zero(),
        shopDisplay: Money.zero(),
        cardTaxas: Money.zero(),
      };
    }

    const barber = net.timesPercent(agreement.barberPercent);
    const shop = net.minus(barber);
    return {
      shopTotal: shop,
      barberTotal: barber,
      barberDisplay: barber,
      shopDisplay: shop,
      cardTaxas: shop,
    };
  }

  #mensalidadesParceiros(agreements, periodo, barbeiroMap) {
    const total = { total: Money.zero(), count: 0 };
    for (const agreement of agreements || []) {
      if (!this.#ehProfissionalMensalista(agreement, barbeiroMap)) continue;
      if (!this.#ehMensalidadeParceiro(agreement)) continue;
      const valor = this.#valorMensalProporcional(agreement, periodo);
      if (valor.cents <= 0) continue;
      total.total = total.total.plus(valor);
      total.count += 1;
    }
    return total;
  }

  #ehProfissionalMensalista(agreement, barbeiroMap) {
    if (!agreement?.professional_id) return false;
    const profissional = barbeiroMap.get(agreement.professional_id);
    if (!profissional || profissional.ativo === false) return false;
    if (profissional.papel === 'owner') return false;
    return profissional.vinculado !== false;
  }

  #ehMensalidadeParceiro(agreement) {
    const type = String(agreement?.type || '').toLowerCase();
    if (type === 'rent' || type === 'chair_rental') return true;
    if (type !== 'fixed') return false;
    const contexto = [
      agreement.notes,
      agreement.message,
      agreement.description,
      agreement.metadata?.kind,
      agreement.metadata?.type,
    ].filter(Boolean).join(' ').toLowerCase();
    return contexto.includes('aluguel de cadeira')
      || contexto.includes('cadeira')
      || contexto.includes('mensalidade');
  }

  #valorMensalProporcional(agreement, periodo) {
    const mensal = Money.from(agreement?.value || 0);
    if (mensal.cents <= 0 || !periodo?.inicio || !periodo?.fim) return Money.zero();

    let inicio = this.#inicioDia(periodo.inicio);
    let fim = this.#inicioDia(periodo.fim);
    const validFrom = this.#dateOrNull(agreement.valid_from);
    const validUntil = this.#dateOrNull(agreement.valid_until);
    if (validFrom && validFrom > inicio) inicio = validFrom;
    if (validUntil && validUntil < fim) fim = validUntil;
    if (inicio > fim) return Money.zero();

    let cents = 0;
    let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    while (cursor <= fim) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const segmentoInicio = inicio > monthStart ? inicio : monthStart;
      const segmentoFim = fim < monthEnd ? fim : monthEnd;
      if (segmentoInicio <= segmentoFim) {
        const diasMes = monthEnd.getDate();
        const diasCobertos = this.#diasEntre(segmentoInicio, segmentoFim);
        cents += Math.round((mensal.cents * diasCobertos) / diasMes);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return Money.fromCents(cents);
  }

  #somarDespesas(despesas) {
    return (despesas || []).reduce((total, despesa) => (
      total.plus(despesa?.amount ?? despesa?.gross_amount ?? 0)
    ), Money.zero());
  }

  #periodoAnterior(periodo) {
    if (!periodo?.inicioAnterior || !periodo?.fimAnterior) return periodo;
    return { ...periodo, inicio: periodo.inicioAnterior, fim: periodo.fimAnterior };
  }

  #onlineCount(barbeiroMap, statusEquipe) {
    const onlineIds = Array.isArray(statusEquipe?.onlineIds) ? statusEquipe.onlineIds : [];
    if (onlineIds.length > 0) {
      const idsValidos = new Set();
      for (const id of onlineIds) {
        const barbeiro = barbeiroMap.get(id);
        if (barbeiro && barbeiro.ativo !== false) idsValidos.add(id);
      }
      return idsValidos.size;
    }
    return Math.min(barbeiroMap.size, Math.max(0, Number(statusEquipe?.online ?? 0)));
  }

  #barbeiroMap(profissionais, statusEquipe) {
    const onlineIds = new Set(statusEquipe.onlineIds || []);
    const map = new Map();
    for (const profissional of profissionais) {
      const id = profissional.professionalId || profissional.professional_id || profissional.id;
      if (!id) continue;
      map.set(id, {
        nome: profissional.nome || profissional.full_name || profissional.name || 'Profissional',
        avatarUrl: profissional.avatarUrl || profissional.avatar_url || '',
        ativo: profissional.ativo !== false && profissional.is_active !== false,
        papel: profissional.papel || profissional.role || 'professional',
        vinculado: profissional.vinculado !== false,
        status: onlineIds.has(id) ? 'online' : (profissional.status || 'offline'),
      });
    }
    return map;
  }

  #cardMoney(atual, anterior) {
    return {
      total: atual.toNumber(),
      anterior: anterior.toNumber(),
      variacaoPct: this.comparativo(atual, anterior),
    };
  }

  #cardNumber(atual, anterior) {
    return {
      total: atual,
      anterior,
      variacaoPct: this.comparativo(atual, anterior),
    };
  }

  #dateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  #inicioDia(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  #dateOrNull(value) {
    if (!value) return null;
    const date = this.#inicioDia(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  #diasEntre(inicio, fim) {
    return Math.floor((fim.getTime() - inicio.getTime()) / DAY_MS) + 1;
  }

  #labelMetodo(metodo) {
    const labels = {
      credit: 'Credito',
      debit: 'Debito',
      pix: 'Pix',
      dinheiro: 'Dinheiro',
    };
    return labels[metodo] || 'Outros';
  }

  #transacaoFinanceira(tx, taxaMetodoMap) {
    const gross = Money.from(tx?.gross_amount ?? tx?.amount);
    const metodo = this.#normalizarMetodoPagamento(tx?.payment_method);
    const feePercent = metodo === 'credit' || metodo === 'debit'
      ? Number(taxaMetodoMap.get(metodo) || 0)
      : 0;
    const fees = gross.timesPercent(feePercent).maxZero();
    const net = gross.minus(fees).maxZero();
    return { gross, fees, net, feePercent };
  }

  #taxaMetodoMap(taxasMetodoPagamento) {
    const map = new Map();
    for (const taxa of taxasMetodoPagamento || []) {
      const metodo = this.#normalizarMetodoPagamento(taxa?.payment_method);
      if (metodo !== 'credit' && metodo !== 'debit') continue;
      const pct = Math.min(30, Math.max(0, Number(taxa?.fee_percent || 0)));
      map.set(metodo, pct);
    }
    return map;
  }

  #normalizarMetodoPagamento(metodo) {
    const raw = String(metodo || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const aliases = {
      dinheiro: 'dinheiro',
      cash: 'dinheiro',
      money: 'dinheiro',
      pix: 'pix',
      debito: 'debit',
      debit: 'debit',
      debit_card: 'debit',
      credito: 'credit',
      credit: 'credit',
      credit_card: 'credit',
    };
    return aliases[raw] || 'outros';
  }
}

module.exports = FinanceiroCalculator;
