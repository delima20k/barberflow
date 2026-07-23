'use strict';

/**
 * tests/barbearia-publica-dono-atividade.test.js
 *
 * Status Ativo/Inativo do DONO na página PÚBLICA da barbearia (app cliente).
 *
 * Comportamento:
 *   - Texto "Ativo/Inativo" acima do avatar do dono (mesmo componente da
 *     Minha Barbearia: BarbeiroAtividadeStatus.criarParagrafo via statusEl)
 *   - Muda em tempo real: canal barbeiro-status (broadcast + postgres_changes)
 *     atualiza o mapa e re-renderiza no instante do clique no toggle do dono
 *   - Dono Inativo: cliente NÃO consegue usar as cadeiras dele (guard com
 *     toast + cadeiras sem affordance visual) até ele reativar
 *   - Default do dono sem linha de presença = ATIVO (mesma régua do MB)
 *   - Rota BFF barbeiros-status é pública (visitante vê o estado correto)
 *
 * Cobre também (proteção de regressão):
 *   - MB: #reRenderEquipe re-fetcha status → texto do card atualiza em
 *     tempo real também na página Minha Barbearia (outros devices)
 *   - BarbeiroCard.criar insere statusEl ACIMA do avatar (unit em VM)
 *   - BarbeiroAtividadeStatus.criarParagrafo estrutura o texto (unit em VM)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { carregar, ROOT } = require('./_helpers.js');

const SRC_PAGE = fs.readFileSync(
  path.join(ROOT, 'shared/js/BarbeariaPage.js'),
  'utf8',
);
const SRC_MB = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
  'utf8',
);
const SRC_CSS = fs.readFileSync(
  path.join(ROOT, 'shared/css/components.css'),
  'utf8',
);
const SRC_ROTAS_BFF = fs.readFileSync(
  path.join(ROOT, 'barberflow-bff-api/routes/barbearias.js'),
  'utf8',
);

// =============================================================================
// Página pública — estado e default do dono
// =============================================================================

describe('BarbeariaPage — presença do dono (estado)', () => {
  test('mantém mapa de presença e canal de atividade como estado da página', () => {
    assert.match(SRC_PAGE, /#atividadeStatus\s*=\s*new Map\(\)/, 'mapa professional_id → presença');
    assert.match(SRC_PAGE, /#canalAtividade\s*=\s*null/, 'canal Realtime de presença');
  });

  test('#donoDisponivel: dono sem linha de presença = ATIVO (mesma régua do MB)', () => {
    const idx = SRC_PAGE.indexOf('#donoDisponivel(professionalId)');
    assert.ok(idx > 0, '#donoDisponivel deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 400);
    assert.match(bloco, /return entry \? entry\.is_available === true : true;/, 'ausência de linha = ativo');
  });

  test('#donoInativo: só bloqueia quando o professionalId É o dono e está indisponível', () => {
    const idx = SRC_PAGE.indexOf('#donoInativo(professionalId)');
    assert.ok(idx > 0, '#donoInativo deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 400);
    assert.match(bloco, /owner_id/, 'compara com o owner_id da barbearia atual');
    assert.match(bloco, /#donoDisponivel\(/, 'reusa a régua de disponibilidade');
  });
});

// =============================================================================
// Página pública — carga inicial + tempo real
// =============================================================================

describe('BarbeariaPage — presença do dono (carga + tempo real)', () => {
  test('#carregarAtividade busca presença via BarbeiroAtividadeStatus (listar + mapa) e re-renderiza', () => {
    const idx = SRC_PAGE.indexOf('async #carregarAtividade(');
    assert.ok(idx > 0, '#carregarAtividade deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 800);
    assert.match(bloco, /BarbeiroAtividadeStatus\.listar\(/, 'fonte única de fetch (DRY)');
    assert.match(bloco, /BarbeiroAtividadeStatus\.mapa\(/, 'normalização única (DRY)');
    assert.match(bloco, /this\.#shopId !== shop\.id/, 'guard de navegação stale durante o await');
    assert.match(bloco, /#agendarRenderBarbeiros\(/, 're-render com debounce existente');
  });

  test('#iniciarRealtimeAtividade assina o canal barbeiro-status e atualiza o mapa sem re-fetch', () => {
    const idx = SRC_PAGE.indexOf('#iniciarRealtimeAtividade(shop) {');
    assert.ok(idx > 0, '#iniciarRealtimeAtividade deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 1200);
    assert.match(bloco, /BarbeiroAtividadeStatus\.assinar\(/, 'mesmo canal do toggle (broadcast chega no instante do clique)');
    assert.match(bloco, /#atividadeStatus\./, 'payload atualiza o mapa direto (sem custo de re-fetch)');
    assert.match(bloco, /#agendarRenderBarbeiros\(/, 'agenda re-render debounced');
  });

  test('#pararRealtimeAtividade remove o canal (sem leak)', () => {
    const idx = SRC_PAGE.indexOf('#pararRealtimeAtividade() {');
    assert.ok(idx > 0, '#pararRealtimeAtividade deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 400);
    assert.match(
      bloco,
      /BarbeiroAtividadeStatus\.desassinar/,
      'remove o consumidor pelo gerenciador do canal compartilhado',
    );
  });

  test('sair da tela para o canal de atividade junto com fila e shop', () => {
    const idx = SRC_PAGE.indexOf('#pararRealtimeFila();');
    const bloco = SRC_PAGE.slice(idx, idx + 300);
    assert.match(bloco, /#pararRealtimeShop\(\);/, 'padrão existente preservado');
    assert.match(bloco, /#pararRealtimeAtividade\(\);/, 'canal de presença também é parado');
  });

  test('#renderizar inicia canal de atividade e dispara a carga de presença', () => {
    const idx = SRC_PAGE.indexOf('#renderizar(shop, servicos, portfolio) {');
    const bloco = SRC_PAGE.slice(idx, idx + 1200);
    assert.match(bloco, /#iniciarRealtimeAtividade\(shop\)/, 'canal sobe no load');
    assert.match(bloco, /#carregarAtividade\(shop\)/, 'estado inicial vem da rota pública');
  });

  test('reentrada na tela (mesma barbearia) re-sincroniza presença e reinicia o canal', () => {
    const idx = SRC_PAGE.indexOf('this.#iniciarRealtimeShop(this.#shopData);');
    assert.ok(idx > 0, 'bloco de reentrada deve existir');
    const bloco = SRC_PAGE.slice(idx, idx + 300);
    assert.match(bloco, /#iniciarRealtimeAtividade\(this\.#shopData\)/, 'canal reinicia na reentrada');
    assert.match(bloco, /#carregarAtividade\(this\.#shopData\)/, 're-sync: status pode ter mudado fora da tela');
  });
});

// =============================================================================
// Página pública — render: texto acima do avatar + affordance das cadeiras
// =============================================================================

describe('BarbeariaPage — presença do dono (render)', () => {
  test('statusEl (criarParagrafo) é passado APENAS para a row do dono', () => {
    assert.match(
      SRC_PAGE,
      /statusEl:\s*\(isOwner && typeof BarbeiroAtividadeStatus !== 'undefined'\)\s*\n?\s*\? BarbeiroAtividadeStatus\.criarParagrafo\(/,
      'mesmo componente de texto da Minha Barbearia, condicionado ao dono',
    );
  });

  test('#criarRow aceita statusEl e repassa ao BarbeiroCard (acima do avatar)', () => {
    const idx = SRC_PAGE.indexOf('static #criarRow(');
    const bloco = SRC_PAGE.slice(idx, idx + 900);
    assert.match(bloco, /statusEl = null/, 'parâmetro statusEl com default');
    assert.match(bloco, /statusEl,?\s*\n?\s*\}\)|statusEl\s*,/, 'statusEl repassado ao BarbeiroCard.criar');
  });

  test('dono Inativo remove a affordance das cadeiras dele (podeInteragir da row)', () => {
    assert.match(
      SRC_PAGE,
      /const donoAtivo = !isOwner \|\| this\.#donoDisponivel\(b\.id\);/,
      'régua por barbeiro: só o dono é afetado',
    );
    assert.match(
      SRC_PAGE,
      /podeInteragir:\s*podeInteragir && donoAtivo/,
      'cadeiras do dono inativo sem affordance visual',
    );
  });

  test('assinatura da row inclui a atividade — status novo força re-render da row', () => {
    const idx = SRC_PAGE.indexOf('static #assinaturaRowPublica(');
    const bloco = SRC_PAGE.slice(idx, idx + 700);
    assert.match(bloco, /atividade/, 'componente de atividade na assinatura');
  });
});

// =============================================================================
// Página pública — guard de clique (dono inativo não entra na fila dele)
// =============================================================================

describe('BarbeariaPage — presença do dono (guard de clique)', () => {
  for (const handler of ['#onCadeiraClick(professionalId', '#onProducaoClick(professionalId']) {
    test(`${handler}) bloqueia com feedback visual quando o dono está Inativo (antes da seleção de serviços)`, () => {
      const idx = SRC_PAGE.indexOf(`async ${handler}`);
      assert.ok(idx > 0, `${handler} deve existir`);
      const bloco = SRC_PAGE.slice(idx, SRC_PAGE.indexOf('abrirSelecaoServicos', idx));
      assert.match(bloco, /this\.#donoInativo\(professionalId\)/, 'guard do dono inativo');
      assert.match(bloco, /#feedbackCadeiraBloqueada\(cadeiraEl\)/, 'balanço + balão na cadeira (toast é fallback)');
    });
  }
});

// =============================================================================
// CSS — cores do texto Ativo/Inativo (visível nas duas páginas)
// =============================================================================

describe('CSS — texto de atividade acima do avatar', () => {
  test('valores Ativo/Inativo têm cor (dourado/vermelho — linguagem do app)', () => {
    assert.match(SRC_CSS, /\.barbeiro-atividade-status__valor--ativo\s*\{[^}]*color/, 'estado Ativo com cor');
    assert.match(SRC_CSS, /\.barbeiro-atividade-status__valor--inativo\s*\{[^}]*color/, 'estado Inativo com cor');
  });
});

// =============================================================================
// Minha Barbearia — proteção: tempo real do texto do card preservado
// =============================================================================

describe('MB — tempo real do texto de atividade (proteção de regressão)', () => {
  test('#reRenderEquipe re-fetcha status e atualiza o mapa (Realtime → texto novo)', () => {
    const idx = SRC_MB.indexOf('async #reRenderEquipe()');
    assert.ok(idx > 0, '#reRenderEquipe deve existir');
    const bloco = SRC_MB.slice(idx, idx + 1200);
    assert.match(bloco, /#fetchStatusBarbeiros\(/, 're-fetch da presença a cada evento');
    assert.match(bloco, /this\.#atividadeStatus\s*=/, 'mapa substituído antes do render');
  });

  test('canal de atividade do MB re-renderiza a equipe ao receber evento', () => {
    const idx = SRC_MB.indexOf('#iniciarRealtimeAtividade(barbershopId)');
    const bloco = SRC_MB.slice(idx, idx + 500);
    assert.match(bloco, /BarbeiroAtividadeStatus\.assinar\(/, 'mesmo canal compartilhado');
    assert.match(bloco, /#agendarReRenderEquipe\(\)/, 'evento → re-render');
  });
});

// =============================================================================
// BFF — rota de status é pública (visitante vê o estado correto)
// =============================================================================

describe('BFF — rota barbeiros-status', () => {
  test('GET /:barbershop_id/barbeiros-status NÃO exige autenticação', () => {
    const linha = SRC_ROTAS_BFF.split('\n').find(l => l.includes('barbeiros-status'));
    assert.ok(linha, 'rota barbeiros-status deve existir');
    assert.ok(!linha.includes('AuthMiddleware.verificar'), 'visitante sem login precisa ler o status');
  });
});

// =============================================================================
// Units em VM — BarbeiroCard.criar e BarbeiroAtividadeStatus.criarParagrafo
// =============================================================================

/** Stub mínimo de elemento DOM que rastreia filhos. */
function elStub(tag) {
  return {
    tag,
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    appendChild(c) { this.children.push(c); return c; },
  };
}

