'use strict';

/**
 * tests/repositories.test.js
 *
 * Testes de segurança para a camada de repositórios.
 *
 * Verifica que os repositórios:
 *   1. Validam UUIDs antes de executar qualquer query (rejeita SQL injection como ID)
 *   2. Validam enums de status (rejeita strings não permitidas)
 *   3. Aplicam allowlist de campos nos payloads de escrita (previne mass assignment)
 *   4. Sanitizam campos de texto livre (remove null-bytes, enforce comprimento)
 *   5. Validam coordenadas geográficas (previne NaN/Infinity como lat/lng)
 *   6. Demonstram que strings SQL-like em campos de texto são armazenadas com
 *      segurança via queries parametrizadas (PostgREST — sem interpolação SQL)
 *
 * Runner: Jest — npm test
 *
 * Estratégia de isolamento:
 *   Cada fábrica cria um sandbox VM com SupabaseService mockado e
 *   InputValidator carregado da fonte real — sem estado compartilhado entre testes.
 */

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// UUIDs válidos para uso nos testes
const UUID_CLIENTE   = '00000000-0000-1000-8000-000000000001';
const UUID_PROF      = '00000000-0000-1000-8000-000000000002';
const UUID_SHOP      = '00000000-0000-1000-8000-000000000003';
const UUID_SERVICE   = '00000000-0000-1000-8000-000000000004';
const UUID_ENTRY     = '00000000-0000-1000-8000-000000000005';

// ─────────────────────────────────────────────────────────────────────────────
// INFRAESTRUTURA COMPARTILHADA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria um query builder mockado que cobre todos os padrões de chaining
 * usados pelos repositórios. Cada método retorna o mesmo objeto (chain) e
 * os terminais (single, maybeSingle) resolvem para `result`.
 * O objeto chain é também thenable — `await chain` resolve para `result`.
 */
function criarQueryBuilder(result = { data: null, error: null }) {
  const promise = Promise.resolve(result);

  const chain = {
    // Torna o chain diretamente awaitable
    then:        (res, rej) => promise.then(res, rej),
    catch:       rej        => promise.catch(rej),
    // Terminais com resultado explícito
    single:      jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    // Métodos chainable
    select:      jest.fn(),
    eq:          jest.fn(),
    gte:         jest.fn(),
    lte:         jest.fn(),
    in:          jest.fn(),
    neq:         jest.fn(),
    order:       jest.fn(),
    limit:       jest.fn(),
  };

  // Todos os métodos chainable retornam o mesmo objeto chain
  ['select', 'eq', 'gte', 'lte', 'in', 'neq', 'order', 'limit'].forEach(m => {
    chain[m].mockReturnValue(chain);
  });

  const builder = {
    select: jest.fn().mockReturnValue(chain),
    insert: jest.fn().mockReturnValue(chain),
    update: jest.fn().mockReturnValue(chain),
    delete: jest.fn().mockReturnValue(chain),
    upsert: jest.fn().mockResolvedValue(result),
    _chain: chain,
  };

  return builder;
}

/** Carrega um arquivo JS no sandbox VM e exporta todos os símbolos top-level. */
function carregar(sandbox, relPath) {
  const raw   = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const nomes = [...raw.matchAll(/^(?:class|const)\s+([A-Z][A-Za-z0-9_]*)/gm)].map(m => m[1]);
  const exp   = nomes.map(n => `if(typeof ${n}!=='undefined') globalThis.${n}=${n};`).join('\n');
  vm.runInContext(`${raw}\n${exp}`, sandbox);
}

// ─────────────────────────────────────────────────────────────────────────────
// FÁBRICAS DE REPOSITÓRIO
// ─────────────────────────────────────────────────────────────────────────────

