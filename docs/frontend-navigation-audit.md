# Auditoria Front-end de Navegacao e Travamentos

Data: 2026-07-05

## Atualizacao pos-correcao

Esta auditoria identificou a causa raiz do bug de voltar nativo: o `Router`
mantinha historico interno sem sincronizar com a History API do navegador.

Na etapa de correcao estrutural, o `Router` passou a:

- criar estados proprios com `history.replaceState()` no boot;
- empilhar navegacoes com `history.pushState()`;
- restaurar telas pelo evento global unico `popstate`;
- manter `_historico` interno sincronizado com o historico nativo;
- preservar estado do Router quando fluxos de auth/payment limpam parametros da URL;
- limpar o estado nativo ao executar logout;
- atualizar cache-bust do `Router.js` nos dois apps e bumpar os dois Service Workers.

Esta mudanca ainda deve ser validada em aparelho real Android/PWA antes do push
para producao, porque mocks de History API nao provam o comportamento fisico do
botao voltar do sistema operacional.

## Escopo

Esta auditoria foi feita somente no front-end, sem alteracao de regra de negocio,
BFF, banco, R2, autenticacao, pagamentos, vouchers, push, service worker ou APIs.

Areas analisadas:

- App profissional: `Minha Barbearia`, subpagina `mb-convite-panel`, fila/cadeiras,
  stories e modais relacionados.
- App cliente: pagina publica da barbearia (`tela-barbearia`), fila/cadeiras,
  agendamento/mensalidade e stories.
- Navegacao global, historico, botao voltar, overlays, listeners globais,
  classes de tela e possiveis estados presos.

## Resumo executivo

Nao encontrei evidencia de que o problema principal esteja no BFF ou em chamadas
de API. O ponto mais forte da auditoria e de arquitetura front-end: o `Router`
usa um historico interno da SPA, mas nao integra `history.pushState`/`popstate`.
Com isso, o botao voltar nativo do Android/PWA/navegador nao sabe fechar
subpaginas, overlays ou telas internas. O botao voltar proprio do app funciona
quando o fluxo passa por `Router.voltar()`, mas o voltar nativo pode parecer
"travado" ou sair do app.

Tambem encontrei dois riscos concretos de estado visual preso:

1. Subpaineis de `MinhaBarbeariaPage` podem permanecer marcados como ativos se o
   usuario sai da tela sem apertar o voltar interno do subpainel.
2. `StoryViewer` tem uma corrida de timeout: fechar e reabrir muito rapido pode
   executar o timeout antigo e esconder o overlay novo.

Os modais de fila (`FluxoDeFila`) parecem mais seguros: eles possuem uma safety
net que fecha overlays remanescentes ao trocar de tela.

## Metodologia

Foram feitas leituras estaticas dos arquivos de navegacao, overlays, pagina
publica e Minha Barbearia, alem de testes unitarios/checks disponiveis.

Comandos executados:

```powershell
node --test tests\router.test.js tests\router-resume.test.js tests\voltar-global-button.test.js tests\minha-barbearia-page.test.js tests\fluxo-de-fila.test.js tests\queue-position-presenter.test.js tests\stories-widget.test.js tests\story-viewer-interactions.test.js
node --check shared\js\Router.js
node --check shared\js\StoryViewer.js
node --check apps\profissional\assets\js\pages\MinhaBarbeariaPage\MinhaBarbeariaRuntimeController.js
npm run build:vite
npm test
```

Resultado:

- Testes direcionados de navegacao/fila/stories: passaram, 174 testes.
- `node --check`: passou nos arquivos analisados.
- `npm run build:vite`: passou, com avisos ja existentes de scripts legados nao
  modulares e sourcemaps.
- `npm test`: falhou porque o script roda `jest`, mas muitos testes do repo usam
  `node:test`. O Jest reporta varios arquivos como "Your test suite must contain
  at least one test". Essa falha torna o `npm test` amplo pouco confiavel para
  esta auditoria sem ajuste de runner.
- Nao foi encontrado Playwright/Cypress configurado para E2E automatizado.

Tambem foi iniciado servidor local com `npm run dev`; as paginas responderam:

- `http://localhost:3000/apps/cliente/`: HTTP 200.
- `http://localhost:3000/apps/profissional/`: HTTP 200.

