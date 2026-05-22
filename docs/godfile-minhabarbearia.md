# Diagnostico God File - MinhaBarbeariaPage

## Escopo e evidencias

Este documento e uma analise estatica de `apps/profissional/assets/js/pages/MinhaBarbeariaPage.js` na revisao observada em 22/05/2026. Nenhum codigo da pagina foi refatorado neste diagnostico.

Fontes inspecionadas:

- `apps/profissional/assets/js/pages/MinhaBarbeariaPage.js`
- `apps/profissional/assets/js/app.js`, que instancia e chama `bind()` da pagina
- `apps/profissional/index.html`, que fornece os IDs `mb-*`, paineis de GPS/config/convite e o `<script>` da pagina
- `tests/minha-barbearia-page.test.js` e `tests/producao-push-realtime.test.js`
- `git log --follow`, `git log --numstat` e `git blame` do arquivo analisado

`MinhaBarbeariaPage` nao e apenas uma pagina de vitrine. A classe centraliza shell da tela, stories, uploads, status da barbearia, equipe, convites, fila/cadeiras, realtime, push/notificacoes, servicos/produtos, mensalistas, GPS e edicao de campos do painel. A pagina tambem e consumidora de varios servicos globais sem um limite explicito de dominio.

## Estado e superficie atual

### Campos mutaveis

| Linhas | Campo | Uso principal |
|---|---|---|
| 27-31 | `#telaEl`, `#panelEl`, `#gpsPanelEl`, `#convitePanelEl`, `#subTelaAtiva` | Shell, lifecycle visual e roteamento de subpaineis |
| 32-34 | `#conviteBarbeiroId`, `#conviteTipo`, `#carregou` | Convite e protecao de carga inicial |
| 35-42 | `#barbershopId`, `#isOwner`, `#shopData`, `#servicos`, `#profissionalId`, `#mensalistasAtivos`, `#coordsGps` | Estado de negocio local compartilhado entre status, fila, settings e GPS |
| 43-46 | `#digGps`, `#digBoasVindas`, `#guardaBotoes`, `#guardaIten` | Componentes UI com lifecycle proprio |
| 47 | `#mediaP2P` | Preview/upload pendente de stories e imagens de item |
| 48-51 | `#canalFila`, `#pollingTimer`, `#renderizandoEquipe`, `#reRenderPendente` | Realtime, fallback por timer e guard de concorrencia da fila |
| 52-54 | `#pushPendente`, `#pushModalAtiva`, `#pushProcessados` | Buffer e dedupe de push/modal |
| 55 | `#refs` | Cache mutavel de elementos DOM |

### Refs e listeners de DOM

`#cacheRefs()` ocupa as linhas 122-228 e monta um unico objeto com refs de:

- shell/hero/stories: `nome`, `coverImg`, `coverInput`, `quotaTxt`, `addBtn`, `gpsBtn`, `maisBtn`, `slot2`, `slot3`
- convite/equipe: `convidarBtn`, refs do painel de busca, refs de tipo/parceria, refs do card selecionado, `equipeDonoWrap`, `equipeCol`
- settings/produtos: refs de capa/logo/nome/produtos/mensalistas/itens/whatsapp/fundacao
- info/status: `info*`, `statusTxt`, `statusToggle`, `topoStatus`, `heroHeader`, `heroLogo`
- GPS: refs de CEP, logradouro, bairro, cidade, numero, complemento, mapa textual, mensagens e salvar

`#bindEventos()` ocupa as linhas 230-289 e concentra listeners diretos para botoes e inputs, mas tambem registra listeners globais em `document`:

- `barberflow:notificacao-nova` -> `#onClienteAusente`
- `barberflow:espera-resolvida` -> `#onEsperaResolvida`
- `barberflow:push-action` -> `#handlePushAction`
- `barberflow:push-show-modal` -> `#handlePushShowModal`

`bind()` ainda cria um `MutationObserver` nas linhas 102-119. Ao ativar/desativar a tela ele inicia carga/realtime e para realtime/polling. O observer nao e guardado em campo nem desconectado no arquivo.

## Mapa de responsabilidades

As faixas abaixo usam linhas do arquivo fonte observado. A faixa inclui o metodo e seu bloco de comentarios imediatamente associado quando isto ajuda a identificar o bloco.

### Inventario completo por grupo