function criarAppointmentRepo({ data = null, error = null } = {}) {
  const result         = { data, error };
  const apptBuilder    = criarQueryBuilder(result);
  const supabaseMock   = { appointments: jest.fn(() => apptBuilder) };

  const sandbox = vm.createContext({ console, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/AppointmentRepository.js');

  return { AppointmentRepository: sandbox.AppointmentRepository, apptBuilder, supabaseMock };
}

function criarProfileRepo({ data = null, error = null } = {}) {
  const result        = { data, error };
  const profBuilder   = criarQueryBuilder(result);
  const favBuilder    = criarQueryBuilder(result);
  const storeMock     = { upload: jest.fn().mockResolvedValue({ error: null }) };
  const supabaseMock  = {
    profiles:    jest.fn(() => profBuilder),
    favorites:   jest.fn(() => favBuilder),
    storageAvatars: jest.fn(() => storeMock),
    getAvatarUrl:   jest.fn(() => 'https://cdn.example.com/avatar.jpg'),
  };

  const sandbox = vm.createContext({ console, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/ProfileRepository.js');

  return { ProfileRepository: sandbox.ProfileRepository, profBuilder, favBuilder, supabaseMock };
}

function criarQueueRepo({ data = null, error = null } = {}) {
  const result       = { data, error };
  const queueBuilder = criarQueryBuilder(result);
  const chairBuilder = criarQueryBuilder(result);
  const supabaseMock = {
    queueEntries: jest.fn(() => queueBuilder),
    chairs:       jest.fn(() => chairBuilder),
    channel:      jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() })),
  };

  const sandbox = vm.createContext({ console, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/QueueRepository.js');

  return { QueueRepository: sandbox.QueueRepository, queueBuilder, supabaseMock };
}

function criarBarbershopRepo({ data = null, error = null } = {}) {
  const result        = { data, error };
  const shopBuilder   = criarQueryBuilder(result);
  const interBuilder  = criarQueryBuilder(result);
  const pubBuilder    = criarQueryBuilder(result);
  const supabaseMock  = {
    barbershops:            jest.fn(() => shopBuilder),
    barbershopInteractions: jest.fn(() => interBuilder),
    profilesPublic:         jest.fn(() => pubBuilder),
  };

  const sandbox = vm.createContext({ console, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/BarbershopRepository.js');

  return { BarbershopRepository: sandbox.BarbershopRepository, shopBuilder, interBuilder, supabaseMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// AppointmentRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('AppointmentRepository.updateStatus()', () => {
  test('executa update com UUID e status válidos', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY, status: 'confirmed' } });
    const r = await AppointmentRepository.updateStatus(UUID_ENTRY, 'confirmed');
    expect(r.status).toBe('confirmed');
    expect(apptBuilder.update).toHaveBeenCalled();
  });

  test('lança erro para SQL injection como id', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.updateStatus("'; DROP TABLE appointments; --", 'confirmed')
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para id numérico simples', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(AppointmentRepository.updateStatus('123', 'confirmed')).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para status fora do enum', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.updateStatus(UUID_ENTRY, "confirmed' OR '1'='1")
    ).rejects.toThrow(/Status inválido/);
  });

  test('lança erro para status SQL injection', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.updateStatus(UUID_ENTRY, '1; SELECT * FROM appointments')
    ).rejects.toThrow(/Status inválido/);
  });
});

