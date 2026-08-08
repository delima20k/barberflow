'use strict';

// ─────────────────────────────────────────────────────────────────
// Validação por EXECUÇÃO (não leitura de código) de que
// PortfolioController (secao "Portfolio da Barbearia" em Minha
// Barbearia) reage de verdade a eventos de Realtime do Supabase em
// portfolio_images — INSERT, UPDATE e DELETE — refazendo o load da
// lista sem qualquer timer/reload manual.
//
// Como nao ha um servidor Supabase Realtime real disponivel neste
// ambiente (sem Docker/Supabase CLI/credenciais), o unico ponto
// mockado é a fronteira SupabaseService.channel()/.on()/.subscribe()
// — a MESMA fronteira que o proprio app usa para falar com a rede.
// Tudo dentro dela (PortfolioController de verdade, carregado via VM,
// nao apenas seu texto-fonte) executa como no app real.
// ─────────────────────────────────────────────────────────────────

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar } = require('./_helpers.js');

function criarCanalFalso(registro) {
  const canal = {
    on(event, filtro, callback) {
      registro.push({ event, filtro, callback });
      return canal;
    },
    subscribe() { return canal; },
  };
  return canal;
}

function montarSandbox({ portfolioApi }) {
  const canaisAbertos = [];
  const canaisRemovidos = [];
  const registrosOn = [];

  const sandbox = vm.createContext({
    BffApiService: {
      barbearias: { portfolio: portfolioApi },
      profissionais: { uploadPortfolioImagem: async () => ({ data: {}, error: null }) },
    },
    SectionEventCatalog: { PORTFOLIO_CHANGED: 'portfolio-changed' },
    SupabaseService: {
      channel(nome) {
        const canal = criarCanalFalso(registrosOn);
        canaisAbertos.push({ nome, canal });
        return canal;
      },
      removeChannel(canal) { canaisRemovidos.push(canal); },
    },
  });
  carregar(sandbox, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/PortfolioSection/PortfolioController.js');
  return { PortfolioController: sandbox.PortfolioController, canaisAbertos, canaisRemovidos, registrosOn };
}

function criarStateView(barbershopId) {
  let snapshot = { barbershopId, items: [], loading: false, uploading: false, error: null, canUpload: true };
  const state = {
    get snapshot() { return snapshot; },
    merge(partial) { snapshot = { ...snapshot, ...partial }; },
  };
  const chamadasRender = [];
  const view = { render: (s) => chamadasRender.push(s) };
  return { state, view, chamadasRender };
}

describe('PortfolioController — Realtime (execução real, não regex de fonte)', () => {

  it('init() assina postgres_changes em portfolio_images (event: *, sem filtro de owner — agrega equipe)', () => {
    let chamadas = 0;
    const portfolioApi = async () => { chamadas += 1; return { data: { items: [] }, error: null }; };
    const { PortfolioController, canaisAbertos, registrosOn } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView('shop-1');

    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });

    assert.equal(canaisAbertos.length, 1, 'deve abrir exatamente 1 canal Supabase Realtime');
    assert.equal(registrosOn.length, 1, 'deve registrar 1 handler via .on()');
    assert.equal(registrosOn[0].event, 'postgres_changes');
    assert.equal(registrosOn[0].filtro.table, 'portfolio_images');
    assert.equal(registrosOn[0].filtro.event, '*', 'precisa cobrir INSERT, UPDATE e DELETE, não só INSERT');
  });

  it('INSERT simulado dispara refetch real (2ª publicação aparece sem reload)', async () => {
    let chamadas = 0;
    const portfolioApi = async () => {
      chamadas += 1;
      // 1ª chamada (load inicial): 1 item. 2ª chamada (apos o evento Realtime): 2 itens.
      return { data: { items: chamadas === 1 ? [{ id: 'foto-1' }] : [{ id: 'foto-1' }, { id: 'foto-2' }] }, error: null };
    };
    const { PortfolioController, registrosOn } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView(null);

    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });
    ctrl.update({ barbershopId: 'shop-1' }); // mesmo gatilho que MinhaBarbeariaRuntimeController usa ao resolver a barbearia
    await new Promise(r => setTimeout(r, 0)); // deixa o #load() inicial (fire-and-forget) resolver

    assert.equal(chamadas, 1, 'load inicial deve ter buscado 1x antes de qualquer evento');
    assert.equal(state.snapshot.items.length, 1);

    // Simula o Supabase entregando um INSERT real (mesmo shape de payload.eventType/new/old)
    const handler = registrosOn[0].callback;
    handler({ eventType: 'INSERT', new: { id: 'foto-2', owner_id: 'outro-profissional' }, old: {} });
    await new Promise(r => setTimeout(r, 0));

    assert.equal(chamadas, 2, 'evento INSERT deve ter disparado um novo fetch de verdade');
    assert.equal(state.snapshot.items.length, 2, 'a 2ª foto deve aparecer no estado sem reload/timer');
  });

  it('UPDATE simulado também dispara refetch (ex.: legenda/likes atualizados em outra aba)', async () => {
    let chamadas = 0;
    const portfolioApi = async () => { chamadas += 1; return { data: { items: [{ id: 'foto-1', likesCount: chamadas }] }, error: null }; };
    const { PortfolioController, registrosOn } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView(null);
    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });
    ctrl.update({ barbershopId: 'shop-1' });
    await new Promise(r => setTimeout(r, 0));

    registrosOn[0].callback({ eventType: 'UPDATE', new: { id: 'foto-1' }, old: { id: 'foto-1' } });
    await new Promise(r => setTimeout(r, 0));

    assert.equal(chamadas, 2);
    assert.equal(state.snapshot.items[0].likesCount, 2, 'estado deve refletir o dado fresco pós-UPDATE');
  });

  it('DELETE simulado remove a foto da lista via refetch (exclusão feita em outra tela)', async () => {
    let chamadas = 0;
    const portfolioApi = async () => {
      chamadas += 1;
      return { data: { items: chamadas === 1 ? [{ id: 'foto-1' }, { id: 'foto-2' }] : [{ id: 'foto-1' }] }, error: null };
    };
    const { PortfolioController, registrosOn } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView(null);
    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });
    ctrl.update({ barbershopId: 'shop-1' });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(state.snapshot.items.length, 2);

    registrosOn[0].callback({ eventType: 'DELETE', new: {}, old: { id: 'foto-2' } });
    await new Promise(r => setTimeout(r, 0));

    assert.equal(chamadas, 2);
    assert.equal(state.snapshot.items.length, 1, 'foto excluída em outra tela deve sumir sem reload');
    assert.equal(state.snapshot.items[0].id, 'foto-1');
  });

  it('destroy() remove o canal — não fica escutando após a seção sair de tela (evita leak)', () => {
    const portfolioApi = async () => ({ data: { items: [] }, error: null });
    const { PortfolioController, canaisAbertos, canaisRemovidos } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView('shop-1');
    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });
    ctrl.destroy();

    assert.equal(canaisRemovidos.length, 1, 'destroy() deve chamar SupabaseService.removeChannel()');
    assert.equal(canaisRemovidos[0], canaisAbertos[0].canal);
  });

  it('sem barbershopId carregado, evento Realtime não gera fetch (guard de #load existente é respeitado)', async () => {
    let chamadas = 0;
    const portfolioApi = async () => { chamadas += 1; return { data: { items: [] }, error: null }; };
    const { PortfolioController, registrosOn } = montarSandbox({ portfolioApi });
    const { state, view } = criarStateView(null); // seção ainda sem barbearia carregada
    const ctrl = new PortfolioController({ state, view });
    ctrl.init({ emit: () => {} });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(chamadas, 0);

    registrosOn[0].callback({ eventType: 'INSERT', new: { id: 'x' }, old: {} });
    await new Promise(r => setTimeout(r, 0));

    assert.equal(chamadas, 0, '#load() já tem guard para barbershopId ausente — não deve chamar a API');
  });
});