| Grupo | Funcoes/metodos/blocos | Linhas |
|---|---|---|
| Shell/Orquestracao | declaracao da classe e estado | 24-55 |
| Shell/Orquestracao | `constructor`, `bind` | 56-120 |
| Shell/Orquestracao | `#cacheRefs`, `#bindEventos` | 122-289 |
| Shell/Orquestracao | `#carregar`, `#fetchMinhaBarbearia` | 292-348 |
| Shell/Orquestracao | `#abrirSub`, `#fecharSub` | 1435-1471 |
| Shell/Orquestracao | `#mostrarSkeleton`, `#mostrarVazio`, `#mostrarErro` | 2503-2516 |
| Stories/Media | `#fetchStoriesAtivos`, `#fetchQuotaHoje` | 375-410 |
| Stories/Media | `#renderStoryCards` | 1362-1406 |
| Stories/Media | `#onUploadMidia` | 2035-2094 |
| Equipe/Convites | `#fetchBarbeiros` | 361-373 |
| Equipe/Convites | `#renderEquipe` | 412-462 |
| Equipe/Convites | `#resetarConvite`, `#buscarBarbeiro`, `#atualizarBarbeiroSelecionado`, `#selecionarBarbeiro`, `#selecionarTipoConvite`, `#enviarConvite` | 1474-1656 |
| Queue/Cadeiras/Realtime | realtime/polling: `#iniciarRealtimeFila`, `#iniciarPollingFallback`, `#pararRealtimeFila`, `#reRenderEquipe` | 470-556 |
| Queue/Cadeiras/Realtime | fluxo de cadeiras: `#onCadeiraClick`, `#fluxoSentar`, `#fluxoFinalizar`, `#fluxoEspera` | 565-748 |
| Queue/Cadeiras/Realtime | factories DOM: `#criarAvatarEl`, `#criarBarberiroCard`, `#criarCadeiraEl`, `#cadeiraImgEl`, `#criarBarbeiroRow` | 1015-1247 |
| Notifications/Push | `#onClienteAusente`, `#fluxoClienteAtShop`, `#handlePushAction`, `#handlePushShowModal`, `#registrarPushPendente`, `#processarPushPendente`, `#chavePush`, `#onEsperaResolvida` | 758-1004 |
| Settings/Servicos/Produtos/Mensalistas | `#fetchServicos`, `#renderServicos` | 350-359, 1408-1432 |
| Settings/Servicos/Produtos/Mensalistas | `#preencherConfigPanel`, `#adicionarLinhaProduto`, `#onUploadImagemItem`, `#salvarProdutoUnico`, `#adicionarItemNaView`, `#removerItemCompleto` | 1658-1940 |
| Settings/Servicos/Produtos/Mensalistas | `#abrirMensalistaModal`, `#salvarConfiguracoes`, `#salvarProdutos` | 1944-2031 |
| Settings/Servicos/Produtos/Mensalistas | `#uploadImagemBarbearia`, `#aplicarLogo`, `#onUploadCapa`, `#onUploadLogo` | 2106-2172 |
| GPS/Endereco | `#separarEnderecoSalvo`, `#preencherGpsForm`, `#onCepInput`, `#buscarCep`, `#ativarGps`, `#salvarGps`, `#mostrarGpsMsg` | 2176-2404 |
| GPS/Endereco + Settings helper | `#_toggleEl`, `#_fecharEl`, `#_toggleCepRow`, `#_fecharCepRow` | 2454-2501 |
| Status/Cabecalho/InfoCard | `#renderStatusAberto`, `#toggleStatusAberto`, `#renderCabecalho`, `#atualizarLogoConvite` | 1252-1359 |
| Status/Cabecalho/InfoCard | `#formatarNumero`, `#escapeAttr`, `#renderInfoCard` | 2407-2452 |

### Shell/Orquestracao