Nao foi feito teste destrutivo, alteracao de dados reais ou chamada real de
fluxos sensiveis.

## Achados

### 1. Critico: voltar nativo do navegador/PWA nao esta integrado ao Router

Evidencia:

- `shared/js/Router.js:311` implementa `voltar()`, mas apenas com estado interno.
- `shared/js/Router.js:463`, `shared/js/Router.js:476` e
  `shared/js/Router.js:507` ligam botoes/data-actions internos ao `Router.voltar()`.
- `shared/js/Router.js` nao possui `history.pushState` nem listener de `popstate`.
- Busca por `pushState`/`popstate` nao encontrou integracao com a navegacao da SPA.
  O que existe e `replaceState` em fluxos especificos de auth/payment para limpar
  URL, nao para controlar navegacao.

Impacto:

- O botao voltar visual do app pode funcionar.
- O botao voltar nativo do Android/PWA/navegador nao fecha subpaineis ou overlays.
- Em PWA, isso pode parecer travamento porque o usuario espera voltar uma etapa,
  mas o browser nao tem uma etapa interna registrada.

Conclusao:

Esta e a causa arquitetural mais provavel para relatos de voltar que nao funciona
apos interagir com paginas internas.

Recomendacao futura:

- Criar uma politica unica para back navigation: ou integrar `Router.nav/push` com
  `history.pushState`/`popstate`, ou criar um coordenador de back que feche primeiro
  overlays/subpaineis ativos e so depois navegue.
- Essa mudanca deve ser planejada com testes, porque afeta os dois apps.

### 2. Alto: subpaineis da Minha Barbearia podem ficar com estado ativo ao sair da tela

Evidencia:

- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:288`
  registra listener global em capture para interceptar `.btn-voltar` quando existe
  `#subTelaAtiva`.
- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:294`
  chama `#fecharSub()` nesse caso.
- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:2317`
  abre subpainel com `#abrirSub(id)`.
- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:2340`
  fecha subpainel com `#fecharSub()`.
- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:144`
  observa entrada/saida da tela, mas no ramo de saida so para dig/realtime. Nao
  chama `#fecharSub()`.
- `shared/css/components.css` define `.mb-sub-tela` como painel fixed e
  `.mb-sub-ativa` como painel visivel.

Impacto:

- Se o usuario abre `mb-convite-panel`, `gps` ou `config` e sai da tela por footer,
  menu ou fluxo que nao passe pelo botao voltar do subpainel, o estado interno
  `#subTelaAtiva` pode permanecer.
- Ao retornar para Minha Barbearia, o subpainel pode reaparecer aberto ou capturar
  o proximo clique em `.btn-voltar`.
- Isso combina mal com a ausencia de `popstate`, porque o voltar nativo nao fecha
  esse subpainel.

Conclusao:

Risco real e localizado. Explica travamento/perda de controle em `Minha Barbearia`
e especialmente em `mb-convite-panel`.

Recomendacao futura:

- No observador de saida da tela, fechar subpainel ativo de forma segura.
- Adicionar teste garantindo que sair de `tela-minha-barbearia` limpa
  `#subTelaAtiva`, `.mb-sub-ativa`, `aria-hidden` e foco preso.

### 3. Medio/Alto: corrida de timeout no StoryViewer pode esconder overlay reaberto

Evidencia:

- `shared/js/StoryViewer.js:776` abre overlay com `display = 'flex'` e
  `body.style.overflow = 'hidden'`.
- `shared/js/StoryViewer.js:784` fecha overlay removendo `.sv-ativo`.
- `shared/js/StoryViewer.js:790` agenda um timeout de 300ms que limpa
  `overlay.style.display` e `body.style.overflow`.
- `#abrirOverlay()` nao limpa um `#fecharTimeoutId` pendente.

Impacto:

- Se o usuario fecha um story e reabre outro antes de 300ms, o timeout antigo pode
  rodar depois da reabertura e esconder o overlay novo.
- Isso pode causar estado visual incoerente: story logicamente aberto, mas overlay
  escondido ou body liberado.

Conclusao:

Risco real, front-only, localizado em Stories. Nao parece a causa principal do
botao voltar global, mas pode causar travamentos visuais em stories.

Recomendacao futura:

