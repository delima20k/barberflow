'use strict';
/**
 * scripts/migrar-testes.js
 * Reescreve os arquivos de teste de Jest para node:test + node:assert/strict.
 * Execute: node scripts/migrar-testes.js
 */

const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const HEADER = `'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { fn, carregar } = require('./_helpers.js');
`;

/** Remove blocos de imports já existentes no topo do arquivo */
function limparImports(c) {
  // Remove linhas "const X = require(...)" no topo (antes do primeiro function/suite/describe)
  return c.replace(/^(?:'use strict';\s*\n)?(?:\/\*[\s\S]*?\*\/\s*)?\n*((?:const\s+\S.*?require\([^)]+\);\s*\n)+)/gm, '');
}

/** Corrige header corrompido (literal \n) */
function corrigirLiteralNewlines(c) {
  // Se a primeira linha tem \n literais, o arquivo está corrompido
  if (c.startsWith("'use strict';\\n")) {
    c = c.replace(/\\n/g, '\n');
  }
  return c;
}

/** Substitui padrões Jest por node:test + node:assert/strict */
function transformar(c) {
  // 0. Corrigir newlines literais (arquivo corrompido)
  c = corrigirLiteralNewlines(c);

  // 1. Remove cabeçalhos antigos (comentário + imports antigos)
  // Remove o bloco de comentário de cabeçalho (/** ... */ antes dos requires)
  c = c.replace(/^'use strict';\s*\n\/\*\*[\s\S]*?\*\/\s*\n/, "'use strict';\n");
  // Remove imports de node:vm, node:fs, node:path, node:assert antigos
  c = c.replace(/^const\s+(?:assert|vm|fs|path|\{[^}]+\})\s*=\s*require\([^)]+\);\n/gm, '');
  // Remove const ROOT = ...
  c = c.replace(/^const\s+ROOT\s*=\s*path\.resolve[^\n]+;\n/gm, '');
  // Remove a função carregar() inline (duplicada com _helpers.js)
  c = c.replace(/(?:\/\*\*[\s\S]*?\*\/\n)?function carregar\(sandbox, relPath\) \{[\s\S]*?\n\}\n\n?/g, '');
  // Remove 'use strict'; duplicados
  c = c.replace(/^'use strict';\s*\n/gm, '');
  // Remove o bloco do comment "Runner: Jest"
  c = c.replace(/\/\*\*[^*]*Runner: Jest[\s\S]*?\*\/\s*\n/g, '');

  // Adiciona cabeçalho correto no topo
  c = HEADER + '\n' + c.replace(/^\s+/, '');

  // 2. describe( → suite(
  c = c.replace(/\bdescribe\(/g, 'suite(');

  // 3. jest.fn() → fn()
  c = c.replace(/jest\.fn\(\)/g, 'fn()');
  c = c.replace(/jest\.fn\(([^)]+)\)/g, 'fn($1)');

  // 4. .mock.calls → .calls
  c = c.replace(/\.mock\.calls\[(\d+)\]\[(\d+)\]/g, '.calls[$1][$2]');
  c = c.replace(/\.mock\.calls\[(\d+)\]/g, '.calls[$1]');
  c = c.replace(/\.mock\.calls\.length/g, '.calls.length');

  // 5. Matchers Jest → node:assert/strict
  // Ordem importa: not.X antes de X simples

  // await expect(p).rejects.toThrow(x) → await assert.rejects(p, x)
  c = c.replace(/await\s+expect\(([^)]+)\)\.rejects\.toThrow\(([^)]+)\)/g, 'await assert.rejects($1, $2)');

  // expect(() => fn).not.toThrow() → assert.doesNotThrow(() => fn)
  c = c.replace(/expect\((\([^)]*\)\s*=>.*?)\)\.not\.toThrow\(\)/g, 'assert.doesNotThrow($1)');

  // expect(() => fn).toThrow(x) → assert.throws(() => fn, x)
  c = c.replace(/expect\((\([^)]*\)\s*=>.*?)\)\.toThrow\(([^)]+)\)/g, 'assert.throws($1, $2)');

  // expect(x).not.toHaveBeenCalled() → assert.strictEqual(x.calls.length, 0)
  c = c.replace(/expect\(([^)]+)\)\.not\.toHaveBeenCalled\(\)/g, 'assert.strictEqual($1.calls.length, 0)');

  // expect(x).toHaveBeenCalledTimes(n) → assert.strictEqual(x.calls.length, n)
  c = c.replace(/expect\(([^)]+)\)\.toHaveBeenCalledTimes\((\d+)\)/g, 'assert.strictEqual($1.calls.length, $2)');

  // expect(x).toHaveBeenCalled() → assert.ok(x.calls.length > 0)
  c = c.replace(/expect\(([^)]+)\)\.toHaveBeenCalled\(\)/g, 'assert.ok($1.calls.length > 0)');

  // expect(x).toHaveBeenCalledWith(a, b) → assert.deepStrictEqual(x.calls[x.calls.length-1], [a, b])
  c = c.replace(/expect\(([^)]+)\)\.toHaveBeenCalledWith\(([\s\S]*?)\);/g,
    (_, mock, args) => `assert.deepStrictEqual(${mock}.calls[${mock}.calls.length-1], [${args}]);`);

  // expect(x).not.toHaveProperty('k') → assert.ok(!('k' in x))
  c = c.replace(/expect\(([^)]+)\)\.not\.toHaveProperty\('([^']+)'\)/g,
    (_, x, k) => `assert.ok(!('${k}' in ${x}))`);
  c = c.replace(/expect\(([^)]+)\)\.not\.toHaveProperty\("([^"]+)"\)/g,
    (_, x, k) => `assert.ok(!("${k}" in ${x}))`);

  // expect(x).toHaveProperty('k', v) → assert.strictEqual(x['k'], v)
  c = c.replace(/expect\(([^)]+)\)\.toHaveProperty\('([^']+)',\s*([^)]+)\)/g,
    (_, x, k, v) => `assert.strictEqual(${x}['${k}'], ${v.trim()})`);
  c = c.replace(/expect\(([^)]+)\)\.toHaveProperty\("([^"]+)",\s*([^)]+)\)/g,
    (_, x, k, v) => `assert.strictEqual(${x}["${k}"], ${v.trim()})`);

  // expect(x).toHaveProperty('k') → assert.ok('k' in x)
  c = c.replace(/expect\(([^)]+)\)\.toHaveProperty\('([^']+)'\)/g,
    (_, x, k) => `assert.ok('${k}' in ${x})`);
  c = c.replace(/expect\(([^)]+)\)\.toHaveProperty\("([^"]+)"\)/g,
    (_, x, k) => `assert.ok("${k}" in ${x})`);

  // expect(x).not.toContain(y) → assert.ok(!(x).includes(y))
  c = c.replace(/expect\(([^)]+)\)\.not\.toContain\(([^)]+)\)/g, 'assert.ok(!($1).includes($2))');

  // expect(x).toContain(y) → assert.ok((x).includes(y))
  c = c.replace(/expect\(([^)]+)\)\.toContain\(([^)]+)\)/g, 'assert.ok(($1).includes($2))');

  // expect(x).toMatch(/rx/) → assert.match(String(x), /rx/)
  c = c.replace(/expect\(([^)]+)\)\.toMatch\((\/.+?\/[gimsuy]*)\)/g, 'assert.match(String($1), $2)');

  // expect(x).not.toBe(y) → assert.notStrictEqual(x, y)
  c = c.replace(/expect\(([^)]+)\)\.not\.toBe\(([^)]+)\)/g, 'assert.notStrictEqual($1, $2)');

  // expect(x).not.toBeNull() → assert.notStrictEqual(x, null)
  c = c.replace(/expect\(([^)]+)\)\.not\.toBeNull\(\)/g, 'assert.notStrictEqual($1, null)');

  // expect(x).toBe(y) → assert.strictEqual(x, y)
  c = c.replace(/expect\(([^)]+)\)\.toBe\(([^)]+)\)/g, 'assert.strictEqual($1, $2)');

  // expect(x).toBeNull() → assert.strictEqual(x, null)
  c = c.replace(/expect\(([^)]+)\)\.toBeNull\(\)/g, 'assert.strictEqual($1, null)');

  // expect(x).toBeDefined() → assert.notStrictEqual(x, undefined)
  c = c.replace(/expect\(([^)]+)\)\.toBeDefined\(\)/g, 'assert.notStrictEqual($1, undefined)');

  // expect(x).toBeUndefined() → assert.strictEqual(x, undefined)
  c = c.replace(/expect\(([^)]+)\)\.toBeUndefined\(\)/g, 'assert.strictEqual($1, undefined)');

  // expect(x).not.toEqual(y) → assert.notDeepStrictEqual(x, y)
  c = c.replace(/expect\(([^)]+)\)\.not\.toEqual\(([^)]+)\)/g, 'assert.notDeepStrictEqual($1, $2)');

  // expect(x).toEqual(y) → assert.deepStrictEqual(x, y)
  c = c.replace(/expect\(([^)]+)\)\.toEqual\(([^)]+)\)/g, 'assert.deepStrictEqual($1, $2)');

  // expect(x).toBeGreaterThan(n) → assert.ok(x > n)
  c = c.replace(/expect\(([^)]+)\)\.toBeGreaterThan\(([^)]+)\)/g, 'assert.ok(($1) > ($2))');

  // expect(x).toBeLessThan(n) → assert.ok(x < n)
  c = c.replace(/expect\(([^)]+)\)\.toBeLessThan\(([^)]+)\)/g, 'assert.ok(($1) < ($2))');

  // expect(x).toBeInstanceOf(C) → assert.ok(x instanceof C)
  c = c.replace(/expect\(([^)]+)\)\.toBeInstanceOf\(([^)]+)\)/g, 'assert.ok(($1) instanceof ($2))');

  return c;
}

const arquivos = [
  'tests/auth.test.js',
  'tests/input-validator.test.js',
  'tests/repositories.test.js',
  'tests/lgpd.test.js',
  'tests/router.test.js',
];

let erros = 0;
for (const arq of arquivos) {
  try {
    const original    = fs.readFileSync(path.join(ROOT, arq), 'utf8');
    const transformado = transformar(original);
    fs.writeFileSync(path.join(ROOT, arq), transformado, 'utf8');
    console.log('✅', arq);
  } catch (e) {
    console.error('❌', arq, e.message);
    erros++;
  }
}

if (erros === 0) {
  console.log('\nTodos os arquivos transformados com sucesso.');
} else {
  console.error(`\n${erros} arquivo(s) com erro.`);
  process.exit(1);
}