| Item | Diagnostico |
|---|---|
| Linhas | 24-120, 122-348, 1435-1471, 2503-2516 |
| Dependencias internas | `bind` -> `#cacheRefs`, `#bindEventos`; observer -> `#carregar`, `#iniciarRealtimeFila`, `#pararRealtimeFila`; `#carregar` -> fetchers, renders, config, info card, realtime e push pendente; `#abrirSub` -> GPS/convite; `#fecharSub` -> `#mediaP2P.cancelarTodos` |
| Dependencias externas | `document`, `MutationObserver`, `DigText`, `GuardaIten`, `AuthService`, `BarbeiroEsperaFluxo`, `CadeiraService`, `GpsPanelMap`, DOM do `index.html` |
| Estado mutavel | Quase todos os campos privados sao inicializados ou reusados pelo shell; `#refs` e o hub de DOM |
| Side effects | Listeners, observer, alteracao de classes/ARIA/foco, carga concorrente, inicializacao/parada de realtime, cancelamento de blobs pendentes |

`#carregar()` e o principal metodo de acoplamento. Ele busca a barbearia, sincroniza cache local, carrega servicos/stories/quota/equipe/fila em paralelo e aciona render de status, stories, equipe, servicos, config, info card, realtime e push. Qualquer extracao precisa primeiro substituir esta composicao direta por contratos de secao.

### Stories/Media

| Item | Diagnostico |
|---|---|
| Linhas | 375-410, 1362-1406, 2035-2094 |
| Dependencias internas | `#carregar` -> fetch/render; `#onUploadMidia` -> `#fetchQuotaHoje`, `#carregar` |
| Dependencias externas | `SupabaseService.client.from('stories')`, `SupabaseService.getLogoUrl`, `AuthService`, `NotificationService`, `LoggerService`, `MediaP2P`, `crypto.randomUUID` |
| Estado mutavel | `#isOwner`, `#barbershopId`, `#carregou`, refs de upload/quota/slots/capa, arquivos pendentes em `#mediaP2P` |
| Side effects | Query de stories/quota, upload browser -> R2 via `MediaP2P`, insert de metadados em `stories`, `innerHTML` nos slots, toast e recarga da pagina |

`#renderStoryCards()` usa `coverImg.src` como badge visual e insere HTML com texto vindo de `shop`/story. O uso de story tambem vaza para o header porque `#renderCabecalho()` atualiza a capa do primeiro card.

### Equipe/Convites

| Item | Diagnostico |
|---|---|
| Linhas | 361-373, 412-462, 1474-1656 |
| Dependencias internas | `#renderEquipe` -> factories de Queue/Cadeiras; `#resetarConvite` -> `#atualizarBarbeiroSelecionado`; busca -> selecao -> envio |
| Dependencias externas | `SupabaseService.client` para `professional_shop_links`, `profiles` e `barbershop_invites`; `InputValidator`; `NotificationService`; `ApiService`/`SupabaseService.resolveAvatarUrl`; navegacao `App.nav('perfil')` |
| Estado mutavel | `#conviteBarbeiroId`, `#conviteTipo`, refs do painel, `#isOwner`; equipe consome entradas de fila |
| Side effects | Queries, insert de convite, criacao dinamica de cards/listeners, feedback DOM e toast |

Equipe visual e fila estao misturadas: `#renderEquipe()` recebe `filaEntradas`, filtra por profissional e cria rows com cadeiras interativas. A secao de convite e mais isolavel que a secao de equipe.

### Queue/Cadeiras/Realtime

| Item | Diagnostico |
|---|---|
| Linhas | 470-748, 1015-1247 |
| Dependencias internas | realtime/polling -> `#reRenderEquipe`; clique -> `#fluxoEspera` ou `#fluxoFinalizar` ou `#fluxoSentar`; fluxos -> `#reRenderEquipe`; factories sao chamadas por `#renderEquipe` |
| Dependencias externas | `SupabaseService.channel/removeChannel`, `CadeiraService`, `QueueRepository`, `BarbeiroEsperaFluxo`, `ClienteSeletorModal`, `CorteModal`, `FinalizarCorteModal`, `BffApiService.mensalistas`, `FinanceiroService`, `NotificationService`, `LoggerService` |
| Estado mutavel | `#canalFila`, `#pollingTimer`, flags de rerender, `#servicos`, `#mensalistasAtivos`, `#barbershopId`, `#profissionalId`, refs de equipe |
| Side effects | Realtime PostgreSQL em `queue_entries`, polling de 15 s, queries/commands de fila, modais, registro financeiro fire-and-forget, incremento de cortes mensalistas, DOM e toasts |

Este grupo tem estado temporal, concorrencia e UI dinamica. O guard `#renderizandoEquipe/#reRenderPendente` e evidencia de concorrencia entre realtime e fluxos de fila.