- Em `#abrirOverlay()`, limpar `#fecharTimeoutId` antes de exibir o overlay.
- Adicionar teste para fechar e reabrir dentro da janela de 300ms.

### 4. Medio: envio de convite pode deixar botao desabilitado se ocorrer erro inesperado

Evidencia:

- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js:2586`
  contem `#enviarConvite()`.
- O metodo desabilita o botao antes de aguardar envio e reabilita depois do retorno.
- O fluxo confia que `BffApiService.post` retorna envelope e nao joga excecao.

Impacto:

- Se uma excecao inesperada ocorrer antes da reabilitacao, o botao pode ficar
  desabilitado.
- Isso nao prova travamento de pagina, mas pode parecer que a tela "parou" apos
  interacao de convite.

Conclusao:

Risco baixo a medio, localizado. Nao e causa confirmada, mas e uma fragilidade.

Recomendacao futura:

- Usar `try/finally` so para garantir reabilitacao do botao, sem mudar regra de
  negocio.

### 5. Baixo/Medio: pagina publica da barbearia tem modais proprios, mas sem evidencia de bloqueio global

Evidencia:

- `shared/js/BarbeariaPage.js` controla a pagina publica `tela-barbearia`.
- `shared/js/BarbeariaPage.js:936` e `shared/js/BarbeariaPage.js:1082` chamam
  `ModalController.abrirSelecaoServicos()`.
- `shared/js/BarbeariaPage.js:1476` cria modal de mensalidade com overlay proprio.
- `shared/js/BarbeariaPage.js:1553` e `shared/js/BarbeariaPage.js:1558` removem
  classes e overlay ao fechar.
- `shared/js/BarbeariaPage.js` para polling/realtime ao sair da tela, mas a
  navegacao continua dependendo do `Router`, que nao usa historico nativo.

Impacto:

- Nao encontrei um bloqueador claro como overlay sem remocao permanente.
- O risco maior nessa pagina tambem vem do voltar nativo sem `popstate` e de
  modais/subfluxos abertos no momento da navegacao.

Conclusao:

Nao ha bug confirmado especifico na pagina publica, mas ela herda o problema
global de back navigation.

### 6. Positivo: FluxoDeFila tem safety net contra overlays presos

Evidencia:

- `shared/js\FluxoDeFila.js:107` registra listener global em
  `barberflow:tela-entrando`.
- `shared/js\FluxoDeFila.js:119` fecha `.fdf-overlay` remanescente.
- `shared/js\AnimationService.js:62` dispara `barberflow:tela-entrando` em
  navegacoes.
- `tests\fluxo-de-fila.test.js` cobre a safety net.

Impacto:

- Os modais de fila/cadeira tem protecao melhor contra overlay preso.
- Nao encontrei evidencia de que `FluxoDeFila` seja a causa principal do travamento.

Conclusao:

Manter essa abordagem como referencia para outros overlays/subpaineis.

### 7. Baixo: suite geral de testes esta desalinhada com o runner

Evidencia:

- `npm test` executa `jest`.
- Muitos testes usam `node:test`.
- O Jest falha em varios arquivos com "Your test suite must contain at least one test".

Impacto:

- Fica dificil confiar em `npm test` como validação unica.
- Testes direcionados via `node --test` passaram.

Recomendacao futura:

- Separar scripts: `test:node`, `test:jest`, `test:frontend-audit` ou ajustar o
  runner para nao tratar testes `node:test` como Jest.

## Mapa de fluxo analisado

### App profissional, Minha Barbearia

Fluxo:

1. `Router.nav('minha-barbearia')` ativa a tela.
2. `MinhaBarbeariaRuntimeController` observa classe da tela.
3. Botoes internos abrem subpaineis com `#abrirSub('convite'|'gps'|'config')`.
4. Botao voltar do subpainel chama `#fecharSub()`.
5. Botao voltar global chama `Router.voltar()`.

Risco:

- Sair da tela sem passar por `#fecharSub()` deixa o estado do subpainel vivo.
- Voltar nativo nao aciona esse fechamento.

### App cliente, pagina publica da barbearia

Fluxo:

1. Cards/listagens chamam `BarbeariaPage.abrirPorId()`.
2. A pagina entra via `Router.nav('barbearia')`.
3. Cadeiras e servicos abrem modais/transicoes.
4. Mensalidade usa overlay proprio.

