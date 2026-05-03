'use strict';

const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sandbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria sandbox com fetch e localStorage mockados.
 * @param {Function} fetchMock — função async(url, opts) => Response
 * @param {string|null} jwtToken — simula JWT no localStorage
 */
function criarSandbox(fetchMock, jwtToken = null) {
  const lsMock = {
    getItem: (k) =>
      k.includes('auth-token') && jwtToken
        ? JSON.stringify({ access_token: jwtToken })
        : null,
  };
  const sandbox = vm.createContext({
    console,
    localStorage: lsMock,
    fetch:         fetchMock,
    URLSearchParams,
    Error,
  });
  carregar(sandbox, 'shared/js/ApiService.js');
  return sandbox;
}

/** Resposta HTTP fake de sucesso */
function resOk(body) {
  return async () => ({
    ok:     true,
    status: 200,
    text:   async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json:   async () => body,
  });
}

/** Resposta HTTP fake de erro */
function resErro(status, body) {
  return async () => ({
    ok:     false,
    status,
    text:   async () => JSON.stringify(body),
    json:   async () => body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Suítes
// ─────────────────────────────────────────────────────────────────────────────

suite('ApiService.from() — GET', () => {

  test('gera URL com tabela, select, eq e limit', async () => {
    let url, opts;
    const sb = criarSandbox(async (u, o) => { url = u; opts = o; return resOk([{ id: '1' }])(); });

    const { data, error } = await sb.ApiService
      .from('barbershops')
      .select('id, name')
      .eq('is_active', 'true')
      .limit(10);

    assert.equal(error, null);
    assert.equal(data.length, 1);
    assert.equal(data[0].id, '1');
    assert.ok(url.includes('/rest/v1/barbershops'), 'URL deve conter tabela');
    assert.ok(decodeURIComponent(url).includes('is_active=eq.true'), 'filtro eq');
    assert.ok(url.includes('limit=10'), 'limit');
    assert.equal(opts.method, 'GET');
  });

  test('select() remove espaços após vírgulas (PostgREST rejeita espaços)', async () => {
    let url;
    const sb = criarSandbox(async (u) => { url = u; return resOk([])(); });

    await sb.ApiService.from('services').select('id, name, price, duration_min');

    const decoded = decodeURIComponent(url);
    assert.ok(!decoded.includes('id, name'), `espaços presentes (${decoded})`);
    assert.ok(decoded.includes('select=id,name,price,duration_min'), `sem espaços (${decoded})`);
  });


  test('headers sem JWT: apenas apikey presente', async () => {
    let headers;
    const sb = criarSandbox(async (u, o) => { headers = o.headers; return resOk([])(); });

    await sb.ApiService.from('barbershops').select('id');

    assert.ok('apikey' in headers, 'apikey obrigatório');
    assert.ok(!('Authorization' in headers), 'sem JWT = sem Authorization');
  });

  test('headers com JWT: Authorization Bearer injeta corretamente', async () => {
    let headers;
    const sb = criarSandbox(async (u, o) => { headers = o.headers; return resOk([])(); }, 'tok.en.jwt');

    await sb.ApiService.from('barbershops').select('id');

    assert.equal(headers['Authorization'], 'Bearer tok.en.jwt');
  });

  test('múltiplos .order() concatenam com vírgula', async () => {
    let url;
    const sb = criarSandbox(async (u) => { url = u; return resOk([])(); });

    await sb.ApiService.from('barbershops').select('id')
      .order('rating_score', { ascending: false })
      .order('likes_count',  { ascending: false });

    const decoded = decodeURIComponent(url);
    assert.ok(decoded.includes('order=rating_score.desc,likes_count.desc'), `ordem múltipla (URL: ${decoded})`);
  });

  test('.in() gera formato PostgREST in.(...)', async () => {
    let url;
    const sb = criarSandbox(async (u) => { url = u; return resOk([])(); });

    await sb.ApiService.from('queue_entries').select('id').in('status', ['waiting', 'in_service']);

    assert.ok(decodeURIComponent(url).includes('status=in.(waiting,in_service)'), `in() (URL: ${url})`);
  });

  test('.or() gera formato PostgREST or=(...)', async () => {
    let url;
    const sb = criarSandbox(async (u) => { url = u; return resOk([])(); });

    await sb.ApiService.from('barbershops')
      .select('id')
      .or('name.ilike.%barber%,city.ilike.%barber%');

    assert.ok(decodeURIComponent(url).includes('or=(name.ilike.%barber%'), `or() (URL: ${url})`);
  });

  test('.single() adiciona Accept: vnd.pgrst.object+json', async () => {
    let headers;
    const sb = criarSandbox(async (u, o) => { headers = o.headers; return resOk({ id: '1' })(); });

    await sb.ApiService.from('profiles').select('id').eq('id', 'x').single();

    assert.equal(headers['Accept'], 'application/vnd.pgrst.object+json');
  });

  test('.gte() e .lte() com mesmo campo geram dois params separados', async () => {
    let url;
    const sb = criarSandbox(async (u) => { url = u; return resOk([])(); });

    const inicio = new Date('2025-01-01').toISOString();
    const fim    = new Date('2025-01-31').toISOString();

    await sb.ApiService.from('appointments').select('id')
      .gte('scheduled_at', inicio)
      .lte('scheduled_at', fim);

    const decoded = decodeURIComponent(url);
    assert.ok(decoded.includes(`scheduled_at=gte.${inicio}`), 'gte presente');
    assert.ok(decoded.includes(`scheduled_at=lte.${fim}`),    'lte presente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

suite('ApiService.from() — INSERT / UPDATE / DELETE / UPSERT', () => {

  test('insert() usa POST com body JSON e Prefer return=representation', async () => {
    let url, opts;
    const sb = criarSandbox(async (u, o) => { url = u; opts = o; return resOk({ id: 'novo' })(); });

    const { data, error } = await sb.ApiService
      .from('appointments')
      .insert({ client_id: '123', status: 'pending' })
      .select('id')
      .single();

    assert.equal(error, null);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    assert.equal(opts.headers['Prefer'], 'return=representation');
    assert.deepStrictEqual(JSON.parse(opts.body), { client_id: '123', status: 'pending' });
    assert.ok(url.includes('select=id'), 'select após insert');
  });

  test('update() usa PATCH com filtro no URL e body JSON', async () => {
    let url, opts;
    const sb = criarSandbox(async (u, o) => { url = u; opts = o; return resOk({ id: '1', status: 'done' })(); });

    await sb.ApiService
      .from('appointments')
      .update({ status: 'done' })
      .eq('id', 'uuid-123')
      .select('id, status')
      .single();

    assert.equal(opts.method, 'PATCH');
    assert.ok(decodeURIComponent(url).includes('id=eq.uuid-123'), 'filtro PATCH no URL');
  });

  test('delete() usa DELETE com filtros no URL', async () => {
    let url, opts;
    const sb = criarSandbox(async (u, o) => { url = u; opts = o; return resOk([])(); });

    await sb.ApiService
      .from('barbershop_interactions')
      .delete()
      .eq('user_id', 'uid')
      .eq('barbershop_id', 'bid');

    assert.equal(opts.method, 'DELETE');
    const decoded = decodeURIComponent(url);
    assert.ok(decoded.includes('user_id=eq.uid'));
    assert.ok(decoded.includes('barbershop_id=eq.bid'));
  });

  test('upsert ignoreDuplicates=true envia Prefer resolution=ignore-duplicates', async () => {
    let opts;
    const sb = criarSandbox(async (u, o) => { opts = o; return resOk(null)(); });

    await sb.ApiService
      .from('barbershop_interactions')
      .upsert({ barbershop_id: 'b', user_id: 'u', type: 'like' }, { onConflict: 'barbershop_id,user_id,type', ignoreDuplicates: true });

    assert.ok(opts.headers['Prefer'].includes('ignore-duplicates'), `Prefer: ${opts.headers['Prefer']}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

suite('ApiService — tratamento de erros', () => {

  test('HTTP 4xx retorna { data: null, error } com status e message', async () => {
    const sb = criarSandbox(resErro(401, { message: 'JWT expired', code: 'JWT_EXPIRED' }));

    const { data, error } = await sb.ApiService.from('profiles').select('id');

    assert.equal(data, null);
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'JWT expired');
    assert.equal(error.status, 401);
  });

  test('HTTP 404/406 com code PGRST116 via maybeSingle() retorna { data: null, error: null }', async () => {
    const sb = criarSandbox(resErro(406, { code: 'PGRST116', message: 'no rows found' }));

    const { data, error } = await sb.ApiService
      .from('profiles')
      .select('id')
      .eq('id', 'nao-existe')
      .maybeSingle();

    assert.equal(data, null);
    assert.equal(error, null, 'maybeSingle não deve lançar erro em PGRST116');
  });

  test('falha de rede retorna { data: null, error } sem lançar exceção', async () => {
    const sb = criarSandbox(async () => { throw new Error('Network failure'); });

    const { data, error } = await sb.ApiService.from('profiles').select('id');

    assert.equal(data, null);
    assert.ok(error instanceof Error);
  });

  test('status 406 sem body retorna { data: null, error }', async () => {
    const sb = criarSandbox(async () => ({
      ok: false, status: 406,
      text: async () => '',
      json: async () => { throw new SyntaxError('not json'); },
    }));

    const { data, error } = await sb.ApiService.from('profiles').select('id').single();

    assert.equal(data, null);
    assert.ok(error instanceof Error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

suite('ApiService — URL helpers de Storage', () => {

  test('getAvatarUrl() gera URL pública do bucket avatars', () => {
    const sb = criarSandbox(async () => resOk([])());
    const url = sb.ApiService.getAvatarUrl('userId/avatar.jpeg');
    assert.ok(url.includes('/storage/v1/object/public/avatars/'));
    assert.ok(url.includes('userId/avatar.jpeg'));
  });

  test('getLogoUrl() gera URL pública do bucket barbershops', () => {
    const sb = criarSandbox(async () => resOk([])());
    const url = sb.ApiService.getLogoUrl('shopId/logo.png');
    assert.ok(url.includes('/storage/v1/object/public/barbershops/'));
    assert.ok(url.includes('shopId/logo.png'));
  });

  test('getPortfolioThumbUrl() gera URL pública do bucket portfolio', () => {
    const sb = criarSandbox(async () => resOk([])());
    const url = sb.ApiService.getPortfolioThumbUrl('x/thumb.jpg');
    assert.ok(url.includes('/storage/v1/object/public/portfolio/'));
  });

  test('retorna string vazia para path nulo ou vazio', () => {
    const sb = criarSandbox(async () => resOk([])());
    assert.equal(sb.ApiService.getAvatarUrl(null), '');
    assert.equal(sb.ApiService.getAvatarUrl(''), '');
    assert.equal(sb.ApiService.getLogoUrl(null), '');
    assert.equal(sb.ApiService.getPortfolioThumbUrl(null), '');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

suite('ApiService.resolveAvatarUrl()', () => {

  test('path relativo → aponta para bucket avatars', () => {
    const sb  = criarSandbox(async () => resOk([])());
    const url = sb.ApiService.resolveAvatarUrl('uuid/avatar.jpeg');
    assert.ok(url.includes('/storage/v1/object/public/avatars/'));
    assert.ok(url.includes('uuid/avatar.jpeg'));
  });

  test('URL completa (http) → usada diretamente sem alterar o path', () => {
    const sb       = criarSandbox(async () => resOk([])());
    const fullUrl  = 'https://jfvjisqnzapxxagkbxcu.supabase.co/storage/v1/object/public/media-images/avatars/uuid/file.webp';
    const resolved = sb.ApiService.resolveAvatarUrl(fullUrl);
    assert.ok(resolved.startsWith('https://'), 'deve manter protocolo https');
    assert.ok(resolved.includes('media-images'), 'deve manter bucket media-images');
    assert.ok(!resolved.includes('avatars/avatars'), 'não deve duplicar prefixo de bucket');
  });

  test('adiciona cache-bust ?t= quando updatedAt é fornecido', () => {
    const sb  = criarSandbox(async () => resOk([])());
    const ts  = new Date('2025-01-01T00:00:00.000Z').getTime();
    const url = sb.ApiService.resolveAvatarUrl('uuid/avatar.jpeg', '2025-01-01T00:00:00.000Z');
    assert.ok(url.includes(`?t=${ts}`), `cache-bust esperado ?t=${ts}, recebido: ${url}`);
  });

  test('URL completa + updatedAt → cache-bust adicionado sem duplicar ?', () => {
    const sb      = criarSandbox(async () => resOk([])());
    const fullUrl = 'https://supabase.co/storage/v1/object/public/media-images/avatars/uid/file.webp';
    const ts      = new Date('2025-06-01T00:00:00.000Z').getTime();
    const result  = sb.ApiService.resolveAvatarUrl(fullUrl, '2025-06-01T00:00:00.000Z');
    assert.ok(result.includes(`?t=${ts}`), `esperado ?t=${ts}`);
    assert.ok(!result.includes('??'), 'não deve conter ?? duplo');
  });

  test('path null ou vazio → retorna string vazia', () => {
    const sb = criarSandbox(async () => resOk([])());
    assert.equal(sb.ApiService.resolveAvatarUrl(null), '');
    assert.equal(sb.ApiService.resolveAvatarUrl(''), '');
    assert.equal(sb.ApiService.resolveAvatarUrl(undefined), '');
  });
});
