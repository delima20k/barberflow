'use strict';
/**
 * tests/messages-widget.test.js
 *
 * Validação estática de MessagesWidget.#buscarConversas().
 *
 * Contexto do bug:
 *   - appointments.professional_id → professionals(id), NÃO profiles(id).
 *   - A query anterior usava `profiles!appointments_professional_id_fkey`,
 *     que o PostgREST rejeita com HTTP 400 porque essa FK não aponta para profiles.
 *   - appointments.client_id → profiles(id) (FK válida — caso profissional funciona).
 *
 * Estratégia: análise estática do fonte — MessagesWidget depende de
 * DOM + SupabaseService (globais de browser), portanto não é instanciável
 * em Node puro sem um shim pesado. Os testes verificam intenção estrutural
 * do código com precisão suficiente para prevenir regressão.
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const fs              = require('node:fs');
const path            = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/MessagesWidget.js'), 'utf8');

// ─── describe 1: remoção do hint FK quebrado ──────────────────────────────────

describe('MessagesWidget — buscarConversas: FK hint inválido removido', () => {

  test('não usa profiles!appointments_professional_id_fkey (causa 400 no PostgREST)', () => {
    assert.ok(
      !SRC.includes('profiles!appointments_professional_id_fkey'),
      'O hint FK inválido deve ser removido — professional_id aponta para professionals, não profiles',
    );
  });

  test('não usa o padrão genérico profiles!appointments_${campoOut}_fkey', () => {
    assert.ok(
      !SRC.includes('profiles!appointments_${campoOut}_fkey'),
      'O padrão genérico de hint FK deve ser removido para evitar 400 no caso cliente',
    );
  });

});

// ─── describe 2: query em 2 etapas para role=cliente ─────────────────────────

describe('MessagesWidget — buscarConversas: 2 etapas para role=cliente', () => {

  test('seleciona professional_id de appointments na primeira etapa', () => {
    assert.ok(
      SRC.includes("select('professional_id')"),
      "Primeira etapa deve selecionar apenas 'professional_id' de appointments",
    );
  });

  test('segunda etapa usa .in(\'id\', ids) para buscar profiles por UUID', () => {
    assert.ok(
      SRC.includes(".in('id'"),
      "Segunda etapa deve usar .in('id', ids) para buscar profiles por lista de IDs",
    );
  });

  test('segunda etapa busca na tabela profiles com campos corretos', () => {
    assert.ok(
      SRC.includes("'id, full_name, avatar_path, role'"),
      "Segunda etapa deve selecionar 'id, full_name, avatar_path, role' de profiles",
    );
  });

});

// ─── describe 3: query de join para role=profissional ────────────────────────

describe('MessagesWidget — buscarConversas: join direto para role=profissional', () => {

  test('join profiles sem hint FK (client_id → profiles é não-ambíguo)', () => {
    // Verifica que o join usa somente "profiles (" sem hint FK
    // e não o padrão quebrado com !appointments_client_id_fkey
    assert.ok(
      !SRC.includes('profiles!appointments_client_id_fkey'),
      'Hint FK appointments_client_id_fkey deve ser removido — PostgREST pode inferir sozinho',
    );
  });

  test('filtro por professional_id é usado no caso profissional', () => {
    assert.ok(
      SRC.includes("'professional_id'") || SRC.includes('"professional_id"'),
      "Caso profissional deve filtrar por 'professional_id' como campoId",
    );
  });

});

// ─── describe 4: tratamento de erros e DRY ───────────────────────────────────

describe('MessagesWidget — buscarConversas: segurança e DRY', () => {

  test('catch silencioso retorna [] para não quebrar a UI em falhas de rede', () => {
    const idxCatch = SRC.indexOf('#buscarConversas');
    assert.ok(idxCatch > 0, '#buscarConversas deve existir');
    const bloco = SRC.slice(idxCatch, idxCatch + 3000);
    assert.ok(
      bloco.includes('catch') && bloco.includes('return []'),
      '#buscarConversas deve ter catch que retorna [] para não quebrar a UI',
    );
  });

  test('método auxiliar #mapearPerfis existe para evitar duplicação entre os 2 branches', () => {
    assert.ok(
      SRC.includes('#mapearPerfis'),
      'Método auxiliar #mapearPerfis deve existir para mapear perfis em ambos os branches (DRY)',
    );
  });

  test('#mapearPerfis deduplica por perfil.id usando Set', () => {
    const idxMetodo = SRC.indexOf('static #mapearPerfis');
    assert.ok(idxMetodo > 0, '#mapearPerfis deve existir como método estático');
    const bloco = SRC.slice(idxMetodo, idxMetodo + 600);
    assert.ok(
      bloco.includes('new Set') || bloco.includes('vistos'),
      '#mapearPerfis deve deduplica perfis usando Set',
    );
  });

});
