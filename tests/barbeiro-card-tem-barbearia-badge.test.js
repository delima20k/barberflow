'use strict';

// ─────────────────────────────────────────────────────────────────
// Padronização visual dos cards de barbeiro: valida por EXECUÇÃO
// (não leitura de fonte) que o badge "🏪 Tem Barbearia" — antes só
// presente em BarbeirosPage/SearchWidget — agora também aparece no
// carrossel da Home (NearbyBarbershopsWidget.initHomeBarbeiros) e em
// Favoritos (FavoritesPage#criarBarbeiroRow), usando a MESMA fonte
// de verdade (pro_type === 'barbearia') e o MESMO texto/classe da
// implementação de referência — sem inventar uma segunda regra.
// ─────────────────────────────────────────────────────────────────

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { carregar, fn } = require('./_helpers.js');

/** createElement que registra TODO elemento criado, pra inspecionar a árvore depois. */
function criarDocumentoRastreavel(containerId, containerEl) {
  const criados = [];
  const documento = {
    getElementById: fn((id) => (id === containerId ? containerEl : null)),
    createElement: fn((tag) => {
      const el = {
        tag,
        className: '',
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
        loading: '',
        alt: '',
        src: '',
        filhos: [],
        appendChild: fn(function (child) { el.filhos.push(child); return child; }),
        querySelectorAll: fn(() => []),
        querySelector: fn(() => null),
      };
      criados.push(el);
      return el;
    }),
  };
  return { documento, criados };
}

/** Acha o primeiro descendente (BFS na árvore de .filhos) com a className dada. */
function acharPorClasse(el, className) {
  const fila = [...el.filhos];
  while (fila.length) {
    const atual = fila.shift();
    if (atual.className === className) return atual;
    fila.push(...(atual.filhos ?? []));
  }
  return null;
}

describe('Badge "Tem Barbearia" — Home carousel (NearbyBarbershopsWidget.initHomeBarbeiros)', () => {
  function montarSandbox(getBarbersImpl) {
    const containerEl = { innerHTML: '', style: {}, dataset: {}, appendChild: fn() };
    const { documento, criados } = criarDocumentoRastreavel('home-barbeiros-lista', containerEl);

    const sandbox = vm.createContext({
      console,
      document: documento,
      BarbershopRepository: { getBarbers: getBarbersImpl },
      ProfileRepository: { getProfessionalLikeCountsDirect: fn().mockResolvedValue({}) },
      SupabaseService: { resolveAvatarUrl: fn(() => '') },
      ProfessionalService: {
        estrelasPorCurtidas: fn(() => 4),
        carregarInteracoes: fn().mockResolvedValue(undefined),
        criarBotaoLike: fn(() => ({ className: 'like-btn', filhos: [], appendChild: fn() })),
        criarBotaoFavorito: fn(() => ({ className: 'fav-btn', filhos: [], appendChild: fn() })),
      },
      BarbershopService: { criarEstrelasHTML: fn(() => '') },
      LoggerService: { warn: fn(), error: fn(), info: fn() },
    });

    carregar(sandbox, 'shared/js/NearbyBarbershopsWidget.js');
    return { sandbox, criados };
  }

  it('profissional com pro_type=barbearia recebe o badge no carrossel da Home', async () => {
    const { sandbox, criados } = montarSandbox(fn().mockResolvedValue([
      { id: 'p1', full_name: 'Alan', pro_type: 'barbearia', rating_count: 3 },
    ]));

    await sandbox.NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista');

    const row = criados.find(el => el.className === 'barber-row barber-card');
    assert.ok(row, 'deve criar o card do barbeiro');
    const badge = acharPorClasse(row, 'barber-owner-badge');
    assert.ok(badge, 'card de pro_type=barbearia deve ter o badge no carrossel da Home');
    assert.equal(badge.textContent, '🏪 Tem Barbearia', 'mesmo texto usado em BarbeirosPage/SearchWidget');
  });

  it('profissional com pro_type=barbeiro (autônomo) NÃO recebe o badge — sem informação falsa', async () => {
    const { sandbox, criados } = montarSandbox(fn().mockResolvedValue([
      { id: 'p2', full_name: 'Lima', pro_type: 'barbeiro', rating_count: 1 },
    ]));

    await sandbox.NearbyBarbershopsWidget.initHomeBarbeiros('home-barbeiros-lista');

    const row = criados.find(el => el.className === 'barber-row barber-card');
    assert.ok(row);
    assert.equal(acharPorClasse(row, 'barber-owner-badge'), null, 'barbeiro autônomo não deve mostrar "Tem Barbearia"');
  });
});

