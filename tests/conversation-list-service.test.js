'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'shared/js/ConversationListService.js'), 'utf8');

describe('ConversationListService — análise estática', () => {

  test('classe está definida', () => {
    assert.ok(SRC.includes('class ConversationListService'), 'ConversationListService deve ser definida');
  });

  test('método carregar() é estático e assíncrono', () => {
    assert.ok(SRC.includes('static async carregar('), 'carregar deve ser estático e async');
  });

  test('chama ConversationRepository.listar()', () => {
    assert.ok(SRC.includes('ConversationRepository.listar()'), 'deve chamar ConversationRepository.listar');
  });

  test('carrega favoritos de barbearias', () => {
    assert.ok(SRC.includes('ProfileRepository.getFavorites('), 'deve buscar favoritos de barbearias');
  });

  test('carrega barbeiros favoritos', () => {
    assert.ok(SRC.includes('ProfileRepository.getFavoriteBarbers('), 'deve buscar barbeiros favoritos');
  });

  test('define filtros por role (ALLOWED_TARGETS)', () => {
    assert.ok(SRC.includes('#ALLOWED_TARGETS') || SRC.includes('ALLOWED_TARGETS'), 'deve ter filtro por role');
    assert.ok(SRC.includes('cliente'), 'deve ter regra para role cliente');
    assert.ok(SRC.includes('profissional'), 'deve ter regra para role profissional');
  });

  test('método buscar() existe', () => {
    assert.ok(SRC.includes('static async buscar('), 'buscar deve ser estático e async');
  });

  test('buscar usa InputValidator.escaparFiltroPostgREST para proteção de query', () => {
    assert.ok(
      SRC.includes('InputValidator.escaparFiltroPostgREST('),
      'deve sanitizar o termo antes de buscar'
    );
  });

  test('usa textContent ou textContent para nomes (não innerHTML)', () => {
    // No serviço (sem DOM), checa apenas que não há construção de HTML com interpolação
    assert.ok(!SRC.includes('innerHTML'), 'serviço não deve usar innerHTML');
  });

  test('retorna objeto com chaves conversas e favoritos', () => {
    assert.ok(SRC.includes('conversas'), 'deve retornar conversas');
    assert.ok(SRC.includes('favoritos'), 'deve retornar favoritos');
  });

  test('nao marca como nao lida quando ultima mensagem foi enviada pelo usuario local', () => {
    assert.ok(
      SRC.includes('#unreadCountParaUsuario'),
      'deve centralizar normalizacao de unreadCount',
    );
    assert.ok(
      SRC.includes('item.lastMessage?.senderId === localUserId'),
      'deve zerar unread quando a ultima mensagem foi enviada pelo usuario local',
    );
  });
});