### Notifications/Push

| Item | Diagnostico |
|---|---|
| Linhas | 758-1004 |
| Dependencias internas | `#onClienteAusente` -> `#handlePushShowModal` e fila; `#handlePushShowModal` -> `#fluxoClienteAtShop`; buffer -> handlers; `#onEsperaResolvida` -> `#reRenderEquipe` |
| Dependencias externas | Eventos DOM globais, `Pro.nav`, `ClienteAusenteModal`, `BarbeiroEsperaFluxo`, `CadeiraService`, `QueueRepository`, `MessageService`, `ApiService`, `NotificationService`, `LoggerService` |
| Estado mutavel | Sets de dedupe, array de push pendente, estado da barbearia/equipe |
| Side effects | Modal, navegacao para tela, atualizacao de confirmacao de fila, mensagem ao cliente, remocao/finalizacao, toasts |

O grupo e chamado de "Notifications", mas executa comandos de fila. A fronteira recomendada e deixar uma secao de notification/push interpretar eventos e delegar comandos a uma API de `QueueSection`.

### Settings/Servicos/Produtos/Mensalistas

| Item | Diagnostico |
|---|---|
| Linhas | 350-359, 1408-1432, 1658-2031, 2106-2172, helpers 2454-2477 |
| Dependencias internas | config -> itens salvos/form temporario; salvar config -> `#salvarProdutos`, helpers editaveis e `#renderInfoCard`; item -> upload pendente -> upsert -> refresh `#servicos`; logo/capa -> `#uploadImagemBarbearia` |
| Dependencias externas | `SupabaseService.services/barbershops/storageBarbershops`, `BffApiService.barbearias`, `ApiService`, `MediaP2P`, `MensalistaModal`, `FonteSalao`, `AnimationService`, `NotificationService`, `LoggerService` |
| Estado mutavel | `#servicos`, `#shopData`, `#mediaP2P`, refs do config panel, datasets `produtoId`, `imagePath`, `duracao`, `mediaUid` |
| Side effects | Upload storage/BFF, upsert/delete de servicos, update de barbearia, DOM dinamico e listeners em rows, cache de servicos usado por cadeiras, toast/gaspar |

Settings vaza em Queue: o cache `#servicos` e atualizado apos salvar/remover item porque `CorteModal` em `#fluxoSentar()` o reutiliza.

### GPS/Endereco

| Item | Diagnostico |
|---|---|
| Linhas | 2176-2404, helpers de CEP 2479-2501; inicializacao do subpainel em 1435-1454 |
| Dependencias internas | abrir subpainel -> `#preencherGpsForm`; busca CEP -> helpers editaveis; salvar -> `#renderInfoCard`, `#preencherGpsForm`, `#mostrarGpsMsg` |
| Dependencias externas | `BarbershopService.geocodificarCep/salvarEnderecoGps`, `AuthService`, `navigator.geolocation`, `GpsPanelMap`, `AnimationService`, `NotificationService`, DOM |
| Estado mutavel | `#coordsGps`, `#shopData`, refs GPS, `#digGps` |
| Side effects | Geocodificacao, GPS nativo, persistencia do endereco, atualizacao de mapa/DOM, toast/gaspar |

### Status/Cabecalho/InfoCard

| Item | Diagnostico |
|---|---|
| Linhas | 1252-1359, 2407-2452 |
| Dependencias internas | status toggle -> render status; cabecalho -> logo do convite e cover do story; settings/GPS -> `#renderInfoCard` |
| Dependencias externas | `StatusFechamentoModal`, `BarbershopRepository`, `SupabaseService.getLogoUrl`, `FonteSalao`, `NotificationService`, `document.dispatchEvent` |
| Estado mutavel | `#shopData.is_open/close_reason/logo_path/cover_path`, refs do hero/status/info/convite |
| Side effects | Update de disponibilidade, rollback visual, evento `barberflow:statusAtualizado`, CSS background/src/texto |

`#atualizarLogoConvite()` fica junto do cabecalho por hoje, mas serve explicitamente o painel de convite. Esta e uma fronteira arbitraria.

## Dominios pedidos sem responsabilidade atual

