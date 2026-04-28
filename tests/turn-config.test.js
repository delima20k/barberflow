'use strict';
/**
 * tests/turn-config.test.js
 *
 * Testa TurnConfig:
 *   - Formato username HMAC-SHA1
 *   - Validade da credencial (reproductível com mesma chave)
 *   - Estrutura de servidoresICE
 *   - Ausência de TURN_SECRET lança Error
 */

const { suite, test, beforeEach, afterEach } = require('node:test');
const assert                                  = require('node:assert/strict');
const crypto                                  = require('node:crypto');

// Guardar env original
const ENV_BACKUP = { ...process.env };

afterEach(() => {
  // Restaurar env e forçar recarregamento do módulo
  Object.keys(process.env).forEach(k => {
    if (!Object.prototype.hasOwnProperty.call(ENV_BACKUP, k)) {
      delete process.env[k];
    }
  });
  Object.assign(process.env, ENV_BACKUP);
  // Limpar cache do require para recarregar com novos valores de env
  delete require.cache[require.resolve('../src/infra/TurnConfig.js')];
});

function carregarTurnConfig({ secret = '', turnUrl = '', stunsUrl = '' } = {}) {
  delete require.cache[require.resolve('../src/infra/TurnConfig.js')];
  if (secret)   process.env.TURN_SECRET = secret;
  else          delete process.env.TURN_SECRET;
  if (turnUrl)  process.env.TURN_URL    = turnUrl;
  else          delete process.env.TURN_URL;
  if (stunsUrl) process.env.TURNS_URL   = stunsUrl;
  else          delete process.env.TURNS_URL;
  return require('../src/infra/TurnConfig.js');
}

// ─────────────────────────────────────────────────────────────────────────────
suite('TurnConfig.credenciais()', () => {

  test('username tem formato {timestamp}:{userId}', () => {
    const TurnConfig = carregarTurnConfig({ secret: 'test-secret' });
    const userId     = 'user-uuid-123';
    const antes      = Math.floor(Date.now() / 1000);
    const { username } = TurnConfig.credenciais(userId);

    const [ts, uid] = username.split(':');
    assert.strictEqual(uid, userId, 'userId deve estar no username após o :');

    const tsNum = Number(ts);
    assert.ok(tsNum > antes, 'timestamp deve ser no futuro');
    assert.ok(tsNum <= antes + 3601, 'timestamp não deve exceder TTL de 1h');
  });

  test('credential é Base64 válido (HMAC-SHA1)', () => {
    const TurnConfig        = carregarTurnConfig({ secret: 'my-coturn-secret' });
    const { username, credential } = TurnConfig.credenciais('user-abc');

    // Verificar que é base64 válido
    const decoded = Buffer.from(credential, 'base64');
    assert.ok(decoded.length === 20, 'HMAC-SHA1 deve ter 20 bytes');

    // Verificar que o HMAC é reprodutível
    const esperado = crypto
      .createHmac('sha1', 'my-coturn-secret')
      .update(username)
      .digest('base64');

    assert.strictEqual(credential, esperado, 'credential deve ser HMAC-SHA1(secret, username)');
  });

  test('lança Error quando TURN_SECRET não está configurado', () => {
    const TurnConfig = carregarTurnConfig({ secret: '' });
    assert.throws(
      () => TurnConfig.credenciais('user-1'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('TURN_SECRET'), 'mensagem deve mencionar TURN_SECRET');
        return true;
      }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
suite('TurnConfig.servidoresICE()', () => {

  test('sempre inclui STUN como primeiro servidor', () => {
    const TurnConfig  = carregarTurnConfig({ secret: 'secret' });
    const { iceServers } = TurnConfig.servidoresICE('user-1');

    assert.ok(Array.isArray(iceServers), 'iceServers deve ser array');
    assert.ok(iceServers.length >= 1, 'deve ter ao menos 1 servidor');
    const stun = iceServers[0];
    assert.ok(stun.urls.startsWith('stun:'), 'primeiro servidor deve ser STUN');
  });

  test('inclui TURN quando TURN_URL e TURN_SECRET estão configurados', () => {
    const TurnConfig  = carregarTurnConfig({ secret: 'secret', turnUrl: 'turn:turn.example.com:3478' });
    const { iceServers } = TurnConfig.servidoresICE('user-1');

    const turn = iceServers.find(s => s.urls.startsWith('turn:'));
    assert.ok(turn, 'deve incluir servidor TURN');
    assert.ok(turn.username, 'TURN deve ter username');
    assert.ok(turn.credential, 'TURN deve ter credential');
  });

  test('não inclui TURN quando TURN_SECRET está ausente', () => {
    const TurnConfig  = carregarTurnConfig({ secret: '', turnUrl: 'turn:turn.example.com:3478' });
    const { iceServers } = TurnConfig.servidoresICE('user-1');

    const turn = iceServers.find(s => s.urls.startsWith('turn:'));
    assert.strictEqual(turn, undefined, 'não deve incluir TURN sem secret');
  });

  test('expiresAt é timestamp futuro em milissegundos', () => {
    const TurnConfig  = carregarTurnConfig({ secret: 'secret' });
    const { expiresAt } = TurnConfig.servidoresICE('user-1');

    assert.ok(expiresAt > Date.now(), 'expiresAt deve ser no futuro');
    assert.ok(expiresAt < Date.now() + 2 * 3600 * 1000, 'expiresAt deve ser menos de 2h no futuro');
  });
});