describe('Badge "Tem Barbearia" — Favoritos (FavoritesPage#criarBarbeiroRow)', () => {
  // #criarBarbeiroRow é um método privado de verdade (JS #private, não apenas
  // convenção) — inacessível por reflexão/instância de fora da classe. Exercitar
  // via fluxo público exigiria mockar AppState + SupabaseService.getUser +
  // ProfileRepository + MutationObserver por inteiro só pra chegar num método
  // que não depende de nenhum desses globals. Validação por padrão de fonte,
  // mesmo critério já usado neste repo pra métodos privados (ver
  // tests/barbeariapage-fila.test.js) — garante que o bloco condicional exato
  // existe no método certo, na ordem certa em relação ao nome.
  const fs = require('node:fs');
  const path = require('node:path');
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'apps/cliente/assets/js/pages/FavoritesPage.js'), 'utf8',
  );

  it('#criarBarbeiroRow contém o badge condicionado a profiles.pro_type === "barbearia"', () => {
    // '#criarBarbeiroRow(p) {' (com chave) é a DEFINIÇÃO — 'this.#criarBarbeiroRow(p))'
    // (chamada no #renderBarbeiros) aparece antes no arquivo e não deve ser confundida.
    const inicio = SRC.indexOf('#criarBarbeiroRow(p) {');
    assert.ok(inicio > 0, '#criarBarbeiroRow deve existir');
    const corpo = SRC.slice(inicio, inicio + 2500); // cobre o método inteiro (~60 linhas)

    assert.match(corpo, /p\.profiles\?\.pro_type === 'barbearia'/,
      'mesma fonte de verdade usada em BarbeirosPage/SearchWidget/NearbyBarbershopsWidget');
    assert.match(corpo, /className\s*=\s*'barber-owner-badge'/);
    assert.match(corpo, /textContent\s*=\s*'🏪 Tem Barbearia'/, 'mesmo texto/emoji da referência, sem inventar rótulo novo');

    // A badge precisa ser inserida ANTES do nome sair de #criarBarbeiroRow (ordem
    // nome -> badge -> estrelas, igual à referência de BarbeirosPage).
    const idxNome = corpo.indexOf("info.appendChild(nomeEl)");
    const idxBadge = corpo.indexOf("barber-owner-badge");
    // className = '...' (não o texto solto) — evita casar com o comentário
    // "// Info: nome + top-card__stars" que aparece antes do código de verdade.
    const idxStars = corpo.indexOf("className = 'top-card__stars'");
    assert.ok(idxNome > 0 && idxNome < idxBadge && idxBadge < idxStars,
      'ordem nome -> badge -> estrelas deve ser preservada');
  });

  it('query de dados agora seleciona pro_type (sem isso o badge nunca apareceria em Favoritos)', () => {
    const repoSrc = fs.readFileSync(
      path.join(__dirname, '..', 'shared/js/ProfileRepository.js'), 'utf8',
    );
    const inicio = repoSrc.indexOf('getFavoriteBarbers');
    const corpo = repoSrc.slice(inicio, inicio + 1500);
    assert.match(corpo, /profiles_public['"][\s\S]*?\.select\(['"][^'"]*pro_type/,
      'select() de profiles_public deve incluir pro_type');
  });
});

describe('Fundo escuro do card — escopado a barbeiro, sem vazar pra card de barbearia', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const CSS = fs.readFileSync(path.join(__dirname, '..', 'shared/css/barber-card.css'), 'utf8');

  it('regra de fundo escuro exige [data-professional-id] (nunca aplica a card de barbearia)', () => {
    assert.match(
      CSS,
      /\.barber-card\[data-professional-id\],\s*\n\.barber-row\[data-professional-id\]\s*\{\s*\n\s*background:\s*linear-gradient/,
      'seletor precisa do atributo [data-professional-id] pra não atingir .barber-row de barbearia (que usa [data-barbershop-id])',
    );
  });

  it('regra clara original (barbearia e demais usos de .barber-card) continua intacta, sem atributo', () => {
    assert.match(
      CSS,
      /\.barber-card,\s*\n\.barber-row\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*rgba\(255,251,246/,
      'card de barbearia deve continuar recebendo o fundo claro original — não foi tocado',
    );
  });

  it('gradiente escuro usa as cores de marca (header-bg/brown/gold), semitransparente de propósito', () => {
    const inicio = CSS.indexOf('.barber-card[data-professional-id]');
    assert.ok(inicio > 0, 'regra deve existir (testes anteriores já confirmam isso)');
    const regra = CSS.slice(inicio, inicio + 400);
    // var() não permite ajustar alpha de um token hex diretamente — por isso os
    // stops usam rgba() com o RGB equivalente de --header-bg/--brown/--gold,
    // não var(). Confirma que são exatamente esses 3 RGBs, com alpha < 1.
    assert.match(regra, /rgba\(43,\s*27,\s*18,\s*\.85\)/, 'primeiro stop deve ser --header-bg (#2B1B12) semitransparente');
    assert.match(regra, /rgba\(92,\s*51,\s*23,\s*\.85\)/, 'stop do meio deve ser --brown (#5C3317) semitransparente');
    // --gold-dark (#6B4A32) NÃO é amarelo/dourado apesar do nome — é marrom.
    // O gradiente precisa terminar em --gold (#D4A017) de verdade, senão vira
    // marrom -> marrom -> marrom (foi exatamente o bug reportado e corrigido).
    assert.match(regra, /rgba\(212,\s*160,\s*23,\s*\.85\)/, 'último stop deve ser --gold (#D4A017) de verdade, não --gold-dark');
  });
});