| Dominio pedido | Evidencia atual | Decisao do diagnostico |
|---|---|---|
| Agenda | O app possui `AgendaPage` separada em `app.js`. Nesta pagina aparece `agenda-vazio` apenas como classe CSS/texto de lista de servicos. | Nao criar `AgendaSection` funcional sem uma decisao de produto. |
| Portfolio | O historico mostra `af0dac8` removendo `fetchPortfolio` morto e `c4c38c8` removendo KPIs/portfolio. Testes ainda citam IDs KPI/portfolio legados. | Tratar `PortfolioSection` como placeholder legado. |
| Analytics | Nao ha fetch/render/telemetria de analytics dedicado no arquivo. `#formatarNumero` parece remanescente de KPIs. | Tratar `AnalyticsSection` como placeholder ate existir responsabilidade real. |

## Grafo de acoplamento

Legenda: `->` significa que o grupo da linha conhece estado, metodo ou side effect do grupo da coluna.

| Origem \ destino | Shell | Stories | Team/Invite | Queue | Notify/Push | Settings | GPS | Status |
|---|---|---|---|---|---|---|---|---|
| Shell | - | -> | -> | -> | -> | -> | -> | -> |
| Stories | -> | - |  |  | toast |  |  | header cover |
| Team/Invite | shell refs |  | - | -> | toast |  |  | logo/name |
| Queue | -> |  | render equipe | - | -> | servicos/mensalistas |  |  |
| Notify/Push | -> |  |  | -> | - |  |  | shop logo |
| Settings | -> | media P2P | invite logo/name | servicos | toast | - |  | info/header |
| GPS | -> |  |  |  | toast | helpers editaveis | - | info card |
| Status | shell refs | cover ref | invite logo |  | DOM event/toast |  |  | - |

Vazamentos mais relevantes:

1. `#carregar()` e um orquestrador com fanout direto para todas as secoes.
2. `#renderEquipe()` pertence a equipe visual, mas recebe fila e cria cadeiras; extrair somente "Equipe" deixa fila sem renderer.
3. `#fluxoSentar()` usa `#servicos` vindo de Settings e chama BFF de mensalistas; `#fluxoFinalizar()` chama Financeiro.
4. Handlers de push e notificacao removem/confirmam fila e forcam rerender de equipe.
5. Upload/settings altera refs de cabecalho, convite, info card e cache consumido por fila.
6. Status altera um evento global que outros widgets do DOM escutam.

## Hotspots de regressao

### Evidencia de historico

`git log --follow --numstat` mostra que o arquivo nasceu em 18/04/2026 e continuou recebendo mudancas grandes e frequentes:

- `3591f4e` adicionou stories/config/upload com `+465/-119`.
- `7f348d3` adicionou sub-telas GPS/config com `+210/-36`.
- `c4c38c8`, `988f027`, `669cf35`, `383fed1` e commits vizinhos remodelaram equipe/cadeiras em 02/05/2026.
- A familia de commits de 06/05 a 19/05 sobre fila, realtime e push inclui fixes de subscribe, polling, retorno a tela, confirmacao de presenca, push realtime e notificacao da cadeira.
- Upload/config recebeu fixes sucessivos de bucket/storage, depois migracao BFF de logo/capa em 20/05/2026.
- GPS teve adicoes e correcoes em 21/04, 17/05 e 18/05, incluindo salvamento via BFF/service.

### Blocos mais sensiveis

| Bloco | Linhas | Motivo |
|---|---|---|
| Realtime e rerender da fila | 470-556 | Canal, fallback polling, guard de concorrencia e cleanup dependem do lifecycle visual da tela. `git blame` concentra estes trechos em mudancas recentes de fila/realtime. |
| Clique e fluxos da cadeira | 565-748 | Mistura selecao de cliente, mensalista, corte, fila, financeiro, notificacao e rerender. Mudancas de mensalistas em 21/05 tocaram o fluxo ja instavel. |
| Push/notificacao de presenca | 758-1004 | Dedupe, push pendente, navegacao, eventos globais e comandos de fila. Houve fixes especificos em 19/05. |
| Config/itens/upload | 1658-2172 | CRUD de itens, previews pendentes, storage direto de item e BFF para logo/capa convivem no mesmo trecho. Houve mudancas em 19-21/05. |
| GPS/endereco | 2189-2399 | Junta geocodificacao, permissionamento de geolocation, cache local, mapa e persistencia. Historico tem varias correcaoes de salvamento. |

## Codigo morto ou suspeito

