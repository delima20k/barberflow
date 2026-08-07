'use strict';

// =============================================================
// stamp-sw-version.js — carimba a constante SW_*_VERSION do sw.js
// com o hash do commit atual, antes do deploy.
//
// Por que: o navegador só percebe uma atualização do Service Worker
// quando os BYTES do sw.js mudam (comparação byte-a-byte contra a
// versão instalada — ver shared/js/PwaUpdateManager.js). Se um deploy
// muda MediaP2P.js/PortfolioController.js/etc mas ninguém lembra de
// bumpar SW_PRO_VERSION/SW_CLI_VERSION manualmente, o sw.js fica
// byte-idêntico ao anterior e o app nunca atualiza sozinho.
//
// Uso (chamado pelo buildCommand de cada app no Vercel):
//   node ../../scripts/stamp-sw-version.js sw.js
//
// Em builds da Vercel, usa VERCEL_GIT_COMMIT_SHA (env var automática,
// sem configuração) — versão muda só quando o código muda de verdade,
// não em todo redeploy do mesmo commit.
// =============================================================

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

/**
 * Resolve a versão a estampar e DE ONDE ela veio — nunca em silêncio,
 * pra aparecer no log de build qual caminho foi usado.
 * @returns {{ versao: string, origem: string }}
 */
function versaoAtual(cwd) {
  const doEnv = process.env.VERCEL_GIT_COMMIT_SHA;
  if (doEnv) {
    return { versao: doEnv.slice(0, 8), origem: 'VERCEL_GIT_COMMIT_SHA' };
  }

  try {
    const doGit = execSync('git rev-parse --short=8 HEAD', { cwd }).toString().trim();
    if (doGit) return { versao: doGit, origem: 'git rev-parse' };
  } catch {
    // segue pro fallback abaixo
  }

  // Nem env var da Vercel, nem git disponível — timestamp garante que o
  // build nunca fica sem versão, mas perde a propriedade de "mesmo commit
  // = mesma versão" (todo build vira uma versão nova, mesmo sem mudança
  // de código). Avisado alto de propósito: se isso acontecer num deploy
  // real da Vercel, é sinal de que VERCEL_GIT_COMMIT_SHA parou de ser
  // exposta e merece investigação, não deve passar despercebido.
  console.warn('[stamp-sw-version] AVISO: nem VERCEL_GIT_COMMIT_SHA nem git disponíveis — usando timestamp como fallback.');
  return { versao: Date.now().toString(36), origem: 'timestamp (fallback degradado)' };
}

function main() {
  const alvo = process.argv[2];
  if (!alvo) {
    console.error('[stamp-sw-version] uso: node stamp-sw-version.js <caminho-do-sw.js>');
    process.exit(1);
  }

  const swPath = path.resolve(alvo);
  if (!fs.existsSync(swPath)) {
    console.error(`[stamp-sw-version] arquivo não encontrado: ${swPath}`);
    process.exit(1);
  }

  const { versao, origem } = versaoAtual(path.dirname(swPath));
  const conteudo = fs.readFileSync(swPath, 'utf8');
  const regexConstante = /const (SW_\w+_VERSION) = '[^']*';/;

  if (!regexConstante.test(conteudo)) {
    console.warn(`[stamp-sw-version] nenhuma constante SW_*_VERSION encontrada em ${swPath} — nada alterado.`);
    return;
  }

  const atualizado = conteudo.replace(regexConstante, (_match, nome) => `const ${nome} = '${versao}';`);

  if (atualizado === conteudo) {
    // Constante existe, só que o valor calculado já é o mesmo do arquivo
    // (rebuild do mesmo commit) — não é a mesma situação de "não achei a
    // constante" acima, e escrever de novo o mesmo conteúdo não muda nada.
    console.log(`[stamp-sw-version] ${path.basename(swPath)} já está na versão ${versao} (origem: ${origem}) — nada a fazer.`);
    return;
  }

  fs.writeFileSync(swPath, atualizado);
  console.log(`[stamp-sw-version] ${path.basename(swPath)} → versão ${versao} (origem: ${origem})`);
}

main();
