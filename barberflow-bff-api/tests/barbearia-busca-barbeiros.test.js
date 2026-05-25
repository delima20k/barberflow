'use strict';

/**
 * Testes TDD para BarbeariaRepository.buscarBarbeirosDisponiveis()
 *
 * Falham com a implementação atual (só busca por full_name e exclui pro_type=null).
 * Passam após o fix:
 *   1. Inclui barbeiros com pro_type=null (legacy)
 *   2. Busca por telefone além do nome
 */

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');

const BarbeariaRepository = require('../repositories/BarbeariaRepository');

// ── Constantes ────────────────────────────────────────────────────────────────

const UUID_SHOP  = '550e8400-e29b-41d4-a716-000000000001';
const UUID_OWNER = '550e8400-e29b-41d4-a716-000000000002';

// ── Fábrica de mock rastreador ────────────────────────────────────────────────

/**
 * Cria um mock do cliente Supabase que rastreia todos os métodos chamados
 * e retorna dados configuráveis por tabela.
 *
 * @param {Record<string, object[]>} dadosPorTabela
 * @returns {{ db: object, chamadas: Array }}
 */
function criarMockRastreador(dadosPorTabela = {}) {
  const chamadas = [];

  const db = {
    from: (tabela) => {
      const dados      = dadosPorTabela[tabela] ?? [];
      const shopData   = { id: UUID_SHOP, owner_id: UUID_OWNER, is_active: true };

      // q é thenable: `await q` funciona igual ao PostgrestFilterBuilder do Supabase
      const q = {
        select: (cols) => { chamadas.push(['select', tabela, cols]); return q; },
        eq:     (col, val) => { chamadas.push(['eq', tabela, col, val]); return q; },
        neq:    (col, val) => { chamadas.push(['neq', tabela, col, val]); return q; },
        or:     (filtro) => { chamadas.push(['or', tabela, filtro]); return q; },
        ilike:  (col, pat) => { chamadas.push(['ilike', tabela, col, pat]); return q; },
        not:    (col, op, val) => { chamadas.push(['not', tabela, col, op, val]); return q; },
        order:  () => q,
        limit:  (n) => { chamadas.push(['limit', tabela, n]); return q; },
        single: () => Promise.resolve({
          data:  tabela === 'barbershops' ? shopData : (dados[0] ?? null),
          error: null,
        }),
        // Torna o builder awaitable (resolve com os dados da tabela)
        then: (resolve, reject) => Promise.resolve({ data: dados, error: null }).then(resolve, reject),
      };

      return q;
    },
  };

  return { db, chamadas };
}

// ── Helpers de assert ─────────────────────────────────────────────────────────

function temChamada(chamadas, metodo, tabela, ...args) {
  return chamadas.some(c =>
    c[0] === metodo &&
    c[1] === tabela &&
    args.every((a, i) => c[i + 2] === a),
  );
}

function naoChamou(chamadas, metodo, tabela, ...args) {
  return !temChamada(chamadas, metodo, tabela, ...args);
}

// ── Suítes ────────────────────────────────────────────────────────────────────

suite('BarbeariaRepository.buscarBarbeirosDisponiveis — pro_type legacy (null)', () => {

  test('NÃO usa eq(pro_type, barbeiro) — exigiria que todos tenham pro_type definido', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 20);

    assert.ok(
      naoChamou(chamadas, 'eq', 'profiles', 'pro_type', 'barbeiro'),
      'eq("pro_type","barbeiro") exclui barbeiros legados com pro_type=null',
    );
  });

  test('usa or(pro_type.eq.barbeiro,pro_type.is.null) para incluir barbeiros legados', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 20);

    const orsProfiles = chamadas.filter(c => c[0] === 'or' && c[1] === 'profiles');
    const incluiLegados = orsProfiles.some(c =>
      c[2].includes('pro_type.eq.barbeiro') && c[2].includes('pro_type.is.null'),
    );

    assert.ok(incluiLegados, `Esperava or(...pro_type.eq.barbeiro...pro_type.is.null...) nas chamadas. Encontrado: ${JSON.stringify(orsProfiles)}`);
  });

});

suite('BarbeariaRepository.buscarBarbeirosDisponiveis — busca por telefone', () => {

  test('com busca por dígitos, usa or com phone.ilike no profiles', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '11999887766', 20);

    const orsProfiles = chamadas.filter(c => c[0] === 'or' && c[1] === 'profiles');
    const buscaPhone  = orsProfiles.some(c => c[2].includes('phone.ilike'));

    assert.ok(buscaPhone, `Esperava phone.ilike no or() do profiles. Encontrado: ${JSON.stringify(orsProfiles)}`);
  });

  test('com busca por nome, usa or com full_name.ilike no profiles', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, 'Carlos', 20);

    const orsProfiles = chamadas.filter(c => c[0] === 'or' && c[1] === 'profiles');
    const buscaNome   = orsProfiles.some(c => c[2].includes('full_name.ilike'));

    assert.ok(buscaNome, `Esperava full_name.ilike no or() do profiles. Encontrado: ${JSON.stringify(orsProfiles)}`);
  });

  test('sem busca, NÃO chama ilike nem or de busca em profiles', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 20);

    const ilikesProfiles = chamadas.filter(c => c[0] === 'ilike' && c[1] === 'profiles');
    assert.strictEqual(ilikesProfiles.length, 0, 'não deve chamar ilike sem busca');
  });

  test('não usa eq(pro_type) — confirma que fix não reverteu para o modo antigo', async () => {
    const { db, chamadas } = criarMockRastreador();
    const repo = new BarbeariaRepository(db);

    await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, 'joao', 20);

    assert.ok(
      naoChamou(chamadas, 'eq', 'profiles', 'pro_type', 'barbeiro'),
      'ainda estava usando eq("pro_type","barbeiro") no modo de busca',
    );
  });

});

suite('BarbeariaRepository.buscarBarbeirosDisponiveis — exclusões', () => {

  test('exclui o próprio dono (ownerId) do resultado', async () => {
    const { db } = criarMockRastreador({
      profiles: [
        { id: UUID_OWNER, full_name: 'Dono', phone: null, avatar_path: null, updated_at: null },
        { id: '550e8400-e29b-41d4-a716-000000000099', full_name: 'Outro', phone: null, avatar_path: null, updated_at: null },
      ],
    });
    const repo = new BarbeariaRepository(db);

    const result = await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 20);

    assert.ok(!result.some(p => p.id === UUID_OWNER), 'dono não deve aparecer no resultado');
  });

  test('retorna array vazio quando não há barbeiros', async () => {
    const { db } = criarMockRastreador({ profiles: [] });
    const repo = new BarbeariaRepository(db);

    const result = await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 20);

    assert.ok(Array.isArray(result));
    assert.strictEqual(result.length, 0);
  });

  test('respeita o limit passado', async () => {
    const barbers = Array.from({ length: 30 }, (_, i) => ({
      id:          `550e8400-e29b-41d4-a716-0000000000${String(i + 10).padStart(2, '0')}`,
      full_name:   `Barbeiro ${i}`,
      phone:       null,
      avatar_path: null,
      updated_at:  null,
    }));

    const { db } = criarMockRastreador({ profiles: barbers });
    const repo = new BarbeariaRepository(db);

    const result = await repo.buscarBarbeirosDisponiveis(UUID_SHOP, UUID_OWNER, '', 5);

    assert.ok(result.length <= 5, `esperava no máximo 5 resultados, recebeu ${result.length}`);
  });

});