describe('AppointmentRepository.criar()', () => {
  const payloadValido = () => ({
    client_id:       UUID_CLIENTE,
    professional_id: UUID_PROF,
    barbershop_id:   UUID_SHOP,
    service_id:      UUID_SERVICE,
    scheduled_at:    new Date().toISOString(),
    duration_min:    30,
    price_charged:   50,
    notes:           'Deixa o bigode',
  });

  test('cria agendamento com payload válido', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY } });
    const r = await AppointmentRepository.criar(payloadValido());
    expect(r.id).toBe(UUID_ENTRY);
    expect(apptBuilder.insert).toHaveBeenCalled();
  });

  test('lança erro para client_id com SQL injection', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.criar({ ...payloadValido(), client_id: "'; DROP TABLE appointments; --" })
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para professional_id inválido', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.criar({ ...payloadValido(), professional_id: '0 OR 1=1' })
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('descarta campos extras (previne mass assignment: role, is_admin)', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY } });
    await AppointmentRepository.criar({
      ...payloadValido(),
      role:     'admin',
      is_admin: true,
    });
    const inserido = apptBuilder.insert.mock.calls[0][0];
    expect(inserido).not.toHaveProperty('role');
    expect(inserido).not.toHaveProperty('is_admin');
  });

  test('lança erro para notes que excedem 500 caracteres', async () => {
    const { AppointmentRepository } = criarAppointmentRepo();
    await expect(
      AppointmentRepository.criar({ ...payloadValido(), notes: 'x'.repeat(501) })
    ).rejects.toThrow(/Máximo de 500/);
  });

  test('notas com strings SQL são armazenadas intactas via queries parametrizadas', async () => {
    // Prova que o Supabase não interpreta a string como SQL — apenas armazena como dado
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY } });
    const sqlLike = "'; DROP TABLE appointments; --";
    await AppointmentRepository.criar({ ...payloadValido(), notes: sqlLike });
    const inserido = apptBuilder.insert.mock.calls[0][0];
    expect(inserido.notes).toBe(sqlLike);
  });

  test('remove null-bytes das notas antes de inserir', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY } });
    await AppointmentRepository.criar({ ...payloadValido(), notes: 'nota\x00maliciosa' });
    const inserido = apptBuilder.insert.mock.calls[0][0];
    expect(inserido.notes).not.toContain('\x00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfileRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('ProfileRepository.update()', () => {
  test('atualiza perfil com dados válidos', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { full_name: 'Carlos Silva' });
    expect(profBuilder.update).toHaveBeenCalled();
  });

  test('lança erro para userId com SQL injection', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(
      ProfileRepository.update("1' OR '1'='1", { full_name: 'Carlos' })
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para userId vazio', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(ProfileRepository.update('', { full_name: 'Carlos' })).rejects.toThrow(/Identificador inválido/);
  });

  test('descarta campo "role" (mass assignment: tentativa de escalada de privilégio)', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { full_name: 'Carlos', role: 'admin' });
    const atualizado = profBuilder.update.mock.calls[0][0];
    expect(atualizado).not.toHaveProperty('role');
    expect(atualizado).toHaveProperty('full_name', 'Carlos');
  });

  test('descarta campo "is_active" para evitar desativação indevida via dados do usuário', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { full_name: 'Carlos', is_active: false });
    const atualizado = profBuilder.update.mock.calls[0][0];
    expect(atualizado).not.toHaveProperty('is_active');
  });

  test('lança erro para bio que excede 300 caracteres', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(
      ProfileRepository.update(UUID_CLIENTE, { bio: 'x'.repeat(301) })
    ).rejects.toThrow(/Máximo de 300/);
  });

  test('remove null-bytes do campo bio', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { bio: 'bio\x00legal' });
    const atualizado = profBuilder.update.mock.calls[0][0];
    expect(atualizado.bio).not.toContain('\x00');
  });

  test('lança erro quando todos os campos são bloqueados pela allowlist', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(
      ProfileRepository.update(UUID_CLIENTE, { role: 'admin', plan_type: 'pro' })
    ).rejects.toThrow(/Nenhum campo permitido/);
  });
});

