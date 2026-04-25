'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Query builder fluente (substitui fn() chain)
// ─────────────────────────────────────────────────────────────────────────────

function criarQueryBuilder(result) {
  const chain = {
    single:  fn().mockResolvedValue(result),
    select:  fn(), insert: fn(), update: fn(), delete: fn(),
    eq:      fn(), neq:    fn(), gt:     fn(), lt:      fn(),
    gte:     fn(), lte:    fn(), in:     fn(), is:      fn(),
    order:   fn(), limit:  fn(), range:  fn(), filter:  fn(),
    match:   fn(), not:    fn(), or:     fn(), returns: fn(),
    upsert:  fn(), maybeSingle: fn().mockResolvedValue(result),
  };
  const chainMethods = [
    'select','insert','update','delete','eq','neq','gt','lt',
    'gte','lte','in','is','order','limit','range','filter',
    'match','not','or','returns','upsert',
  ];
  for (const m of chainMethods) chain[m].mockReturnValue(chain);
  return chain;
}

// ─────────────────────────────────────────────────────────────────────────────
// FÁBRICAS DE REPOSITÓRIO
// ─────────────────────────────────────────────────────────────────────────────

function criarAppointmentRepo({ data = null, error = null } = {}) {
  const result         = { data, error };
  const apptBuilder    = criarQueryBuilder(result);
  const apiMock        = { from: fn().mockReturnValue(apptBuilder) };

  const sandbox = vm.createContext({ console, ApiService: apiMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/AppointmentRepository.js');

  return { AppointmentRepository: sandbox.AppointmentRepository, apptBuilder, apiMock };
}

function criarProfileRepo({ data = null, error = null } = {}) {
  const result        = { data, error };
  const profBuilder   = criarQueryBuilder(result);
  const storeMock     = { upload: fn().mockResolvedValue({ error: null }) };
  const apiMock       = {
    from:          fn().mockReturnValue(profBuilder),
    getAvatarUrl:  fn(() => 'https://cdn.example.com/avatar.jpg'),
  };
  const supabaseMock  = {
    storageAvatars: fn(() => storeMock),
  };

  const sandbox = vm.createContext({ console, ApiService: apiMock, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/ProfileRepository.js');

  return { ProfileRepository: sandbox.ProfileRepository, profBuilder, apiMock };
}

function criarQueueRepo({ data = null, error = null } = {}) {
  const result       = { data, error };
  const queueBuilder = criarQueryBuilder(result);
  const chairBuilder = criarQueryBuilder(result);
  const apiMock      = {
    from: fn((table) => table === 'chairs' ? chairBuilder : queueBuilder),
  };
  const supabaseMock = {
    channel: fn(() => ({ on: fn().mockReturnThis(), subscribe: fn() })),
  };

  const sandbox = vm.createContext({ console, ApiService: apiMock, SupabaseService: supabaseMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/QueueRepository.js');

  return { QueueRepository: sandbox.QueueRepository, queueBuilder, apiMock };
}

function criarBarbershopRepo({ data = null, error = null } = {}) {
  const result        = { data, error };
  const shopBuilder   = criarQueryBuilder(result);
  const interBuilder  = criarQueryBuilder(result);
  const pubBuilder    = criarQueryBuilder(result);
  const apiMock       = {
    from: fn((table) => {
      if (table === 'barbershop_interactions') return interBuilder;
      if (table === 'profiles_public')        return pubBuilder;
      return shopBuilder;
    }),
  };

  const sandbox = vm.createContext({ console, ApiService: apiMock });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/BarbershopRepository.js');

  return { BarbershopRepository: sandbox.BarbershopRepository, shopBuilder, interBuilder, apiMock };
}

// ─────────────────────────────────────────────────────────────────────────────
// AppointmentRepository
// ─────────────────────────────────────────────────────────────────────────────
suite('AppointmentRepository.updateStatus()', () => {
  test('executa update com UUID e status válidos', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY, status: 'confirmed' } });
    const r = await AppointmentRepository.updateStatus(UUID_ENTRY, 'confirmed');
    assert.strictEqual(r.status, 'confirmed');
    assert.ok(apptBuilder.update.calls.length > 0);
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

suite('AppointmentRepository.criar()', () => {
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
    assert.strictEqual(r.id, UUID_ENTRY);
    assert.ok(apptBuilder.insert.calls.length > 0);
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
    const inserido = apptBuilder.insert.calls[0][0];
    assert.ok(!Object.prototype.hasOwnProperty.call(inserido, 'role'));
    assert.ok(!Object.prototype.hasOwnProperty.call(inserido, 'is_admin'));
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
    const inserido = apptBuilder.insert.calls[0][0];
    assert.strictEqual(inserido.notes, sqlLike);
  });

  test('remove null-bytes das notas antes de inserir', async () => {
    const { AppointmentRepository, apptBuilder } = criarAppointmentRepo({ data: { id: UUID_ENTRY } });
    await AppointmentRepository.criar({ ...payloadValido(), notes: 'nota\x00maliciosa' });
    const inserido = apptBuilder.insert.calls[0][0];
    assert.ok(!(inserido.notes).includes('\x00'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfileRepository
// ─────────────────────────────────────────────────────────────────────────────
suite('ProfileRepository.update()', () => {
  test('atualiza perfil com dados válidos', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { full_name: 'Carlos Silva' });
    assert.ok(profBuilder.update.calls.length > 0);
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
    const atualizado = profBuilder.update.calls[0][0];
    assert.ok(!Object.prototype.hasOwnProperty.call(atualizado, 'role'));
    assert.strictEqual(atualizado['full_name'], 'Carlos');
  });

  test('descarta campo "is_active" para evitar desativação indevida via dados do usuário', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo();
    await ProfileRepository.update(UUID_CLIENTE, { full_name: 'Carlos', is_active: false });
    const atualizado = profBuilder.update.calls[0][0];
    assert.ok(!Object.prototype.hasOwnProperty.call(atualizado, 'is_active'));
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
    const atualizado = profBuilder.update.calls[0][0];
    assert.ok(!(atualizado.bio).includes('\x00'));
  });

  test('lança erro quando todos os campos são bloqueados pela allowlist', async () => {
    const { ProfileRepository } = criarProfileRepo();
    await expect(
      ProfileRepository.update(UUID_CLIENTE, { role: 'admin', plan_type: 'pro' })
    ).rejects.toThrow(/Nenhum campo permitido/);
  });
});

suite('ProfileRepository.getById()', () => {
  test('aceita UUID válido', async () => {
    const { ProfileRepository, profBuilder } = criarProfileRepo({ data: { id: UUID_CLIENTE } });
    const r = await ProfileRepository.getById(UUID_CLIENTE);
    assert.strictEqual(r.id, UUID_CLIENTE);
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
suite('QueueRepository.updateStatus()', () => {
  test('atualiza status com UUID e status válidos', async () => {
    const { QueueRepository, queueBuilder } = criarQueueRepo({ data: { id: UUID_ENTRY, status: 'done', position: 1 } });
    const r = await QueueRepository.updateStatus(UUID_ENTRY, 'done');
    assert.strictEqual(r.status, 'done');
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

suite('QueueRepository.entrar()', () => {
  const payloadValido = () => ({
    barbershop_id: UUID_SHOP,
    client_id:     UUID_CLIENTE,
    position:      1,
  });

  test('adiciona cliente à fila com payload válido', async () => {
    const { QueueRepository, queueBuilder } = criarQueueRepo({ data: { id: UUID_ENTRY, position: 1 } });
    const r = await QueueRepository.entrar(payloadValido());
    assert.strictEqual(r.position, 1);
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
    const inserido = queueBuilder.insert.calls[0][0];
    assert.ok(!Object.prototype.hasOwnProperty.call(inserido, 'admin'));
    assert.ok(!Object.prototype.hasOwnProperty.call(inserido, 'role'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BarbershopRepository
// ─────────────────────────────────────────────────────────────────────────────
suite('BarbershopRepository.getNearby()', () => {
  test('executa query com coordenadas válidas', async () => {
    const { BarbershopRepository, shopBuilder } = criarBarbershopRepo({ data: [] });
    const r = await BarbershopRepository.getNearby(-23.5505, -46.6333, 3);
    assert.strictEqual(Array.isArray(r), true);
    assert.ok(shopBuilder.select.calls.length > 0);
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

suite('BarbershopRepository.addInteraction()', () => {
  test('adiciona interação com parâmetros válidos', async () => {
    const { BarbershopRepository, interBuilder } = criarBarbershopRepo();
    await BarbershopRepository.addInteraction(UUID_SHOP, UUID_CLIENTE, 'like');
    assert.ok(interBuilder.insert.calls.length > 0);
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
