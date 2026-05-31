'use strict';
// =============================================================
// image-deletion-service.test.js
// TDD — ImageDeletionService (red → green → refactor)
// Framework: node:test + node:assert/strict
// =============================================================

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm     = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

const CAMINHO = 'shared/js/ImageDeletionService.js';

// ─── Utilitário: cria sandbox VM com globais mockados ────────

function criarSandbox(overrides = {}) {
  const bffDefault  = fn(async () => ({ error: null }));
  const bffRemover  = overrides.bffRemover ?? bffDefault;
  const respostaModal = Object.prototype.hasOwnProperty.call(overrides, 'respostaModal')
    ? overrides.respostaModal
    : 'confirmar';

  const sandbox = vm.createContext({
    // FluxoDeFila.abrir resolve com respostaModal configurado
    FluxoDeFila: {
      abrir: overrides.fluxoAbrir ?? fn(async () => respostaModal),
      escapar: str => String(str),
    },
    // BffApiService com namespace profissionais
    BffApiService: {
      profissionais: {
        removerPortfolioImagem: bffRemover,
      },
    },
    // LoggerService (evita ReferenceError no sandbox)
    LoggerService: {
      error: fn(),
      warn: fn(),
    },
    // Globais JS necessários
    Error,
    TypeError,
    Map,
    Promise,
    console,
  });

  carregar(sandbox, CAMINHO);
  return sandbox;
}

// =============================================================
// Suite 1 — confirmarEExcluir (fluxo normal)
// =============================================================

describe('ImageDeletionService — confirmarEExcluir', () => {

  it('deve abrir FluxoDeFila com config de perigo e título correto', async () => {
    let configRecebida = null;
    const sandbox = criarSandbox({
      fluxoAbrir: fn(async config => { configRecebida = config; return 'confirmar'; }),
    });

    await sandbox.ImageDeletionService.confirmarEExcluir('img-uuid-001');

    assert.ok(configRecebida, 'FluxoDeFila.abrir deve ter sido chamado');
    assert.equal(typeof configRecebida.titulo, 'string');
    assert.ok(configRecebida.titulo.length > 0, 'titulo não pode ser vazio');
    const acaoPerigo = configRecebida.acoes?.find(a => a.variante === 'perigo');
    assert.ok(acaoPerigo, 'deve existir uma ação com variante perigo');
    assert.equal(acaoPerigo.valor, 'confirmar');
  });

  it('ao confirmar: deve chamar BFF e retornar { deleted: true }', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({
      respostaModal: 'confirmar',
      bffRemover: bffSpy,
    });

    const resultado = await sandbox.ImageDeletionService.confirmarEExcluir('img-uuid-001');

    assert.equal(bffSpy.calls.length, 1);
    assert.deepEqual(bffSpy.calls[0], ['img-uuid-001']);
    assert.equal(resultado.deleted, true);
    assert.equal(resultado.cancelado, undefined);
  });

  it('ao cancelar: NÃO deve chamar BFF e retornar { deleted: false, cancelado: true }', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({
      respostaModal: 'cancelar',
      bffRemover: bffSpy,
    });

    const resultado = await sandbox.ImageDeletionService.confirmarEExcluir('img-uuid-002');

    assert.equal(bffSpy.calls.length, 0, 'BFF não deve ser chamado ao cancelar');
    assert.equal(resultado.deleted, false);
    assert.equal(resultado.cancelado, true);
  });

  it('ao fechar modal (null): NÃO deve chamar BFF e retornar { deleted: false, cancelado: true }', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({
      respostaModal: null,
      bffRemover: bffSpy,
    });

    const resultado = await sandbox.ImageDeletionService.confirmarEExcluir('img-uuid-003');

    assert.equal(bffSpy.calls.length, 0, 'BFF não deve ser chamado ao fechar');
    assert.equal(resultado.deleted, false);
    assert.equal(resultado.cancelado, true);
  });

});

// =============================================================
// Suite 2 — excluir (direto, sem modal)
// =============================================================

describe('ImageDeletionService — excluir', () => {

  it('deve chamar BFF e retornar { deleted: true } em caso de sucesso', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({ bffRemover: bffSpy });

    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-004');

    assert.equal(resultado.deleted, true);
    assert.equal(resultado.error, undefined);
  });

  it('deve retornar { deleted: false, error } quando BFF retorna erro', async () => {
    const erroSimulado = new Error('Imagem não encontrada');
    const sandbox = criarSandbox({
      bffRemover: fn(async () => ({ error: erroSimulado })),
    });

    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-005');

    assert.equal(resultado.deleted, false);
    assert.ok(resultado.error, 'deve retornar o erro recebido da BFF');
  });

  it('deve retornar { deleted: false, error } quando BFF lança exceção', async () => {
    const sandbox = criarSandbox({
      bffRemover: fn(async () => { throw new Error('timeout'); }),
    });

    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-006');

    assert.equal(resultado.deleted, false);
    assert.ok(resultado.error);
  });

  it('deve retornar { deleted: false, error } com mensagem para imageId inválido', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({ bffRemover: bffSpy });

    const resultado = await sandbox.ImageDeletionService.excluir('');

    assert.equal(resultado.deleted, false);
    assert.ok(resultado.error, 'imageId vazio deve gerar erro sem chamar BFF');
    assert.equal(bffSpy.calls.length, 0);
  });

  it('deve retornar { deleted: false, error } para contexto não registrado', async () => {
    const sandbox = criarSandbox();

    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-007', 'contexto-inexistente');

    assert.equal(resultado.deleted, false);
    assert.match(String(resultado.error), /contexto/i);
  });

});

// =============================================================
// Suite 3 — registrarContexto (extensibilidade)
// =============================================================

describe('ImageDeletionService — registrarContexto', () => {

  it('deve permitir registrar contexto customizado e usá-lo em excluir()', async () => {
    const handlerCustom = fn(async () => ({ error: null }));
    const sandbox = criarSandbox();

    sandbox.ImageDeletionService.registrarContexto('galeria', handlerCustom);
    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-008', 'galeria');

    assert.equal(resultado.deleted, true);
    assert.equal(handlerCustom.calls.length, 1);
    assert.deepEqual(handlerCustom.calls[0], ['img-uuid-008']);
  });

  it('contexto registrado não afeta o contexto padrão (portfolio)', async () => {
    const bffSpy = fn(async () => ({ error: null }));
    const sandbox = criarSandbox({ bffRemover: bffSpy });

    sandbox.ImageDeletionService.registrarContexto('outro', fn(async () => ({ error: null })));
    const resultado = await sandbox.ImageDeletionService.excluir('img-uuid-009');

    assert.equal(resultado.deleted, true);
    assert.equal(bffSpy.calls.length, 1, 'Contexto portfolio deve continuar usando BffApiService');
  });

});
