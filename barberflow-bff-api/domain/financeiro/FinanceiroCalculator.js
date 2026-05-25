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

  calcularDashboard({ periodo, transacoes = [], transacoesAnteriores = [], agreements = [], profissionais = [], statusEquipe = {} }) {
    const agreementMap = this.#agreementMap(agreements);
    const barbeiroMap = this.#barbeiroMap(profissionais, statusEquipe);
    const atual = this.#agregar(transacoes, agreementMap, barbeiroMap);
    const anterior = this.#agregar(transacoesAnteriores, agreementMap, barbeiroMap);
    const barbeiros = this.#barbeirosOrdenados(atual.barbeiros, anterior.barbeiros, barbeiroMap);

    return {
      periodo,
      comparativo: {
        receitaBruta: this.comparativo(atual.gross, anterior.gross),
        receitaLiquida: this.comparativo(atual.net, anterior.net),
        lucroBarbearia: this.comparativo(atual.shop, anterior.shop),
        cortes: this.comparativo(atual.cortes, anterior.cortes),
      },
      cards: {
        receitaBruta: this.#cardMoney(atual.gross, anterior.gross),
        receitaLiquida: this.#cardMoney(atual.net, anterior.net),
        lucroBarbearia: this.#cardMoney(atual.shop, anterior.shop),
        totalCortes: this.#cardNumber(atual.cortes, anterior.cortes),
        totalBarbeiros: {
          total: barbeiroMap.size,
          ativos: [...barbeiroMap.values()].filter(item => item.ativo).length,
          online: Number(statusEquipe.online ?? 0),
          inativos: [...barbeiroMap.values()].filter(item => !item.ativo).length,
        },
      },
      metodosPagamento: [...atual.metodos.values()].sort((a, b) => b.receitaLiquida - a.receitaLiquida),
      barbeiros,
      series: this.#series(transacoes, agreementMap),
      donut: [
        { label: 'Barbearia', value: atual.shop.toNumber(), color: '#0f766e' },
        { label: 'Barbeiros', value: atual.barbers.toNumber(), color: '#2563eb' },
        { label: 'Taxas', value: atual.fees.toNumber(), color: '#f97316' },
      ],
      statusEquipe: {
        total: barbeiroMap.size,
        online: Number(statusEquipe.online ?? 0),
        ativos: [...barbeiroMap.values()].filter(item => item.ativo).length,
        inativos: [...barbeiroMap.values()].filter(item => !item.ativo).length,
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

  #agregar(transacoes, agreementMap, barbeiroMap) {
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
      const agreement = agreementMap.get(professionalId) || { shopPercent: 0, configured: false };
      const gross = Money.from(tx.gross_amount ?? tx.amount);
      const net = Money.from(tx.amount);
      const fees = gross.minus(net).maxZero();
      const shop = net.timesPercent(agreement.shopPercent);
      const barber = net.minus(shop);

      total.gross = total.gross.plus(gross);
      total.net = total.net.plus(net);
      total.fees = total.fees.plus(fees);
      total.shop = total.shop.plus(shop);
      total.barbers = total.barbers.plus(barber);
      total.cortes += 1;

      this.#somarMetodo(total.metodos, tx.payment_method, gross, net, fees);
      this.#somarBarbeiro(total.barbeiros, professionalId, barbeiroMap.get(professionalId), agreement, gross, net, fees, shop, barber);
    }

    return total;
  }

  #somarMetodo(metodos, metodo, gross, net, fees) {
    const key = metodo || 'outros';
    const atual = metodos.get(key) || {
      metodo: key,
      label: this.#labelMetodo(key),
      cortes: 0,
      receitaBruta: 0,
      receitaLiquida: 0,
      taxas: 0,
    };
    atual.cortes += 1;
    atual.receitaBruta = Money.from(atual.receitaBruta).plus(gross).toNumber();
    atual.receitaLiquida = Money.from(atual.receitaLiquida).plus(net).toNumber();
    atual.taxas = Money.from(atual.taxas).plus(fees).toNumber();
    metodos.set(key, atual);
  }

  #somarBarbeiro(map, professionalId, profissional, agreement, gross, net, fees, shop, barber) {
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
      porcentagemBarbeiro: Math.max(0, 100 - agreement.shopPercent),
      valorBarbeiro: Money.zero(),
      valorBarbearia: Money.zero(),
      agreementConfigured: agreement.configured,
    };

    atual.cortes += 1;
    atual.receitaBruta = atual.receitaBruta.plus(gross);
    atual.taxas = atual.taxas.plus(fees);
    atual.receitaLiquida = atual.receitaLiquida.plus(net);
    atual.valorBarbeiro = atual.valorBarbeiro.plus(barber);
    atual.valorBarbearia = atual.valorBarbearia.plus(shop);
    map.set(professionalId, atual);
  }

  #barbeirosOrdenados(atualMap, anteriorMap, barbeiroMap) {
    const ids = new Set([...barbeiroMap.keys(), ...atualMap.keys()]);
    return [...ids].map(id => {
      const atual = atualMap.get(id);
      const base = barbeiroMap.get(id) || {};
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
        porcentagemBarbearia: atual?.porcentagemBarbearia ?? 0,
        porcentagemBarbeiro: atual?.porcentagemBarbeiro ?? 100,
        valorBarbeiro: (atual?.valorBarbeiro || Money.zero()).toNumber(),
        valorBarbearia: (atual?.valorBarbearia || Money.zero()).toNumber(),
        agreementConfigured: atual?.agreementConfigured ?? false,
        crescimentoPct: this.comparativo(atual?.receitaLiquida || Money.zero(), anterior?.receitaLiquida || Money.zero()),
      };
    }).sort((a, b) => b.receitaLiquida - a.receitaLiquida);
  }

  #series(transacoes, agreementMap) {
    const buckets = new Map();
    for (const tx of transacoes) {
      const key = this.#dateOnly(new Date(tx.paid_at || tx.created_at || Date.now()));
      const agreement = agreementMap.get(tx.professional_id) || { shopPercent: 0 };
      const gross = Money.from(tx.gross_amount ?? tx.amount);
      const net = Money.from(tx.amount);
      const shop = net.timesPercent(agreement.shopPercent);
      const current = buckets.get(key) || { data: key, receitaBruta: Money.zero(), receitaLiquida: Money.zero(), lucroBarbearia: Money.zero() };
      current.receitaBruta = current.receitaBruta.plus(gross);
      current.receitaLiquida = current.receitaLiquida.plus(net);
      current.lucroBarbearia = current.lucroBarbearia.plus(shop);
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

  #agreementMap(agreements) {
    const map = new Map();
    for (const agreement of agreements) {
      const value = Math.min(100, Math.max(0, Number(agreement.value || 0)));
      if (!agreement.professional_id) continue;
      map.set(agreement.professional_id, { shopPercent: value, configured: true });
    }
    return map;
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

  #labelMetodo(metodo) {
    const labels = {
      credit: 'Credito',
      credito: 'Credito',
      debit: 'Debito',
      debito: 'Debito',
      pix: 'Pix',
      dinheiro: 'Dinheiro',
      cash: 'Dinheiro',
    };
    return labels[metodo] || 'Outros';
  }
}

module.exports = FinanceiroCalculator;