function criarSandboxDom(extra = {}) {
  const sandbox = vm.createContext({
    console, Object, String, Array, Map,
    document: { createElement: (t) => elStub(t) },
    window: {},
    SupabaseService: { resolveAvatarUrl: () => null },
    ...extra,
  });
  return sandbox;
}

describe('BarbeiroCard.criar — statusEl acima do avatar (unit VM)', () => {
  test('statusEl é o PRIMEIRO filho do card (acima do avatar)', () => {
    const sandbox = criarSandboxDom();
    carregar(sandbox, 'shared/js/BarbeiroCard.js');
    const status = elStub('p');
    const card = sandbox.BarbeiroCard.criar({ nome: 'Dono', avatarPath: null, statusEl: status, isOwner: true });
    assert.strictEqual(card.children[0], status, 'statusEl deve vir antes do avatar');
    assert.strictEqual(card.children[1].className, 'bbc-avatar', 'avatar vem logo abaixo do status');
  });

  test('sem statusEl o card mantém a estrutura original (avatar primeiro)', () => {
    const sandbox = criarSandboxDom();
    carregar(sandbox, 'shared/js/BarbeiroCard.js');
    const card = sandbox.BarbeiroCard.criar({ nome: 'Barbeiro', avatarPath: null });
    assert.strictEqual(card.children[0].className, 'bbc-avatar', 'sem status, avatar continua primeiro');
  });
});

