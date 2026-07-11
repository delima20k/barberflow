'use strict';

/**
 * tests/mb-dono-atividade.test.js
 *
 * Toggle Ativo/Inativo do DONO na página Minha Barbearia.
 *
 * Cobre (asserts de source, padrão do codebase):
 *   - card do dono sempre mostra o status (mostrarAtividade: true)
 *   - default do dono sem linha de presença = ATIVO (#statusDisponivelDono)
 *   - toggle do dono existe, reusa o switch mb-status-toggle e chama
 *     BffApiService.barbearias.atualizarMeuStatusBarbeiro
 *   - #podeGerenciarCadeira bloqueia a cadeira do dono quando Inativo
 *   - card do dono NÃO ganha botão de excluir (comportamento preservado)
 *   - BFF: repositório aceita dono + default ativo na listagem
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./_helpers.js');

const SRC_CONTROLLER = fs.readFileSync(
  path.join(ROOT, 'apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js'),
  'utf8',
);
const SRC_REPO_BFF = fs.readFileSync(
  path.join(ROOT, 'barberflow-bff-api/repositories/BarbeariaRepository.js'),
  'utf8',
);

describe('MB — status do dono (frontend)', () => {
  test('spec do dono mostra atividade sempre e usa default ATIVO', () => {
    const idxSpecDono = SRC_CONTROLLER.indexOf("variant:         'dono'");
    assert.ok(idxSpecDono > 0, 'spec do dono deve existir');
    const bloco = SRC_CONTROLLER.slice(idxSpecDono, idxSpecDono + 600);
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

  test('toggle do dono reusa o switch existente (mb-status-toggle) e é role=switch', () => {
    assert.match(SRC_CONTROLLER, /#criarToggleAtividadeDono\(/, 'deve existir o factory do toggle do dono');
    const idx = SRC_CONTROLLER.indexOf('#criarToggleAtividadeDono(isAvailable)');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 900);
    assert.match(bloco, /mb-status-toggle/, 'deve reusar a classe do switch existente (sem CSS novo)');
    assert.match(bloco, /mb-status-thumb/, 'deve ter o thumb do switch');
    assert.match(bloco, /setAttribute\('role', 'switch'\)/, 'acessibilidade: role=switch');
    assert.match(bloco, /stopPropagation/, 'clique no toggle não pode navegar pro perfil (card do dono navega)');
  });

  test('toggle do dono só aparece no card do dono e quando o usuário logado É o dono', () => {
    assert.match(
      SRC_CONTROLLER,
      /spec\.variant === 'dono' && this\.#isOwner\)\s*\n?\s*\? this\.#criarToggleAtividadeDono\(/,
      'toggle condicionado a variant dono + #isOwner',
    );
  });

  test('#toggleAtividadeDono chama a MESMA rota dos parceiros (atualizarMeuStatusBarbeiro)', () => {
    const idx = SRC_CONTROLLER.indexOf('async #toggleAtividadeDono');
    assert.ok(idx > 0, '#toggleAtividadeDono deve existir');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 1600);
    assert.match(bloco, /BffApiService\.barbearias\.atualizarMeuStatusBarbeiro\(/, 'reuso da rota PATCH me/status');
    assert.match(bloco, /#salvandoAtividadeDono/, 'guard anti duplo-clique');
    assert.match(bloco, /#onAtividadeParceiroAtualizada\(/, 'atualização otimista via handler existente (mapa + re-render)');
  });

  test('#podeGerenciarCadeira: dono Inativo não gerencia a própria cadeira', () => {
    const idx = SRC_CONTROLLER.indexOf('#podeGerenciarCadeira(professionalId) {'); // definição, não o call-site
    assert.ok(idx > 0, 'definição de #podeGerenciarCadeira deve existir');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 500);
    assert.match(bloco, /if \(this\.#contextoParceiro\) return this\.#barbeiroParceiroAtivo === true;/, 'regra do parceiro preservada');
    assert.match(bloco, /return this\.#statusDisponivelDono\(professionalId\);/, 'dono passa pela mesma régua (com default ativo)');
    assert.ok(!/return true;\s*\}/.test(bloco.slice(bloco.indexOf('contextoParceiro'))), 'não deve mais liberar o dono incondicionalmente');
  });

  test('card do dono continua SEM botão de excluir', () => {
    const idx = SRC_CONTROLLER.indexOf('#criarToggleAtividadeDono(isAvailable)');
    const bloco = SRC_CONTROLLER.slice(idx, idx + 1200);
    assert.ok(!/excluir|remover|delete/i.test(bloco), 'toggle do dono não deve introduzir exclusão');
  });
});

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
