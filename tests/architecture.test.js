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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function src(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

/**
 * Coleta recursivamente todos os .js sob `dir`, exceto vendor/gerados.
 * @param {string} dir
 * @param {string[]} [acc]
 * @returns {string[]} caminhos absolutos
 */
function coletarJs(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === 'dist' || nome.endsWith('.min.js')) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) coletarJs(full, acc);
    else if (nome.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * Remove comentários de bloco e de linha para o guard não confundir exemplos
 * de documentação (ex.: o uso mostrado no cabeçalho do FluxoDeFila.js) com
 * código real. O `[^:]` evita cortar `https://` dentro de strings.
 * @param {string} codigo
 * @returns {string}
 */
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * A partir do índice de uma `{`, devolve a substring do bloco `{...}` balanceado.
 * Simplificação estática (não trata `{` dentro de strings/regex), suficiente para
 * os objetos-config deste projeto.
 * @param {string} codigo
 * @param {number} aberturaIdx — índice de um caractere '{'
 * @returns {string}
 */
function blocoBalanceado(codigo, aberturaIdx) {
  let depth = 0;
  for (let i = aberturaIdx; i < codigo.length; i++) {
    if (codigo[i] === '{') depth++;
    else if (codigo[i] === '}' && --depth === 0) return codigo.slice(aberturaIdx, i + 1);
  }
  return codigo.slice(aberturaIdx);
}

// ─── describe 1: domain — isolamento puro ────────────────────────────────────────

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

// ─── describe 2: application — services sem fetch direto ─────────────────────────

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

// ─── describe 3: infra — repositórios usam ApiService, nunca fetch direto ────────

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

// ─── describe 4: interfaces — controllers sem acesso direto a repositórios ───────

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

// ─── describe 5: FluxoDeFila — todo modal precisa de `id` (guard anti-vazamento) ──
//
// FluxoDeFila.#criar() só evita acúmulo de listener (keydown no document) quando
// o config traz `id` — o dedup remove o overlay órfão anterior antes de reabrir.
// Sem `id`, um overlay que nunca feche corretamente (app minimizado, conexão
// perdida, navegação fora do botão de fechar) vaza globalmente na SPA.
//
// Este guard falha no CI se QUALQUER config de FluxoDeFila for adicionado sem
// `id` — detectado por SHAPE (titulo + corpo + acoes), cobrindo tanto chamadas
// inline `FluxoDeFila.abrir({...})` quanto builders (`montarPayload*`,
// `#buildConfig`, `#configModal`, …), independentemente do nome do método.

describe('FluxoDeFila — todo config de modal deve ter id (anti-vazamento)', () => {
  const DIRS = ['shared/js', 'apps/cliente/assets/js', 'apps/profissional/assets/js'];
  const ARQUIVOS = DIRS.flatMap(d => coletarJs(join(ROOT, d)));

  const TEM_ID    = /\bid\s*:/;
  const ASSINATURA = { titulo: /\btitulo\s*:/, corpo: /\bcorpo\s*:/, acoes: /\bacoes\s*:/ };

  /** True se o bloco `{...}` tem a assinatura de um config de FluxoDeFila. */
  function ehConfigFluxoDeFila(bloco) {
    return ASSINATURA.titulo.test(bloco) && ASSINATURA.corpo.test(bloco) && ASSINATURA.acoes.test(bloco);
  }

  /** Todos os blocos `{...}` que parecem config de FluxoDeFila no código. */
  function configsNoCodigo(codigo) {
    const blocos = [];
    // Abre por `FluxoDeFila.abrir({` (inline) ou por `return {` (builders).
    const gatilhos = [/FluxoDeFila\.abrir\(\s*\{/g, /\breturn\s*\{/g];
    for (const re of gatilhos) {
      let m;
      while ((m = re.exec(codigo)) !== null) {
        const abertura = codigo.indexOf('{', m.index);
        if (abertura === -1) continue;
        const bloco = blocoBalanceado(codigo, abertura);
        if (ehConfigFluxoDeFila(bloco)) blocos.push(bloco);
      }
    }
    return blocos;
  }

  it('nenhum config de FluxoDeFila (inline ou builder) é criado sem id', () => {
    const infratores = [];
    for (const arquivo of ARQUIVOS) {
      const codigo = semComentarios(readFileSync(arquivo, 'utf8'));
      if (!codigo.includes('acoes')) continue; // atalho: pula arquivos sem modais
      for (const bloco of configsNoCodigo(codigo)) {
        if (!TEM_ID.test(bloco)) {
          infratores.push(relative(ROOT, arquivo).split(sep).join('/'));
          break; // 1 ocorrência por arquivo basta para apontar o infrator
        }
      }
    }
    assert.deepEqual(
      infratores, [],
      'config de FluxoDeFila sem `id` (vazamento de listener) em: ' + infratores.join(', '),
    );
  });

  it('o guard reconhece a assinatura de config (sanidade do detector)', () => {
    // Se este teste falhar, o detector parou de reconhecer a assinatura e o
    // guard acima estaria passando por vacuidade (falsos negativos).
    const exemplo = `FluxoDeFila.abrir({ titulo: 'x', corpo: 'y', acoes: [] })`;
    assert.equal(configsNoCodigo(exemplo).length, 1, 'detector deve achar o config de exemplo');
    const semId = configsNoCodigo(exemplo).every(b => !/\bid\s*:/.test(b));
    assert.ok(semId, 'exemplo sem id deve ser detectado como sem id');
  });
});