Risco:

- Sem historico nativo, o botao voltar do Android/PWA nao sabe voltar da
  `tela-barbearia` para a home/lista.
- Nao foi confirmado overlay permanente nessa pagina.

### Stories

Fluxo:

1. `StoriesWidget` renderiza cards.
2. `StoryViewer.abrir()` monta/abre overlay fullscreen legado.
3. `StoryViewer.fechar()` fecha com animacao e timeout.

Risco:

- Timeout de fechamento pode interferir em reabertura rapida.

### Fila/Cadeiras

Fluxo:

1. Acoes de cadeira chamam `ModalController`/`FluxoDeFila`.
2. `FluxoDeFila` cria overlay e fecha por confirmacao/cancelamento.
3. Safety net remove overlays remanescentes em troca de tela.

Risco:

- Menor que os demais, pela safety net existente.

## Hipoteses descartadas ou nao confirmadas

- CORS/BFF/API como causa do travamento de voltar: nao ha evidencia neste escopo.
- R2/stories storage como causa de navegacao travada: fora do sintoma atual.
- Service worker antigo causando bug: nao confirmado nesta auditoria. Pode mascarar
  deploy no PWA real, mas nao apareceu como causa primaria no codigo.
- `FluxoDeFila` preso globalmente: pouco provavel pela safety net e testes.

## Testes direcionados executados

```powershell
node --test tests\router.test.js tests\router-resume.test.js tests\voltar-global-button.test.js tests\minha-barbearia-page.test.js tests\fluxo-de-fila.test.js tests\queue-position-presenter.test.js tests\stories-widget.test.js tests\story-viewer-interactions.test.js
```

Resultado: passou, 174 testes.

```powershell
node --check shared\js\Router.js
node --check shared\js\StoryViewer.js
node --check apps\profissional\assets\js\pages\MinhaBarbeariaPage\MinhaBarbeariaRuntimeController.js
```

Resultado: passou.

```powershell
npm run build:vite
```

Resultado: passou, com avisos existentes de bundle/legacy scripts.

```powershell
npm test
```

Resultado: falhou por desalinhamento entre Jest e testes `node:test`, alem de
falhas nao especificas desta auditoria. Nao usei essa falha como evidencia direta
do bug de navegacao.

## Recomendacao objetiva de correcao futura

Ordem recomendada:

1. Corrigir o ciclo de vida dos subpaineis da Minha Barbearia:
   - ao sair da tela, fechar subpainel ativo;
   - garantir limpeza de classe, foco, `aria-hidden`, dig GPS e `MediaP2P`;
   - teste especifico para sair via footer/menu.

2. Corrigir corrida do `StoryViewer`:
   - limpar timeout pendente ao abrir overlay;
   - teste de reabertura dentro de 300ms.

3. Planejar back navigation global:
   - decidir se `Router` vai usar `pushState`/`popstate`;
   - ou criar um `BackCoordinator` que feche overlays/subpaineis antes de navegar;
   - cobrir Android/PWA/navegador.

4. Adicionar E2E leve:
   - abrir app profissional;
   - abrir Minha Barbearia;
   - abrir convite;
   - interagir;
   - voltar;
   - trocar de tela;
   - repetir em pagina publica da barbearia e stories.

## Riscos antes de alterar

- Integrar `pushState` sem cuidado pode quebrar fluxo de auth, reset de senha,
  confirmacao de email e PWA.
- Fechar subpaineis ao sair da tela deve preservar uploads/operacoes em andamento,
  especialmente `MediaP2P` e stories.
- Corrigir `StoryViewer` e simples, mas precisa garantir que nao afete viewer de
  portfolio/prisma se compartilhar eventos.

## Conclusao

A causa real mais provavel dos travamentos de voltar nao e uma API nem o banco.
E a combinacao de:

- Router SPA sem historico nativo;
- subpaineis da Minha Barbearia que podem manter estado ativo;
- overlays de Stories com corrida de timeout.

Minha recomendacao e corrigir primeiro os pontos locais e seguros
(`MinhaBarbeariaRuntimeController` e `StoryViewer`) e depois planejar a melhoria
global de back navigation com testes E2E, porque essa parte toca os dois apps.
