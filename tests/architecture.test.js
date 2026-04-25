/**
 * tests/architecture.test.js
 *
 * Validação estática das fronteiras de camada (DDD: domain / application / infra / interfaces).
 * Não usa sandbox VM — lê os arquivos-fonte com fs.readFileSync e aplica regex.
 *
 * Exceções intencionais documentadas:
 *  - MessageService, NotificationService, MediaP2P: acessam Supabase Realtime/Storage diretamente (não testados aqui)
 *  - QueueRepository: usa Supabase Realtime diretamente (não testado aqui)
 *  - BarbershopService: usa SupabaseService.getUser() para auth — cross-cutting concern aceito
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function src(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

// ─── Suite 1: domain — isolamento puro ────────────────────────────────────────

describe('domain — isolamento puro', () => {
  const PROIBIDOS = /ApiService|Repository|SupabaseService|fetch\(|localStorage|document\./;

  it('Cliente.js não referencia infraestrutura nem DOM', () => {
    const codigo = src('shared/js/Cliente.js');
    assert.ok(
      !PROIBIDOS.test(codigo),
      'Cliente.js contém referência proibida: ' + (codigo.match(PROIBIDOS)?.[0])
    );
  });

  it('Agendamento.js não referencia infraestrutura nem DOM', () => {
    const codigo = src('shared/js/Agendamento.js');
    assert.ok(
      !PROIBIDOS.test(codigo),
      'Agendamento.js contém referência proibida: ' + (codigo.match(PROIBIDOS)?.[0])
    );
  });
});

// ─── Suite 2: application — services sem fetch direto ─────────────────────────

describe('application — services sem fetch direto', () => {
  const TEM_FETCH = /\bfetch\(/;

  it('PlanosService.js não chama fetch() diretamente', () => {
    const codigo = src('apps/profissional/assets/js/PlanosService.js');
    assert.ok(!TEM_FETCH.test(codigo), 'PlanosService.js contém fetch() direto');
  });

  it('LegalConsentService.js não chama fetch() diretamente', () => {
    const codigo = src('apps/profissional/assets/js/LegalConsentService.js');
    assert.ok(!TEM_FETCH.test(codigo), 'LegalConsentService.js contém fetch() direto');
  });

  it('GeoService.js não chama fetch() diretamente', () => {
    const codigo = src('shared/js/GeoService.js');
    assert.ok(!TEM_FETCH.test(codigo), 'GeoService.js contém fetch() direto');
  });

  it('LgpdService.js não chama fetch() diretamente', () => {
    const codigo = src('shared/js/LgpdService.js');
    assert.ok(!TEM_FETCH.test(codigo), 'LgpdService.js contém fetch() direto');
  });
});

// ─── Suite 3: infra — repositórios usam ApiService, nunca fetch direto ────────

describe('infra — repositórios sem fetch direto', () => {
  const TEM_FETCH = /\bfetch\(/;

  it('AppointmentRepository.js não chama fetch() diretamente', () => {
    const codigo = src('shared/js/AppointmentRepository.js');
    assert.ok(!TEM_FETCH.test(codigo), 'AppointmentRepository.js contém fetch() direto');
  });

  it('BarbershopRepository.js não chama fetch() diretamente', () => {
    const codigo = src('shared/js/BarbershopRepository.js');
    assert.ok(!TEM_FETCH.test(codigo), 'BarbershopRepository.js contém fetch() direto');
  });

  it('ProfileRepository.js não chama fetch() diretamente', () => {
    const codigo = src('shared/js/ProfileRepository.js');
    assert.ok(!TEM_FETCH.test(codigo), 'ProfileRepository.js contém fetch() direto');
  });

  it('ClienteRepository.js não chama fetch() diretamente', () => {
    const codigo = src('apps/cliente/assets/js/ClienteRepository.js');
    assert.ok(!TEM_FETCH.test(codigo), 'ClienteRepository.js contém fetch() direto');
  });
});

// ─── Suite 4: interfaces — controllers sem acesso direto a repositórios ───────

describe('interfaces — controllers sem acesso a repositórios', () => {
  const REPOS = /AppointmentRepository|BarbershopRepository|ProfileRepository|QueueRepository|ClienteRepository/;

  it('PlanosController.js não referencia repositórios diretamente', () => {
    const codigo = src('apps/profissional/assets/js/controllers/PlanosController.js');
    assert.ok(
      !REPOS.test(codigo),
      'PlanosController.js referencia repositório: ' + (codigo.match(REPOS)?.[0])
    );
  });

  it('TermosController.js não referencia repositórios diretamente', () => {
    const codigo = src('apps/profissional/assets/js/controllers/TermosController.js');
    assert.ok(
      !REPOS.test(codigo),
      'TermosController.js referencia repositório: ' + (codigo.match(REPOS)?.[0])
    );
  });
});
