'use strict';
/**
 * tests/portfolio-like-realtime.test.js
 *
 * Testa PortfolioMessageRealtimeService.iniciarLikes/pararLikes — curtidas
 * em tempo real para o profissional DONO (stories + portfolio_images).
 *
 * Cenários:
 *   iniciarLikes — cria canal portfolio-likes:<ownerId> via SupabaseService
 *   iniciarLikes — idempotente (mesmo owner não duplica canal)
 *   iniciarLikes — assina UPDATE em portfolio_images E stories filtrado por owner_id
 *   pararLikes   — remove o canal
 *   UPDATE portfolio_images → despacha barberflow:portfolio-like SÓ com contagem
 *                             (sem `liked` → preserva estado do usuário)
 *   UPDATE stories          → despacha barberflow:story-like-sync (mediaId)
 */

const { describe, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const OWNER = 'a0000000-0000-4000-8000-000000000001';

function criarSandbox() {
  // Guarda o callback de cada .on() por tabela do filtro.
  const callbacks = {};
  const canalMock = {
    on: fn(),
    subscribe: fn().mockReturnThis(),
  };
  canalMock.on.mockImplementation((_evt, config, cb) => {
    callbacks[config.table] = { config, cb };
    return canalMock;
  });

  const supabaseMock = {
    channel:       fn().mockReturnValue(canalMock),
    removeChannel: fn(),
  };

  const eventos = [];
  const documentMock = {
    addEventListener:    fn(),
    removeEventListener: fn(),
    dispatchEvent:       fn((e) => eventos.push(e)),
  };

  const sandbox = vm.createContext({
    console: { error: fn(), warn: fn(), log: fn() },
    document: documentMock,
    CustomEvent: class CustomEvent {
      constructor(type, opts) { this.type = type; this.detail = opts?.detail ?? {}; }
    },
    SupabaseService: supabaseMock,
  });

  carregar(sandbox, 'shared/js/PortfolioMessageRealtimeService.js');

  return { sandbox, canalMock, supabaseMock, documentMock, eventos, callbacks };
}

describe('PortfolioMessageRealtimeService — curtidas em tempo real', () => {
  test('iniciarLikes cria canal portfolio-likes:<ownerId>', () => {
    const { sandbox, supabaseMock } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);
    assert.equal(supabaseMock.channel.calls.length, 1);
    assert.equal(supabaseMock.channel.calls[0][0], `portfolio-likes:${OWNER}`);
  });

  test('iniciarLikes assina UPDATE em portfolio_images e stories filtrado por owner_id', () => {
    const { sandbox, callbacks } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);

    assert.ok(callbacks.portfolio_images, 'deve assinar portfolio_images');
    assert.ok(callbacks.stories, 'deve assinar stories');
    assert.equal(callbacks.portfolio_images.config.event, 'UPDATE');
    assert.equal(callbacks.portfolio_images.config.filter, `owner_id=eq.${OWNER}`);
    assert.equal(callbacks.stories.config.event, 'UPDATE');
    assert.equal(callbacks.stories.config.filter, `owner_id=eq.${OWNER}`);
  });

  test('iniciarLikes é idempotente para o mesmo owner', () => {
    const { sandbox, supabaseMock } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);
    assert.equal(supabaseMock.channel.calls.length, 1);
  });

  test('iniciarLikes sem ownerId não cria canal', () => {
    const { sandbox, supabaseMock } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes('');
    assert.equal(supabaseMock.channel.calls.length, 0);
  });

  test('pararLikes remove o canal', () => {
    const { sandbox, supabaseMock } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);
    sandbox.PortfolioMessageRealtimeService.pararLikes();
    assert.equal(supabaseMock.removeChannel.calls.length, 1);
    // Após parar, pode reiniciar (novo canal)
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);
    assert.equal(supabaseMock.channel.calls.length, 2);
  });

  test('UPDATE portfolio_images despacha barberflow:portfolio-like SÓ com contagem (sem liked)', () => {
    const { sandbox, eventos, callbacks } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);

    callbacks.portfolio_images.cb({ new: { id: 'img-1', likes_count: 7 } });

    const evt = eventos.find(e => e.type === 'barberflow:portfolio-like');
    assert.ok(evt, 'deve despachar barberflow:portfolio-like');
    assert.equal(evt.detail.imageId, 'img-1');
    assert.equal(evt.detail.likesCount, 7);
    assert.ok(!('liked' in evt.detail), 'não deve incluir liked (atualização só-de-contagem)');
  });

  test('UPDATE stories despacha barberflow:story-like-sync com mediaId', () => {
    const { sandbox, eventos, callbacks } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);

    callbacks.stories.cb({ new: { id: 's-1', media_id: 'media-9', likes_count: 3 } });

    const evt = eventos.find(e => e.type === 'barberflow:story-like-sync');
    assert.ok(evt, 'deve despachar barberflow:story-like-sync');
    assert.equal(evt.detail.mediaId, 'media-9');
    assert.equal(evt.detail.likesCount, 3);
  });

  test('UPDATE stories sem media_id não despacha', () => {
    const { sandbox, eventos, callbacks } = criarSandbox();
    sandbox.PortfolioMessageRealtimeService.iniciarLikes(OWNER);

    callbacks.stories.cb({ new: { id: 's-2', media_id: null, likes_count: 5 } });

    assert.ok(!eventos.some(e => e.type === 'barberflow:story-like-sync'));
  });
});