Isto e uma lista de suspeitas, nao uma lista de remocoes prontas.

| Suspeita | Evidencia | Risco antes de remover |
|---|---|---|
| `#formatarNumero()` | Declarado nas linhas 2407-2410 e nao e chamado pelo arquivo atual. Teste `MinhaBarbeariaPage - #formatarNumero (via KPIs)` apenas escreve em stub KPI. | Confirmar se KPIs/analytics voltarao ou remover junto com teste legado. |
| Refs/test stubs de KPI/portfolio | `tests/minha-barbearia-page.test.js` ainda cria `mb-kpi-*` e `mb-portfolio-grid`; `index.html` atual da pagina nao os usa para a tela atual. Historico registra remocao de portfolio. | Atualizar testes somente quando a decisao sobre placeholder de Portfolio/Analytics estiver fechada. |
| `#guardaIten` | Campo privado existe e recebe o drawer de itens no bind; verificar se o objeto precisa de lifecycle ou se apenas `#guardaBotoes` e indispensavel. | `GuardaIten` pode depender de side effects visuais nao visiveis por busca textual. |
| Observer de `bind()` | Criado inline e nunca desconectado no arquivo. | A pagina pode ser singleton; confirmar lifecycle do router antes de chamar isto de leak. |
| Fallbacks `typeof ... !== 'undefined'` | Protegem integracoes opcionais como `FonteSalao`, `GpsPanelMap`, `FinanceiroService`, `MessageService`. | Sao branches de compatibilidade, nao codigo morto comprovado. |

Handlers globais nao sao orfaos comprovados:

- `NotificationService`, `BarbeiroEsperaFluxo`, `AppBootstrap` e servicos de fila despacham/consomem os eventos `barberflow:*` referenciados por esta pagina.
- Os testes de push verificam explicitamente `#pushPendente`, `#processarPushPendente`, `#pushModalAtiva`, `#pushProcessados` e `#chavePush`.

## Proposta de quebra por dominio

Estrutura alvo sugerida:

```text
MinhaBarbeariaPage/
|- AgendaSection/              # placeholder ate decisao de produto
|- StorySection/
|- PortfolioSection/           # placeholder legado
|- NotificationSection/
|- QueueSection/
|- AnalyticsSection/           # placeholder ate existir responsabilidade real
|- SettingsSection/
|- LocationSection/            # adicao recomendada para GPS/endereco
|- TeamInviteSection/          # adicao recomendada para convite/equipe
`- MinhaBarbeariaPageShell
```

### Mapeamento exato para extracao

| Destino | Funcoes/linhas |
|---|---|
| `MinhaBarbeariaPageShell` | estado e constructor 24-56; `bind` 60-120; `#cacheRefs` 122-228 inicialmente; `#bindEventos` 230-289 inicialmente; `#carregar` 292-336 ate virar compositor; `#fetchMinhaBarbearia` 338-348; roteamento de subpainel `#abrirSub/#fecharSub` 1435-1471; skeleton/vazio/erro 2503-2516 |
| `StorySection` | `#fetchStoriesAtivos` 375-389; `#fetchQuotaHoje` 391-410; `#renderStoryCards` 1362-1406; `#onUploadMidia` 2035-2094 |
| `QueueSection` | `#iniciarRealtimeFila` 470-498; `#iniciarPollingFallback` 503-509; `#pararRealtimeFila` 514-523; `#reRenderEquipe` 528-556; `#onCadeiraClick` 565-588; `#fluxoSentar` 595-663; `#fluxoFinalizar` 669-726; `#fluxoEspera` 735-748; factories de cadeira/equipe 1015-1247 |
| `NotificationSection` | `#onClienteAusente` 758-838; `#fluxoClienteAtShop` 845-865; `#handlePushAction` 872-916; `#handlePushShowModal` 923-947; `#registrarPushPendente` 949-953; `#processarPushPendente` 955-965; `#chavePush` 967-969; `#onEsperaResolvida` 976-1004 |
| `SettingsSection` | `#fetchServicos` 350-359; `#renderServicos` 1408-1432; `#preencherConfigPanel` 1658-1718; produto/item 1720-1940; mensalista/config/save 1944-2031; logo/capa BFF 2106-2172; helpers genericos de editavel `#_toggleEl/#_fecharEl` 2454-2477 se o contrato de UI continuar compartilhado |
| `LocationSection` | `#separarEnderecoSalvo` 2176-2187; `#preencherGpsForm` 2189-2245; `#onCepInput` 2247-2250; `#buscarCep` 2252-2281; `#ativarGps` 2283-2309; `#salvarGps` 2311-2394; `#mostrarGpsMsg` 2396-2404; CEP helpers `#_toggleCepRow/#_fecharCepRow` 2479-2501 |
| `TeamInviteSection` | `#fetchBarbeiros` 361-373; `#renderEquipe` 412-462 if team renderer remains outside queue; convite 1474-1656; `#atualizarLogoConvite` 1353-1359 if invite owns logos |
| `StatusSection` or shell subcomponent | `#renderStatusAberto` 1252-1272; `#toggleStatusAberto` 1274-1313; `#renderCabecalho` 1315-1351; `#renderInfoCard` 2418-2452; `#escapeAttr` 2412-2416 if retained as shared render helper |
| `AgendaSection` | No current method. Do not move `AgendaPage` responsibilities into this page without a product decision. |
| `PortfolioSection` | No current method. Do not resurrect removed `fetchPortfolio` or KPI rendering by extraction. |
| `AnalyticsSection` | No current method. Decide whether `#formatarNumero` 2407-2410 is removed or becomes a real analytics formatter only after analytics scope exists. |