describe('ProfileRepository.getById()', () => {
  test('aceita UUID válido', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo({ data: { id: UUID_CLIENTE } });
    const r = await ProfileRepository.getById(UUID_CLIENTE);
    expect(r.id).toBe(UUID_CLIENTE);
  });

  test('lança erro para UUID com SQL injection', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(
      ProfileRepository.getById("'; DROP TABLE profiles; --")
    ).rejects.toThrow(/Identificador inválido/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QueueRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('QueueRepository.updateStatus()', () => {
  test('atualiza status com UUID e status válidos', async () => {
    const { QueueRepository, queueBuilder } = criarQueueRepo({ data: { id: UUID_ENTRY, status: 'done', position: 1 } });
    const r = await QueueRepository.updateStatus(UUID_ENTRY, 'done');
    expect(r.status).toBe('done');
  });

  test('lança erro para id com SQL injection', async () => {
    const { QueueRepository } = criarQueueRepo();
    await expect(
      QueueRepository.updateStatus("'; DROP TABLE queue_entries; --", 'done')
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para status inválido', async () => {
    const { QueueRepository } = criarQueueRepo();
    await expect(
      QueueRepository.updateStatus(UUID_ENTRY, "done' UNION SELECT * FROM profiles--")
    ).rejects.toThrow(/Status inválido/);
  });
});

describe('QueueRepository.entrar()', () => {
  const payloadValido = () => ({
    barbershop_id: UUID_SHOP,
    client_id:     UUID_CLIENTE,
    position:      1,
  });

  test('adiciona cliente à fila com payload válido', async () => {
    const { QueueRepository, queueBuilder } = criarQueueRepo({ data: { id: UUID_ENTRY, position: 1 } });
    const r = await QueueRepository.entrar(payloadValido());
    expect(r.position).toBe(1);
  });

  test('lança erro para barbershop_id com SQL injection', async () => {
    const { QueueRepository } = criarQueueRepo();
    await expect(
      QueueRepository.entrar({ ...payloadValido(), barbershop_id: "'; DROP TABLE queue_entries; --" })
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para client_id inválido', async () => {
    const { QueueRepository } = criarQueueRepo();
    await expect(
      QueueRepository.entrar({ ...payloadValido(), client_id: '1 OR 1=1' })
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('descarta campos extras (mass assignment: admin, status, role)', async () => {
    const { QueueRepository, queueBuilder } = criarQueueRepo({ data: { id: UUID_ENTRY, position: 1 } });
    await QueueRepository.entrar({ ...payloadValido(), admin: true, role: 'superuser' });
    const inserido = queueBuilder.insert.mock.calls[0][0];
    expect(inserido).not.toHaveProperty('admin');
    expect(inserido).not.toHaveProperty('role');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BarbershopRepository
// ─────────────────────────────────────────────────────────────────────────────
describe('BarbershopRepository.getNearby()', () => {
  test('executa query com coordenadas válidas', async () => {
    const { BarbershopRepository, shopBuilder } = criarBarbershopRepo({ data: [] });
    const r = await BarbershopRepository.getNearby(-23.5505, -46.6333, 3);
    expect(Array.isArray(r)).toBe(true);
    expect(shopBuilder.select).toHaveBeenCalled();
  });

  test('lança erro para latitude NaN', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(NaN, -46.6333)).rejects.toThrow(/Coordenadas inválidas/);
  });

  test('lança erro para longitude Infinity', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(-23.5505, Infinity)).rejects.toThrow(/Coordenadas inválidas/);
  });

  test('lança erro para latitude fora do range (-90 a 90)', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(91, 0)).rejects.toThrow(/Latitude fora/);
    await expect(BarbershopRepository.getNearby(-91, 0)).rejects.toThrow(/Latitude fora/);
  });

  test('lança erro para longitude fora do range (-180 a 180)', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(0, 181)).rejects.toThrow(/Longitude fora/);
  });

  test('lança erro para radiusKm negativo', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(-23.5505, -46.6333, -1)).rejects.toThrow(/radiusKm fora/);
  });

  test('lança erro para radiusKm maior que 100 km', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(BarbershopRepository.getNearby(-23.5505, -46.6333, 101)).rejects.toThrow(/radiusKm fora/);
  });
});

describe('BarbershopRepository.addInteraction()', () => {
  test('adiciona interação com parâmetros válidos', async () => {
    const { BarbershopRepository, interBuilder } = criarBarbershopRepo();
    await BarbershopRepository.addInteraction(UUID_SHOP, UUID_CLIENTE, 'like');
    expect(interBuilder.insert).toHaveBeenCalled();
  });

  test('lança erro para barbershopId com SQL injection', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(
      BarbershopRepository.addInteraction("'; DROP TABLE barbershop_interactions; --", UUID_CLIENTE, 'like')
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para userId inválido', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(
      BarbershopRepository.addInteraction(UUID_SHOP, '0 OR 1=1', 'like')
    ).rejects.toThrow(/Identificador inválido/);
  });

  test('lança erro para type com SQL injection', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(
      BarbershopRepository.addInteraction(UUID_SHOP, UUID_CLIENTE, "like' OR '1'='1")
    ).rejects.toThrow(/não é um valor/);
  });

  test('lança erro para type não permitido', async () => {
    const { BarbershopRepository } = criarBarbershopRepo();
    await expect(
      BarbershopRepository.addInteraction(UUID_SHOP, UUID_CLIENTE, 'admin')
    ).rejects.toThrow(/não é um valor/);
  });
});
