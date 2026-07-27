'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { carregar, fn, ROOT } = require('./_helpers.js');

const BARBER_ID = '11111111-1111-4111-8111-111111111111';

function criarElemento() {
  return {
    hidden: false,
    textContent: '',
    dataset: {},
    title: '',
    disabled: false,
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    querySelector() {
      return null;
    },
    setAttribute() {},
    removeAttribute() {},
  };
}

function criarCenario() {
  let resolverPerfil;
  let resolverTimeout;
  const perfilPendente = new Promise(resolve => {
    resolverPerfil = resolve;
  });

  const elementos = {
    '#beiro-skeleton': criarElemento(),
    '#beiro-conteudo': criarElemento(),
    '#beiro-avatar-wrap': criarElemento(),
    '#beiro-nome': criarElemento(),
    '#beiro-badge': criarElemento(),
    '#beiro-rating': criarElemento(),
    '#beiro-bio': criarElemento(),
  };
  const tela = {
    querySelector: selector => elementos[selector] ?? null,
  };
  const cache = new Map();
  const navegar = fn();

  const sandbox = vm.createContext({
    console,
    Promise,
    InputValidator: {
      uuid: value => ({ ok: value === BARBER_ID }),
    },
    CacheManager: {
      get: key => cache.get(key) ?? null,
      set: (key, value) => cache.set(key, value),
    },
    BffApiService: {
      profissionais: {
        perfilPublico: () => perfilPendente,
      },
    },
    BarbershopRepository: {
      getBarberById: fn(),
      getWorkplaceByProfessionalId: fn(),
    },
    NavigationManager: {
      navigate: callback => callback(),
    },
    App: {
      nav: navegar,
    },
    document: {
      getElementById: id => id === 'tela-barbeiro' ? tela : null,
      addEventListener() {},
    },
    setTimeout: callback => {
      resolverTimeout = callback;
      return 1;
    },
  });

  carregar(sandbox, 'shared/js/BarbeiroPage.js');
  const page = new sandbox.BarbeiroPage();
  page.bind();

  return {
    page,
    elementos,
    navegar,
    resolverPerfil,
    dispararTimeout: () => resolverTimeout(),
    cache,
  };
}

describe('BarbeiroPage - primeira abertura', () => {
  it('busca perfil e portfolio publicos sem aguardar restauracao da sessao', () => {
    const source = fs.readFileSync(path.join(ROOT, 'shared/js/BffApiService.js'), 'utf8');
    const profissionais = source.slice(
      source.indexOf('static profissionais = {'),
      source.indexOf('static auth = {'),
    );
    const perfilPublico = profissionais.slice(
      profissionais.indexOf('perfilPublico:'),
      profissionais.indexOf('atualizarMeuPerfilPublico:'),
    );
    const portfolioPublico = profissionais.slice(
      profissionais.indexOf('portfolio:'),
      profissionais.indexOf('atualizarPortfolioImagem:'),
    );

    assert.match(perfilPublico, /BffApiService\.getPublic\(/);
    assert.match(portfolioPublico, /BffApiService\.getPublic\(/);
  });

  it('deve renderizar o perfil quando a resposta chega depois do limite do skeleton', async () => {
    const cenario = criarCenario();
    const abertura = cenario.page.abrirPorId(BARBER_ID);

    cenario.dispararTimeout();
    await abertura;

    assert.deepEqual(cenario.navegar.calls, [['barbeiro']]);
    assert.equal(cenario.elementos['#beiro-skeleton'].hidden, false);
    assert.equal(cenario.elementos['#beiro-conteudo'].hidden, true);

    cenario.resolverPerfil({
      data: {
        id: BARBER_ID,
        fullName: 'Barbeiro Teste',
        ratingCount: 0,
        barbershop: { id: '22222222-2222-4222-8222-222222222222' },
      },
      error: null,
    });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(cenario.elementos['#beiro-nome'].textContent, 'Barbeiro Teste');
    assert.equal(cenario.elementos['#beiro-skeleton'].hidden, true);
    assert.equal(cenario.elementos['#beiro-conteudo'].hidden, false);
    assert.equal(cenario.cache.has(`${BARBER_ID}:barbeiro`), true);
  });
});
