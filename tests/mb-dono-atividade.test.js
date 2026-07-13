'use strict';

/**
 * tests/mb-dono-atividade.test.js
 *
 * Switch Ativo/Inativo do DONO na página Minha Barbearia.
 * O switch vive no painel de status (#mb-gi-conteudo), 1rem abaixo da linha
 * de abrir/fechar a barbearia — NÃO mais dentro do card do dono na equipe.
 *
 * Cobre:
 *   - HTML: row #mb-dono-status-row dentro do painel, depois da #mb-status-row,
 *     hidden por padrão, reusando as classes mb-status-* (sem componente novo)
 *   - CSS: modificador .mb-status-row--dono com margin-top de 1rem
 *   - Controller: #ativarControleAtividadeDono reusa BarbeiroAtividadeStatus
 *     (mesma classe do modo parceiro) com seed do mapa já carregado e
 *     init({ carregarStatus: false }); só o dono vê a row
 *   - Card do dono na equipe NÃO injeta mais o toggle (comportamento movido)
 *   - default do dono sem linha de presença = ATIVO (#statusDisponivelDono)
 *   - #podeGerenciarCadeira bloqueia a cadeira do dono quando Inativo
 *   - BarbeiroAtividadeStatus.init({ carregarStatus:false }): unit em VM —
 *     não re-fetcha o BFF, preserva o status semeado e assina o Realtime
 *   - BFF: repositório aceita dono + default ativo na listagem
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { fn, carregar, ROOT } = require('./_helpers.js');

const SRC_CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
  'utf8',
);
const SRC_HTML = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/index.html'),
  'utf8',
);
const SRC_CSS = fs.readFileSync(
  path.join(ROOT, 'shared/css/components.css'),
  'utf8',
);
const SRC_REPO_BFF = fs.readFileSync(
  path.join(ROOT, 'barberflow-bff-api/repositories/BarbeariaRepository.js'),
  'utf8',
);

// =============================================================================
// HTML — row do dono dentro do painel de status
// =============================================================================

describe('MB — switch do dono no painel de status (HTML)', () => {
  test('row #mb-dono-status-row existe dentro do painel, DEPOIS da row abrir/fechar', () => {
    const idxPainel    = SRC_HTML.indexOf('id="mb-gi-conteudo"');
    const idxStatusRow = SRC_HTML.indexOf('id="mb-status-row"');
    const idxDonoRow   = SRC_HTML.indexOf('id="mb-dono-status-row"');
    assert.ok(idxPainel > 0,  'painel #mb-gi-conteudo deve existir');
    assert.ok(idxDonoRow > 0, 'row #mb-dono-status-row deve existir');
    assert.ok(idxPainel < idxStatusRow && idxStatusRow < idxDonoRow,
      'ordem deve ser: painel → row abrir/fechar → row do dono');
  });

  test('row do dono começa hidden e usa o modificador --dono (só o dono vê)', () => {
    const bloco = SRC_HTML.slice(SRC_HTML.indexOf('id="mb-dono-status-row"') - 200, SRC_HTML.indexOf('id="mb-dono-status-row"') + 600);
    assert.match(bloco, /mb-status-row--dono/, 'deve usar o modificador de espaçamento');
    assert.match(bloco, /hidden/, 'row deve começar hidden (JS revela apenas para o dono)');
  });

  test('switch do dono reusa mb-status-toggle, tem thumb, role=switch e aria-label', () => {
    const idx = SRC_HTML.indexOf('id="mb-dono-status-row"');
    const bloco = SRC_HTML.slice(idx, idx + 700);
    assert.match(bloco, /<button[^>]+mb-status-toggle/, 'deve ser um <button> com a classe do switch existente');
    assert.match(bloco, /id="mb-dono-status-toggle"/, 'toggle deve ter id próprio');
    assert.match(bloco, /role="switch"/, 'acessibilidade: role=switch');
    assert.match(bloco, /aria-checked/, 'estado inicial acessível');
    assert.match(bloco, /aria-label/, 'switch deve ter aria-label');
    assert.match(bloco, /mb-status-thumb/, 'deve ter o thumb do switch');
    assert.match(bloco, /id="mb-dono-status-txt"/, 'texto de estado deve ter id próprio');
  });
});

// =============================================================================
// CSS — 1rem abaixo da linha abrir/fechar
// =============================================================================

describe('MB — switch do dono no painel de status (CSS)', () => {
  test('.mb-status-row--dono aplica margin-top de 1rem', () => {
    const idx = SRC_CSS.indexOf('.mb-status-row--dono');
    assert.ok(idx > 0, '.mb-status-row--dono deve existir em shared/css/components.css');
    const bloco = SRC_CSS.slice(idx, SRC_CSS.indexOf('}', idx) + 1);
    assert.match(bloco, /margin-top:\s*1rem/, 'espaçamento pedido: 1rem abaixo do abrir/fechar');
  });

  test('estados Ativo/Inativo do texto têm cor definida (classes que a classe JS aplica)', () => {
    assert.match(SRC_CSS, /\.mb-status-txt--barbeiro-ativo/, 'cor do estado Ativo');
    assert.match(SRC_CSS, /\.mb-status-txt--barbeiro-inativo/, 'cor do estado Inativo');
  });
});

// =============================================================================
// Controller — reuso de BarbeiroAtividadeStatus no painel
// =============================================================================

describe('MB — status do dono (controller)', () => {
  test('refs da row do dono são cacheados', () => {
    assert.match(SRC_CONTROLLER, /donoStatusRow:\s*q\('mb-dono-status-row'\)/, 'ref da row');
    assert.match(SRC_CONTROLLER, /donoStatusTxt:\s*q\('mb-dono-status-txt'\)/, 'ref do texto');
    assert.match(SRC_CONTROLLER, /donoStatusToggle:\s*q\('mb-dono-status-toggle'\)/, 'ref do switch');
  });

  test('#ativarControleAtividadeDono reusa BarbeiroAtividadeStatus (DRY — mesma classe do parceiro)', () => {
    const idx = SRC_CONTROLLER.indexOf('#ativarControleAtividadeDono() {');
    assert.ok(idx > 0, '#ativarControleAtividadeDono deve existir');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 1600);
    assert.match(bloco, /new BarbeiroAtividadeStatus\(/, 'deve instanciar a classe compartilhada — sem lógica duplicada');
    assert.match(bloco, /toggleEl:\s*.*donoStatusToggle/, 'switch da row do dono');
    assert.match(bloco, /textoEl:\s*.*donoStatusTxt/, 'texto da row do dono');
    assert.match(bloco, /#onAtividadeParceiroAtualizada\(/, 'onChange delega ao handler existente (mapa + re-render)');
  });

  test('só o dono vê a row: guard #isOwner + hidden controlado', () => {
    const idx = SRC_CONTROLLER.indexOf('#ativarControleAtividadeDono() {');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 1600);
    assert.match(bloco, /this\.#isOwner/, 'guard do dono');
    assert.match(bloco, /hidden\s*=\s*false/, 'ativar revela a row');
    const idxDes = SRC_CONTROLLER.indexOf('#desativarControleAtividadeDono() {');
    assert.ok(idxDes > 0, '#desativarControleAtividadeDono deve existir');
    const blocoDes = SRC_CONTROLLER.slice(idxDes, idxDes + 500);
    assert.match(blocoDes, /hidden\s*=\s*true/, 'desativar esconde a row');
    assert.match(blocoDes, /destroy\(\)/, 'desativar limpa listeners/canal da instância (sem leak)');
  });

  test('seed vem do mapa já carregado + init({ carregarStatus: false }) — sem re-fetch', () => {
    const idx = SRC_CONTROLLER.indexOf('#ativarControleAtividadeDono() {');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 1600);
    assert.match(bloco, /#statusDisponivelDono\(/, 'default ATIVO do dono vem da régua existente');
    assert.match(bloco, /atualizarStatus\([^)]*\{\s*emit:\s*false\s*\}/, 'seed sem emitir evento');
    assert.match(bloco, /init\(\{\s*carregarStatus:\s*false\s*\}\)/, 'não re-fetcha o BFF (mapa é a fonte)');
  });

  test('card do dono na equipe NÃO injeta mais o toggle (movido para o painel)', () => {
    assert.ok(!SRC_CONTROLLER.includes('criarToggleAtividadeDono'), 'factory antigo do toggle no card deve ter sido removido');
    assert.ok(!SRC_CONTROLLER.includes('toggleAtividadeDono'), 'handler manual antigo deve ter sido removido (classe compartilhada assume)');
    assert.ok(!/criarBarberiroCard\(\{[^}]*toggleEl/s.test(SRC_CONTROLLER), '#criarBarberiroCard não recebe mais toggleEl');
  });

  test('spec do dono mostra atividade sempre e usa default ATIVO', () => {
    const idxSpecDono = SRC_CONTROLLER.indexOf("variant:         'dono'");
    assert.ok(idxSpecDono > 0, 'spec do dono deve existir');
    const bloco = SRC_CONTROLLER.slice(idxSpecDono - 600, idxSpecDono + 600);
    assert.match(bloco, /mostrarAtividade:\s*true/, 'dono deve sempre exibir o texto de status');
    assert.match(bloco, /isAvailable:\s*this\.#statusDisponivelDono\(/, 'dono deve usar o default ativo');
  });

  test('#statusDisponivelDono: sem linha de presença = ATIVO (true)', () => {
    assert.match(
      SRC_CONTROLLER,
      /#statusDisponivelDono\(professionalId\)\s*\{[^}]*return entry \? entry\.is_available === true : true;/s,
      'ausência de entrada no mapa deve ser tratada como ativo',
    );
  });

  test('#podeGerenciarCadeira: dono Inativo não gerencia a própria cadeira', () => {
    const idx = SRC_CONTROLLER.indexOf('#podeGerenciarCadeira(professionalId) {'); // definição, não o call-site
    assert.ok(idx > 0, 'definição de #podeGerenciarCadeira deve existir');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 500);
    assert.match(bloco, /if \(this\.#contextoParceiro\) return this\.#barbeiroParceiroAtivo === true;/, 'regra do parceiro preservada');
    assert.match(bloco, /return this\.#statusDisponivelDono\(professionalId\);/, 'dono passa pela mesma régua (com default ativo)');
    assert.ok(!/return true;\s*\}/.test(bloco.slice(bloco.indexOf('contextoParceiro'))), 'não deve mais liberar o dono incondicionalmente');
  });
});

// =============================================================================
// BarbeiroAtividadeStatus.init({ carregarStatus }) — unit em sandbox VM
// =============================================================================

/**
 * Sandbox mínimo para instanciar BarbeiroAtividadeStatus sem browser:
 * BFF e Realtime são espiões; canal Realtime é um chain .on().on().subscribe().
 */
