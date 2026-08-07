'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'stamp-sw-version.js');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-sw-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// stdout+stderr combinados via "2>&1": console.log vai pro primeiro,
// console.warn/error pro segundo — testes de "avisa alto" (AVISO/origem)
// precisam ver os dois juntos, na ordem real em que o script imprime.
function rodar(swPath, env = {}) {
  return execSync(`node "${SCRIPT}" "${swPath}" 2>&1`, {
    env: { ...process.env, VERCEL_GIT_COMMIT_SHA: '', ...env },
    cwd: tmpDir,
    encoding: 'utf8',
  });
}

describe('stamp-sw-version.js — versionamento automático do Service Worker no deploy', () => {

  it('substitui SW_PRO_VERSION mantendo o resto do arquivo intacto', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, [
      "const OUTRA_CONST = 'nao mexer';",
      "const SW_PRO_VERSION = '20260101a';",
      "class X { static y() { return SW_PRO_VERSION; } }",
    ].join('\n'));

    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });

    const resultado = fs.readFileSync(swPath, 'utf8');
    assert.match(resultado, /const SW_PRO_VERSION = 'abcdef12';/, 'deve usar os 8 primeiros chars do commit SHA');
    assert.match(resultado, /const OUTRA_CONST = 'nao mexer';/, 'nao deve tocar em outras constantes');
    assert.match(resultado, /class X \{ static y\(\) \{ return SW_PRO_VERSION; \} \}/, 'resto do arquivo intacto');
  });

  it('funciona genericamente para SW_CLI_VERSION (nome diferente da constante)', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_CLI_VERSION = '20260101a';\n");

    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'fedcba0987654321' });

    assert.match(fs.readFileSync(swPath, 'utf8'), /const SW_CLI_VERSION = 'fedcba09';/);
  });

  it('sem VERCEL_GIT_COMMIT_SHA, cai para "git rev-parse" (repo real) sem quebrar', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");

    // tmpDir não é um repo git — script deve cair no fallback timestamp em vez de travar
    rodar(swPath);

    const resultado = fs.readFileSync(swPath, 'utf8');
    assert.doesNotMatch(resultado, /20260101a/, 'versao antiga deve ter sido substituida por algo');
    assert.match(resultado, /const SW_PRO_VERSION = '[^']+';/);
  });

  it('mudar de commit produz um valor diferente (garante que o SW muda de bytes a cada deploy real)', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");
    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: '1111111111111111' });
    const v1 = fs.readFileSync(swPath, 'utf8');

    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: '2222222222222222' });
    const v2 = fs.readFileSync(swPath, 'utf8');

    assert.notEqual(v1, v2, 'versoes de commits diferentes devem gerar bytes diferentes no sw.js');
  });

  it('mesmo commit gera o mesmo valor (não invalida cache à toa em redeploy sem mudança de código)', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");
    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'aaaaaaaaaaaaaaaa' });
    const v1 = fs.readFileSync(swPath, 'utf8');

    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n"); // simula novo build do mesmo commit
    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'aaaaaaaaaaaaaaaa' });
    const v2 = fs.readFileSync(swPath, 'utf8');

    assert.equal(v1, v2);
  });

  it('rebuild do mesmo commit (2x seguidas) não confunde "já atualizado" com "constante não encontrada"', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");

    const r1 = rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbb' });
    assert.match(r1, /→ versão bbbbbbbb/);

    const r2 = rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'bbbbbbbbbbbbbbbb' });
    assert.doesNotMatch(r2, /nenhuma constante/, 'segunda rodada com o mesmo commit NAO pode dizer que a constante sumiu');
    assert.match(r2, /já está na versão bbbbbbbb/);
  });

  it('log informa explicitamente qual estrategia gerou a versao (env var, git ou timestamp) — nunca em silencio', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");

    const saidaEnv = rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });
    assert.match(saidaEnv, /origem: VERCEL_GIT_COMMIT_SHA/);

    // tmpDir nao e repo git -> cai no fallback de timestamp; deve avisar alto, nao silenciar
    const saidaFallback = rodar(swPath);
    assert.match(saidaFallback, /AVISO.*timestamp/i);
    assert.match(saidaFallback, /origem: timestamp/);
  });

  it('mesmo se o git retornasse string vazia, nunca escreve SW_PRO_VERSION vazio no arquivo', () => {
    // Simula indiretamente: sem commit SHA e sem repo git valido, o unico
    // caminho e o fallback de timestamp — Date.now().toString(36) nunca e
    // vazio, entao este teste documenta a garantia de nao-vazio ponta a ponta.
    const swPath = path.join(tmpDir, 'sw.js');
    fs.writeFileSync(swPath, "const SW_PRO_VERSION = '20260101a';\n");

    rodar(swPath);

    const match = fs.readFileSync(swPath, 'utf8').match(/const SW_PRO_VERSION = '([^']*)';/);
    assert.ok(match, 'constante deve continuar existindo');
    assert.notEqual(match[1], '', 'versao nunca pode ficar vazia');
  });

  it('sai com erro (nao silencioso) quando o arquivo alvo nao existe', () => {
    assert.throws(() => rodar(path.join(tmpDir, 'nao-existe.js')));
  });

  it('nao altera o arquivo quando nao ha constante SW_*_VERSION (aviso, nao falha o build)', () => {
    const swPath = path.join(tmpDir, 'sw.js');
    const original = "const OUTRACOISA = 'x';\n";
    fs.writeFileSync(swPath, original);

    rodar(swPath, { VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' });

    assert.equal(fs.readFileSync(swPath, 'utf8'), original);
  });
});