## Plano strangler incremental

1. Congelar contratos do shell.
   - Criar uma lista de refs/state entregues a secoes e capturar testes de comportamento existente antes de mover chamadas.
   - Preservar `bind()`, lifecycle de tela, subpainel ativo e `#carregar()` como shell.
2. Extrair stories/media.
   - A secao tem poucos callbacks externos: quota, render e upload. Manter recarga via callback do shell.
3. Extrair GPS/endereco para `LocationSection`.
   - Encapsular geocodificacao, geolocation, mapa e refs GPS; expor callback para atualizar info card/cache da shop.
4. Extrair settings/produtos.
   - Encapsular config panel, item rows, upload de logo/capa e servicos; expor evento/callback de `servicesChanged` para fila.
5. Separar push/notificacoes da fila.
   - `NotificationSection` passa a interpretar eventos/push e delegar comandos/refresh a uma porta da fila em vez de chamar rerender diretamente.
6. Extrair queue/cadeiras/realtime por ultimo.
   - Levar guard de concorrencia, canal/polling, factories e fluxos modais juntos para nao quebrar ordem temporal da fila.
7. Reduzir o shell.
   - Deixar shell com refs raiz, composicao das secoes, `#fetchMinhaBarbearia`, ativacao/desativacao e orquestracao de estado compartilhado.

Cada fase e deployavel sozinha se mantiver os eventos DOM existentes, a assinatura visual dos paineis e testes de status/push/fila existentes verdes.

## Revisao final e decisoes humanas

Agrupamentos arbitrarios ou ainda abertos:

- Equipe visual e fila compartilham o mesmo renderer. Separar `TeamInviteSection` de `QueueSection` exige decidir quem e dono das rows com cadeiras.
- `Status/Cabecalho/InfoCard` nao apareceu na arvore pedida, mas hoje tem responsabilidade suficiente para nao ficar escondido em Settings.
- `#atualizarLogoConvite()` pode morar no cabecalho, no convite ou num contrato de asset de barbearia.
- Helpers de lapis/inputs sao usados por settings e GPS; decidir se viram componente compartilhado de formulario editavel ou se ficam duplicados por secao nao e aceitavel.
- Agenda, Portfolio e Analytics nao possuem responsabilidades ativas nesta classe; criar secoes reais agora seria antecipacao de design.

Decisoes humanas antes de mexer:

1. Definir se a futura pasta segue exatamente as sete secoes solicitadas ou aceita `LocationSection`, `TeamInviteSection` e `StatusSection`.
2. Definir se a fila e dona da renderizacao da equipe com cadeiras ou se equipe fornece layout e fila apenas adapters de cadeira.
3. Definir se push/notificacao pode depender de uma porta de fila interna ou deve ficar em um mediator de eventos UI.
4. Decidir destino de legados KPI/portfolio nos testes e do formatter `#formatarNumero`.
5. Decidir se o upload de imagem de item continua direto ao storage no frontend durante a extracao ou entra no mesmo contrato BFF usado por logo/capa.