function criarSandboxAtividade({ statusNoBff = [] } = {}) {
  const canal = { send: fn() };
  canal.on = fn(() => canal);
  canal.subscribe = fn(() => canal);

  const spyStatusBarbeiros = fn().mockResolvedValue({ data: statusNoBff });
  const spyChannel = fn(() => canal);

  const sandbox = vm.createContext({
    console, Object, Array, Map, Set, String, Promise, JSON, Date, Error,
    window: {},
    document: { dispatchEvent: fn() },
    CustomEvent: function CustomEvent(tipo, opts) { this.type = tipo; this.detail = opts?.detail; },
    LoggerService: { warn: fn() },
    BffApiService: { barbearias: { statusBarbeiros: spyStatusBarbeiros, atualizarMeuStatusBarbeiro: fn() } },
    SupabaseService: { channel: spyChannel, removeChannel: fn() },
  });
  carregar(sandbox, 'shared/js/BarbeiroAtividadeStatus.js');
  return { sandbox, spyStatusBarbeiros, spyChannel, canal };
}

describe('BarbeiroAtividadeStatus — init({ carregarStatus })', () => {
  test('init({ carregarStatus: false }) NÃO chama o BFF e preserva o status semeado', async () => {
    const { sandbox, spyStatusBarbeiros, spyChannel } = criarSandboxAtividade();
    const inst = new sandbox.BarbeiroAtividadeStatus({ barbershopId: 'shop1', professionalId: 'p1' });
    inst.atualizarStatus({ professional_id: 'p1', is_available: true }, { emit: false });
    await inst.init({ carregarStatus: false });
    assert.strictEqual(spyStatusBarbeiros.calls.length, 0, 'não deve re-fetchar o BFF');
    assert.strictEqual(inst.isAvailable, true, 'seed (default ATIVO do dono) deve ser preservado');
    assert.strictEqual(spyChannel.calls.length, 1, 'Realtime deve ser assinado mesmo sem fetch');
  });

  test('init() sem opções continua buscando no BFF (retrocompatível com o modo parceiro)', async () => {
    const { sandbox, spyStatusBarbeiros } = criarSandboxAtividade({
      statusNoBff: [{ professional_id: 'p1', is_available: false, updated_at: '2026-07-12T00:00:00Z' }],
    });
    const inst = new sandbox.BarbeiroAtividadeStatus({ barbershopId: 'shop1', professionalId: 'p1' });
    inst.atualizarStatus({ professional_id: 'p1', is_available: true }, { emit: false });
    await inst.init();
    assert.strictEqual(spyStatusBarbeiros.calls.length, 1, 'comportamento original: 1 fetch no init()');
    assert.strictEqual(inst.isAvailable, false, 'status do BFF deve sobrepor o seed');
  });

  test('init({ carregarStatus: false }) sem seed prévio mantém o default seguro (inativo)', async () => {
    const { sandbox } = criarSandboxAtividade();
    const inst = new sandbox.BarbeiroAtividadeStatus({ barbershopId: 'shop1', professionalId: 'p1' });
    await inst.init({ carregarStatus: false });
    assert.strictEqual(inst.isAvailable, false, 'sem seed, isAvailable segue o default do campo');
  });
});

// =============================================================================
// BFF — preservado (mesmas garantias da entrega anterior)
// =============================================================================

describe('MB — status do dono (BFF)', () => {
  test('atualizarMeuStatusBarbeiro aceita o dono (fallback ehDonoDaBarbearia)', () => {
    const idx = SRC_REPO_BFF.indexOf('async atualizarMeuStatusBarbeiro');
    const bloco = SRC_REPO_BFF.slice(idx, idx + 900);
    assert.match(bloco, /profissionalTemVinculoAtivo/, 'guard original preservado');
    assert.match(bloco, /ehDonoDaBarbearia/, 'dono deve ser aceito como alternativa ao vínculo');
  });

  test('listarStatusBarbeiros inclui o dono com default ATIVO', () => {
    const idx = SRC_REPO_BFF.indexOf('async listarStatusBarbeiros');
    const bloco = SRC_REPO_BFF.slice(idx, idx + 2600);
    assert.match(bloco, /owner_id/, 'deve buscar o owner_id da barbearia');
    assert.match(bloco, /ehDono\s*\n?\s*:|\?\s*ehDono/, 'default do dono deve ser ativo quando sem linha');
  });
});