describe('BarbeiroAtividadeStatus.criarParagrafo — estrutura do texto (unit VM)', () => {
  function carregarStatus(sandbox) {
    carregar(sandbox, 'shared/js/BarbeiroAtividadeStatus.js');
    return sandbox.BarbeiroAtividadeStatus;
  }

  test('parágrafo Ativo: classe base + valor dourado + data-professional-id', () => {
    const sandbox = criarSandboxDom();
    const S = carregarStatus(sandbox);
    const p = S.criarParagrafo({ professionalId: 'p1', isAvailable: true });
    assert.strictEqual(p.className, 'barbeiro-atividade-status');
    assert.strictEqual(p.dataset.professionalId, 'p1');
    const valor = p.children[0];
    assert.match(valor.className, /barbeiro-atividade-status__valor--ativo/);
    assert.strictEqual(valor.textContent, 'Ativo');
  });

  test('parágrafo Inativo: valor com modificador inativo', () => {
    const sandbox = criarSandboxDom();
    const S = carregarStatus(sandbox);
    const p = S.criarParagrafo({ professionalId: 'p2', isAvailable: false });
    const valor = p.children[0];
    assert.match(valor.className, /barbeiro-atividade-status__valor--inativo/);
    assert.strictEqual(valor.textContent, 'Inativo');
  });
});
