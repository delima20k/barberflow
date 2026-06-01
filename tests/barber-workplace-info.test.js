'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('./_helpers');

const WORKPLACE_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarberWorkplaceInfo.js'), 'utf8');
const BARBEIRO_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeiroPage.js'), 'utf8');
const BARBEARIA_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarbeariaPage.js'), 'utf8');

describe('BarberWorkplaceInfo - card da barbearia', () => {
  test('deve aplicar imagem da barbearia como background do card', () => {
    assert.match(WORKPLACE_JS, /--beiro-workplace-bg/);
    assert.match(WORKPLACE_JS, /style\.setProperty/);
    assert.match(WORKPLACE_JS, /coverPath/);
    assert.match(WORKPLACE_JS, /logoPath/);
    assert.match(WORKPLACE_JS, /\/shared\/img\/Logo01\.png/);
  });

  test('deve indicar quando a barbearia pertence ao barbeiro dono', () => {
    assert.match(WORKPLACE_JS, /isOwnerWorkplace/);
    assert.match(WORKPLACE_JS, /Essa e a barbearia dele/);
  });

  test('deve manter botao de mensagem para a barbearia', () => {
    assert.match(WORKPLACE_JS, /beiro-workplace-message/);
    assert.match(WORKPLACE_JS, /Mensagem para a barbearia/);
    assert.doesNotMatch(WORKPLACE_JS, /workplace-message-owner|owner-workplace-message|barbershop-owner-message/);
  });

  test('deve reutilizar o mesmo handler de mensagem mudando apenas o perfil recebido', () => {
    assert.match(WORKPLACE_JS, /btn\.addEventListener\('click', \(\) => this\.#onMessage\?\.\(profile\)\)/);
    assert.match(BARBEIRO_JS, /new BarberWorkplaceInfo\(this\.#refs\.workplace, \(\) => this\.#iniciarMensagemBarbearia\(\)\)/);
    assert.match(BARBEIRO_JS, /BffApiService\.profissionais\.iniciarMensagemBarbearia\(this\.#barberoId\)/);
  });
});

describe('BarbeiroPage e BarbeariaPage - destaque do barbeiro', () => {
  test('BarbeiroPage deve enriquecer perfil sem barbearia antes de renderizar workplace e mensagem', () => {
    assert.match(BARBEIRO_JS, /#garantirBarbeariaPerfil/);
    assert.match(BARBEIRO_JS, /getWorkplaceByProfessionalId/);
  });

  test('BarbeiroPage deve enriquecer tambem perfil vindo do cache', () => {
    assert.match(BARBEIRO_JS, /CacheManager\.get\(`\$\{id\}:barbeiro`\)/);
    assert.match(BARBEIRO_JS, /if \(profile\) \{\s*profile = await BarbeiroPage\.#garantirBarbeariaPerfil/s);
  });

  test('BarbeiroPage deve normalizar campos publicos de workplace vindos do BFF', () => {
    assert.match(BARBEIRO_JS, /logoPath/);
    assert.match(BARBEIRO_JS, /coverPath/);
    assert.match(BARBEIRO_JS, /isOwnerWorkplace/);
    assert.match(BARBEIRO_JS, /professionalId/);
  });

  test('BarbeariaPage.abrirPorId deve aceitar highlightBarberId opcional', () => {
    assert.match(BARBEARIA_JS, /async abrirPorId\(id,\s*\{\s*highlightBarberId\s*=\s*null\s*\}\s*=\s*\{\}\)/);
    assert.match(BARBEARIA_JS, /this\.#highlightBarberId\s*=\s*InputValidator\.uuid\(highlightBarberId\)\.ok/);
  });

  test('BarbeariaPage deve permitir mensagem no perfil publico para profissional logado', () => {
    assert.match(BARBEARIA_JS, /if \(shop\.whatsapp\) \{\s*const digits = shop\.whatsapp\.replace/s);
    assert.doesNotMatch(BARBEARIA_JS, /!isProfissional && shop\.whatsapp/);
  });

  test('BarbeariaPage deve manter cadeira e atendimento restritos ao cliente', () => {
    assert.match(BARBEARIA_JS, /#onCadeiraClick[\s\S]*ClienteController\.podeInteragir\(\)/);
    assert.match(BARBEARIA_JS, /#onProducaoClick[\s\S]*ClienteController\.podeInteragir\(\)/);
    assert.match(BARBEARIA_JS, /#onProducaoArrivingClick[\s\S]*ClienteController\.podeInteragir\(\)/);
  });
});

describe('BarbershopRepository - workplace principal', () => {
  const REPO_JS = fs.readFileSync(path.join(ROOT, 'shared/js/BarbershopRepository.js'), 'utf8');

  test('deve buscar barbearia propria antes de parceria ativa no fallback frontend', () => {
    assert.match(REPO_JS, /getWorkplaceByProfessionalId/);
    assert.match(REPO_JS, /\.eq\('owner_id', professionalId\)/);
    assert.match(REPO_JS, /professional_shop_links/);
    assert.match(REPO_JS, /#toWorkplaceInfo\(own,\s*true,\s*professionalId\)/);
  });
});
